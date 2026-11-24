export interface Env {
  DB: any; // Cloudflare D1 Database binding
  EMAIL: any; // Cloudflare Email Sending binding
  PITXMAIL_SECRET?: string;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseEmailAddress(raw: string): { address: string; name?: string } {
  const match = String(raw).trim().match(/^(?:(.*?)<)?([^<>\s]+@[^<>\s]+)>?$/);
  if (match) {
    const name = match[1]?.trim().replace(/^["']|["']$/g, "");
    return { address: match[2].toLowerCase(), name: name || undefined };
  }
  return { address: String(raw).trim().toLowerCase() };
}

async function authenticate(
  request: Request,
  env: Env
): Promise<{ organisationId: string; projectId: string } | null> {
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  const hash = await sha256Hex(token);
  const row: any = await env.DB.prepare(
    "SELECT id, organisation_id, project_id, expires_at FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL LIMIT 1"
  )
    .bind(hash)
    .first();
  if (!row) return null;
  if (row.expires_at && row.expires_at < Date.now()) return null;
  await env.DB.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?")
    .bind(Date.now(), row.id)
    .run();
  return { organisationId: row.organisation_id, projectId: row.project_id };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Idempotency-Key",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check (public)
    if (url.pathname === "/health" || url.pathname === "/api/health") {
      return new Response(
        JSON.stringify({
          status: "ok",
          service: "Pitxmail Worker",
          environment: "cloudflare-edge",
          timestamp: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Every /api/v1/* route requires a valid, non-revoked API key
    let auth: { organisationId: string; projectId: string } | null = null;
    if (url.pathname.startsWith("/api/v1/")) {
      auth = await authenticate(request, env);
      if (!auth) {
        return new Response(
          JSON.stringify({
            error: {
              message: "Missing or invalid API key. Send 'Authorization: Bearer pm_live_...'",
            },
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // GET /api/v1/emails (List messages from D1)
    if (url.pathname === "/api/v1/emails" && request.method === "GET") {
      try {
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);
        const { results } = await env.DB.prepare(
          "SELECT * FROM messages WHERE organisation_id = ? ORDER BY created_at DESC LIMIT ?"
        )
          .bind(auth!.organisationId, limit)
          .all();

        return new Response(
          JSON.stringify({ data: results || [], count: (results || []).length }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // GET /api/v1/emails/:id (Message detail + delivery attempts)
    const detailMatch = url.pathname.match(/^\/api\/v1\/emails\/([^/]+)$/);
    if (detailMatch && request.method === "GET") {
      try {
        const id = decodeURIComponent(detailMatch[1]);
        const msg = await env.DB.prepare(
          "SELECT * FROM messages WHERE id = ? AND organisation_id = ? LIMIT 1"
        )
          .bind(id, auth!.organisationId)
          .first();

        if (!msg) {
          return new Response(JSON.stringify({ error: "Message not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { results: attempts } = await env.DB.prepare(
          "SELECT * FROM delivery_attempts WHERE message_id = ? ORDER BY attempt_number DESC"
        )
          .bind(id)
          .all();

        return new Response(JSON.stringify({ message: msg, attempts: attempts || [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // POST /api/v1/emails/:id/retry (Retry an existing message in D1)
    const retryMatch = url.pathname.match(/^\/api\/v1\/emails\/([^/]+)\/retry$/);
    if (retryMatch && request.method === "POST") {
      try {
        const id = decodeURIComponent(retryMatch[1]);
        const msg: any = await env.DB.prepare(
          "SELECT * FROM messages WHERE id = ? AND organisation_id = ? LIMIT 1"
        )
          .bind(id, auth!.organisationId)
          .first();

        if (!msg) {
          return new Response(JSON.stringify({ error: "Message not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const recipients = String(msg.to_address || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const { address: fromAddr, name: fromName } = parseEmailAddress(
          msg.from_name ? `${msg.from_name} <${msg.from_address}>` : msg.from_address
        );
        const newRetryCount = Number(msg.retry_count || 0) + 1;
        const startedAt = Date.now();
        let deliveryStatus = "delivered";
        let errorReason: string | null = null;

        try {
          for (const recipient of recipients) {
            await env.EMAIL.send({
              to: recipient,
              from: fromName ? { email: fromAddr, name: fromName } : fromAddr,
              subject: msg.subject,
              text: msg.text_body || "",
              html: msg.html_body || "",
            });
          }
        } catch (cfErr: any) {
          deliveryStatus = "failed";
          errorReason =
            cfErr.message?.includes("domain was not found") ||
            cfErr.message?.includes("account config")
              ? `Sending domain (${fromAddr.split("@")[1] || fromAddr}) is not enabled in Cloudflare Email Sending yet: ${cfErr.message}`
              : cfErr.message;
        }

        const finishedAt = Date.now();
        await env.DB.prepare(
          `INSERT INTO delivery_attempts (
            id, message_id, attempt_number, provider, status, error_message, started_at, finished_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            `att_${finishedAt}_${Math.random().toString(36).slice(2, 6)}`,
            id,
            newRetryCount + 1,
            "cloudflare",
            deliveryStatus === "failed" ? "failed" : "success",
            errorReason,
            startedAt,
            finishedAt
          )
          .run();

        await env.DB.prepare(
          `UPDATE messages
           SET status = ?, provider = 'cloudflare', error_reason = ?, retry_count = ?, updated_at = ?
           WHERE id = ?`
        )
          .bind(deliveryStatus, errorReason, newRetryCount, finishedAt, id)
          .run();

        return new Response(
          JSON.stringify({
            message_id: id,
            success: deliveryStatus !== "failed",
            status: deliveryStatus,
            retry_count: newRetryCount,
            error: errorReason,
          }),
          {
            status: deliveryStatus === "failed" ? 422 : 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // POST /api/v1/emails (Dispatch email)
    if (url.pathname === "/api/v1/emails" && request.method === "POST") {
      try {
        const body: any = await request.json();

        if (!body.to || !body.subject || !body.from) {
          return new Response(
            JSON.stringify({ error: "Missing required fields (from, to, subject)" }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        const rawRecipients = Array.isArray(body.to) ? body.to : [body.to];
        const recipients = rawRecipients.map((r: string) => parseEmailAddress(r).address);
        const normalizedTo = recipients.join(", ");
        const { address: fromAddr, name: fromName } = parseEmailAddress(body.from);
        const msgId = `pm_cf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const now = Date.now();

        let deliveryStatus = "delivered";
        const providerName = "cloudflare";
        let errorReason: string | null = null;

        if (env.EMAIL && typeof env.EMAIL.send === "function") {
          try {
            for (const recipient of recipients) {
              await env.EMAIL.send({
                to: recipient,
                from: fromName ? { email: fromAddr, name: fromName } : fromAddr,
                subject: body.subject,
                text: body.text || "",
                html: body.html || "",
              });
            }
          } catch (cfErr: any) {
            console.warn("Cloudflare native send error:", cfErr.message);
            errorReason =
              cfErr.message?.includes("domain was not found") ||
              cfErr.message?.includes("account config")
                ? `Sending domain (${fromAddr.split("@")[1] || fromAddr}) is not enabled in Cloudflare Email Sending yet: ${cfErr.message}`
                : cfErr.message;
            deliveryStatus = "failed";
          }
        }

        if (env.DB) {
          try {
            await env.DB.prepare(
              `INSERT INTO messages (
                id, organisation_id, project_id, from_address, from_name, to_address,
                subject, html_body, text_body, status, provider, error_reason,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
              .bind(
                msgId,
                auth!.organisationId,
                auth!.projectId,
                fromAddr,
                fromName || null,
                normalizedTo,
                body.subject,
                body.html || "",
                body.text || "",
                deliveryStatus,
                providerName,
                errorReason,
                now,
                now
              )
              .run();

            await env.DB.prepare(
              `INSERT INTO delivery_attempts (
                id, message_id, attempt_number, provider, status, error_message, started_at, finished_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            )
              .bind(
                `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                msgId,
                1,
                providerName,
                deliveryStatus === "failed" ? "failed" : "success",
                errorReason,
                now,
                Date.now()
              )
              .run();
          } catch (dbErr: any) {
            console.error("D1 persistence error:", dbErr.message);
          }
        }

        return new Response(
          JSON.stringify({
            id: msgId,
            object: "email",
            status: deliveryStatus,
            provider: providerName,
            error: errorReason,
            created_at: new Date(now).toISOString(),
          }),
          {
            status: deliveryStatus === "failed" ? 422 : 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({ error: err.message || "Failed to dispatch email" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    return new Response(
      JSON.stringify({
        service: "Pitxmail Cloudflare Worker Edge API",
        endpoints: {
          send: "POST /api/v1/emails",
          list: "GET /api/v1/emails",
          detail: "GET /api/v1/emails/:id",
          retry: "POST /api/v1/emails/:id/retry",
          health: "GET /health",
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  },
};

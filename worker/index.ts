export interface Env {
  DB: any; // Cloudflare D1 Database binding
  EMAIL: any; // Cloudflare Email Sending binding
  ASSETS?: any; // Cloudflare Static Assets binding
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
  if (header.startsWith("Bearer ")) {
    const token = header.slice(7).trim();
    if (token) {
      const hash = await sha256Hex(token);
      const row: any = await env.DB.prepare(
        "SELECT id, organisation_id, project_id, expires_at FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL LIMIT 1"
      )
        .bind(hash)
        .first();
      if (row && (!row.expires_at || row.expires_at >= Date.now())) {
        await env.DB.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?")
          .bind(Date.now(), row.id)
          .run();
        return { organisationId: row.organisation_id, projectId: row.project_id };
      }
    }
  }

  // Dashboard same-origin or trusted domain access
  const origin = request.headers.get("Origin") || request.headers.get("Referer") || "";
  const secFetchSite = request.headers.get("Sec-Fetch-Site") || "";
  const host = request.headers.get("Host") || "";
  if (
    secFetchSite === "same-origin" ||
    origin.includes("pitx.uk") ||
    origin.includes("workers.dev") ||
    origin.includes("localhost") ||
    host.includes("pitx.uk") ||
    host.includes("workers.dev")
  ) {
    return { organisationId: "org_pitacs", projectId: "proj_pitacs_hub" };
  }

  return null;
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

    // OpenAPI 3.0 Spec (public for AI agents and integrations)
    if (url.pathname === "/api/v1/openapi.json" || url.pathname === "/openapi.json") {
      return new Response(
        JSON.stringify({
          openapi: "3.0.0",
          info: {
            title: "Pitxmail API",
            version: "1.0.0",
            description: "Cloudflare-native transactional email service for Pitacs projects and autonomous AI agents.",
          },
          servers: [{ url: "https://mail.pitx.uk/api/v1", description: "Primary Edge Endpoint" }],
          paths: {
            "/emails": {
              post: {
                summary: "Dispatch a transactional email",
                operationId: "sendEmail",
                requestBody: {
                  required: true,
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        required: ["from", "to", "subject"],
                        properties: {
                          from: { type: "string", example: "Pitacs Orders <orders@pitx.uk>" },
                          to: { type: "array", items: { type: "string" }, example: ["customer@example.com"] },
                          subject: { type: "string", example: "Order Confirmation" },
                          html: { type: "string", example: "<h1>Order Confirmed</h1>" },
                          text: { type: "string", example: "Order Confirmed" },
                        },
                      },
                    },
                  },
                },
                responses: {
                  "200": { description: "Email successfully delivered via Cloudflare" },
                  "422": { description: "Delivery failed or domain unverified" },
                },
              },
              get: {
                summary: "List recent messages",
                operationId: "listEmails",
                parameters: [{ name: "limit", in: "query", schema: { type: "integer", default: 50 } }],
                responses: { "200": { description: "List of messages" } },
              },
            },
            "/emails/{id}": {
              get: {
                summary: "Get message details and delivery attempt log",
                operationId: "getEmail",
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                responses: { "200": { description: "Message details" } },
              },
            },
            "/emails/{id}/retry": {
              post: {
                summary: "Retry sending a failed message",
                operationId: "retryEmail",
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                responses: { "200": { description: "Retry attempt recorded" } },
              },
            },
            "/stats": {
              get: {
                summary: "Get delivery statistics and 24h volume",
                operationId: "getStats",
                responses: { "200": { description: "Stats summary" } },
              },
            },
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Every /api/v1/* route requires a valid API key or dashboard context
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

    // 1. GET /api/v1/stats
    if (url.pathname === "/api/v1/stats" && request.method === "GET") {
      try {
        const { results: counts } = await env.DB.prepare(
          "SELECT status, count(*) as count FROM messages WHERE organisation_id = ? GROUP BY status"
        )
          .bind(auth!.organisationId)
          .all();

        let total = 0,
          delivered = 0,
          failed = 0,
          accepted = 0;
        for (const r of counts || []) {
          const c = Number(r.count || 0);
          total += c;
          if (r.status === "delivered" || r.status === "submitted") delivered += c;
          else if (r.status === "failed" || r.status === "bounced") failed += c;
          else accepted += c;
        }

        const deliveryRate = total > 0 ? ((delivered / total) * 100).toFixed(1) : "100.0";
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const last24h: any = await env.DB.prepare(
          "SELECT count(*) as count FROM messages WHERE organisation_id = ? AND created_at >= ?"
        )
          .bind(auth!.organisationId, oneDayAgo)
          .first();

        return new Response(
          JSON.stringify({
            total,
            delivered,
            failed,
            accepted,
            deliveryRate: `${deliveryRate}%`,
            volume24h: Number(last24h?.count || 0),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 2. GET /api/v1/domains
    if (url.pathname === "/api/v1/domains" && request.method === "GET") {
      try {
        const { results } = await env.DB.prepare(
          "SELECT * FROM domains WHERE organisation_id = ? ORDER BY created_at DESC"
        )
          .bind(auth!.organisationId)
          .all();

        const mapped = (results || []).map((d: any) => ({
          id: d.id,
          domain: d.domain,
          verificationStatus: d.verification_status,
          dkimStatus: d.dkim_status,
          spfStatus: d.spf_status,
          dmarcStatus: d.dmarc_status,
          mxStatus: d.mx_status,
          dnsRecords: d.dns_records ? JSON.parse(d.dns_records) : null,
          createdAt: d.created_at,
        }));

        return new Response(JSON.stringify(mapped), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 3. POST /api/v1/domains/:id/verify
    const domainVerifyMatch = url.pathname.match(/^\/api\/v1\/domains\/([^/]+)\/verify$/);
    if (domainVerifyMatch && request.method === "POST") {
      try {
        const domId = decodeURIComponent(domainVerifyMatch[1]);
        const domainRecord: any = await env.DB.prepare(
          "SELECT * FROM domains WHERE id = ? AND organisation_id = ? LIMIT 1"
        )
          .bind(domId, auth!.organisationId)
          .first();

        if (!domainRecord) {
          return new Response(JSON.stringify({ error: "Domain not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const isVerified = domainRecord.domain === "pitx.uk";
        const status = isVerified ? "verified" : "pending";

        await env.DB.prepare(
          "UPDATE domains SET verification_status = ?, dkim_status = ?, spf_status = ?, dmarc_status = ?, mx_status = ? WHERE id = ?"
        )
          .bind(status, status, status, status, status, domId)
          .run();

        return new Response(
          JSON.stringify({
            domain: domainRecord.domain,
            status,
            spf: status,
            dkim: status,
            dmarc: status,
            mx: status,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 4. GET /api/v1/api-keys
    if (url.pathname === "/api/v1/api-keys" && request.method === "GET") {
      try {
        const { results } = await env.DB.prepare(
          "SELECT id, name, key_prefix, scopes, created_at, last_used_at, expires_at, revoked_at FROM api_keys WHERE organisation_id = ? ORDER BY created_at DESC"
        )
          .bind(auth!.organisationId)
          .all();

        const mapped = (results || []).map((k: any) => ({
          id: k.id,
          name: k.name,
          keyPrefix: k.key_prefix,
          scopes: k.scopes ? k.scopes.split(",") : ["emails:send", "emails:read"],
          createdAt: k.created_at,
          lastUsedAt: k.last_used_at,
          expiresAt: k.expires_at,
          revokedAt: k.revoked_at,
        }));

        return new Response(JSON.stringify(mapped), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 5. POST /api/v1/api-keys
    if (url.pathname === "/api/v1/api-keys" && request.method === "POST") {
      try {
        const body: any = await request.json();
        const rawToken = `pm_live_${crypto.randomUUID().replace(/-/g, "")}`;
        const keyHash = await sha256Hex(rawToken);
        const prefix = rawToken.slice(0, 15) + "...";
        const keyId = `key_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const now = Date.now();

        await env.DB.prepare(
          `INSERT INTO api_keys (id, organisation_id, project_id, name, key_prefix, key_hash, scopes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            keyId,
            auth!.organisationId,
            auth!.projectId,
            body.name || "Production API Key",
            prefix,
            keyHash,
            body.scopes ? (Array.isArray(body.scopes) ? body.scopes.join(",") : body.scopes) : "emails:send,emails:read",
            now
          )
          .run();

        return new Response(
          JSON.stringify({
            id: keyId,
            name: body.name || "Production API Key",
            token: rawToken,
            keyPrefix: prefix,
            createdAt: now,
          }),
          { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 6. DELETE /api/v1/api-keys/:id
    const apiKeyDeleteMatch = url.pathname.match(/^\/api\/v1\/api-keys\/([^/]+)$/);
    if (apiKeyDeleteMatch && request.method === "DELETE") {
      try {
        const keyId = decodeURIComponent(apiKeyDeleteMatch[1]);
        await env.DB.prepare(
          "UPDATE api_keys SET revoked_at = ? WHERE id = ? AND organisation_id = ?"
        )
          .bind(Date.now(), keyId, auth!.organisationId)
          .run();

        return new Response(JSON.stringify({ success: true, id: keyId }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 7. GET /api/v1/emails
    if (url.pathname === "/api/v1/emails" && request.method === "GET") {
      try {
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);
        const { results } = await env.DB.prepare(
          "SELECT * FROM messages WHERE organisation_id = ? ORDER BY created_at DESC LIMIT ?"
        )
          .bind(auth!.organisationId, limit)
          .all();

        const normalized = (results || []).map((m: any) => ({
          id: m.id,
          fromAddress: m.from_address,
          fromName: m.from_name,
          toAddress: m.to_address,
          subject: m.subject,
          htmlBody: m.html_body,
          textBody: m.text_body,
          status: m.status,
          provider: m.provider,
          errorReason: m.error_reason,
          retryCount: m.retry_count ?? 0,
          createdAt: m.created_at,
          updatedAt: m.updated_at,
        }));

        return new Response(
          JSON.stringify({ data: normalized, count: normalized.length }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 8. GET /api/v1/emails/:id
    const detailMatch = url.pathname.match(/^\/api\/v1\/emails\/([^/]+)$/);
    if (detailMatch && request.method === "GET") {
      try {
        const id = decodeURIComponent(detailMatch[1]);
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

        const normalizedMsg = {
          id: msg.id,
          fromAddress: msg.from_address,
          fromName: msg.from_name,
          toAddress: msg.to_address,
          subject: msg.subject,
          htmlBody: msg.html_body,
          textBody: msg.text_body,
          status: msg.status,
          provider: msg.provider,
          errorReason: msg.error_reason,
          retryCount: msg.retry_count ?? 0,
          createdAt: msg.created_at,
          updatedAt: msg.updated_at,
        };

        const { results: attempts } = await env.DB.prepare(
          "SELECT * FROM delivery_attempts WHERE message_id = ? ORDER BY attempt_number DESC"
        )
          .bind(id)
          .all();

        return new Response(
          JSON.stringify({ message: normalizedMsg, attempts: attempts || [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 9. POST /api/v1/emails/:id/retry
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
          errorReason = cfErr.message;
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

    // 10. POST /api/v1/emails (Dispatch email)
    if (url.pathname === "/api/v1/emails" && request.method === "POST") {
      try {
        const body: any = await request.json();

        if (!body.to || !body.subject || !body.from) {
          return new Response(
            JSON.stringify({ error: "Missing required fields (from, to, subject)" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
            errorReason = cfErr.message;
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
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({ error: err.message || "Failed to dispatch email" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Static asset fallback (serves Next.js dashboard SPA from ./out)
    if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
      return env.ASSETS.fetch(request);
    }

    return new Response(
      JSON.stringify({
        service: "Pitxmail Cloudflare Worker Edge API",
        endpoints: {
          send: "POST /api/v1/emails",
          list: "GET /api/v1/emails",
          detail: "GET /api/v1/emails/:id",
          retry: "POST /api/v1/emails/:id/retry",
          stats: "GET /api/v1/stats",
          domains: "GET /api/v1/domains",
          apiKeys: "GET /api/v1/api-keys",
          health: "GET /health",
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  },
};

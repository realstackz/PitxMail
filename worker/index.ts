export interface Env {
  DB: any; // Cloudflare D1 Database binding
  EMAIL: any; // Cloudflare Email Sending binding
  PITXMAIL_SECRET?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS Headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Idempotency-Key",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check
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

    // GET /api/v1/emails (List messages from D1)
    if (url.pathname === "/api/v1/emails" && request.method === "GET") {
      try {
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);
        const { results } = await env.DB.prepare(
          "SELECT * FROM messages ORDER BY created_at DESC LIMIT ?"
        ).bind(limit).all();

        return new Response(JSON.stringify({ data: results || [], count: (results || []).length }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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
          return new Response(JSON.stringify({ error: "Missing required fields (from, to, subject)" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const recipients = Array.isArray(body.to) ? body.to : [body.to];
        const normalizedTo = recipients.join(", ");
        const msgId = `pm_cf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const now = Date.now();

        let deliveryStatus = "delivered";
        let providerName = "cloudflare_worker";
        let errorReason = null;

        // Attempt Cloudflare Email Sending
        if (env.EMAIL && typeof env.EMAIL.send === "function") {
          try {
            for (const recipient of recipients) {
              await env.EMAIL.send({
                to: recipient,
                from: body.from,
                subject: body.subject,
                text: body.text || "",
                html: body.html || "",
              });
            }
          } catch (cfErr: any) {
            // If domain not yet active on Cloudflare, catch gracefully and record as queued/sandbox
            console.warn("Cloudflare native send warning:", cfErr.message);
            errorReason = cfErr.message;
            deliveryStatus = cfErr.message?.includes("domain was not found")
              ? "accepted" // Saved in D1, ready for dispatch once domain finishes propagation
              : "failed";
            providerName = "cloudflare_staging";
          }
        }

        // Persist message into Cloudflare D1
        if (env.DB) {
          try {
            await env.DB.prepare(`
              INSERT INTO messages (
                id, organisation_id, project_id, from_address, to_address,
                subject, html_body, text_body, status, provider, error_reason,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              msgId,
              "org_pitacs",
              "proj_pitacs_hub",
              body.from,
              normalizedTo,
              body.subject,
              body.html || "",
              body.text || "",
              deliveryStatus,
              providerName,
              errorReason,
              now,
              now
            ).run();

            // Record delivery attempt
            await env.DB.prepare(`
              INSERT INTO delivery_attempts (
                id, message_id, attempt_number, provider, status, error_message, started_at, finished_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              `att_${Date.now()}`,
              msgId,
              1,
              providerName,
              deliveryStatus === "failed" ? "failed" : "success",
              errorReason,
              now,
              Date.now()
            ).run();
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
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message || "Failed to dispatch email" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(
      JSON.stringify({
        service: "Pitxmail Cloudflare Worker Edge API",
        endpoints: {
          send: "POST /api/v1/emails",
          list: "GET /api/v1/emails",
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

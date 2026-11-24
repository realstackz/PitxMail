export interface Env {
  DB: any; // Cloudflare D1 Database binding
  EMAIL: any; // Cloudflare Email Sending binding
  PITXMAIL_SECRET?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/health" || url.pathname === "/api/health") {
      return new Response(JSON.stringify({ status: "ok", service: "Pitxmail Worker", timestamp: new Date().toISOString() }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, Idempotency-Key",
        },
      });
    }

    // Native Cloudflare Worker Email Dispatch
    if (url.pathname === "/api/v1/emails" && request.method === "POST") {
      try {
        const body: any = await request.json();

        if (!body.to || !body.subject || !body.from) {
          return new Response(JSON.stringify({ error: "Missing required fields (from, to, subject)" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const recipients = Array.isArray(body.to) ? body.to : [body.to];

        if (env.EMAIL && typeof env.EMAIL.send === "function") {
          for (const recipient of recipients) {
            await env.EMAIL.send({
              to: recipient,
              from: body.from,
              subject: body.subject,
              text: body.text || "",
              html: body.html || "",
            });
          }
        }

        const msgId = `pm_cf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        return new Response(
          JSON.stringify({
            id: msgId,
            object: "email",
            status: "delivered",
            provider: "cloudflare_worker",
            created_at: new Date().toISOString(),
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message || "Failed to dispatch email" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ message: "Pitxmail Cloudflare Worker API. Use /api/v1/emails to dispatch." }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
};

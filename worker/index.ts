export interface Env {
  DB: any; // Cloudflare D1 Database binding
  EMAIL: any; // Cloudflare Email Sending binding
  ASSETS?: any; // Cloudflare Static Assets binding
  PITXMAIL_SECRET?: string;
  RESEND_API_KEY?: string;
  RESEND_DAILY_LIMIT?: string;
  RESEND_MONTHLY_LIMIT?: string;
  RESEND_WEBHOOK_SECRET?: string;
}

interface DeliveryAttemptRecord {
  provider: string;
  status: "success" | "failed";
  errorMessage: string | null;
  providerResponse: string | null;
  startedAt: number;
  finishedAt: number;
}

async function dispatchWithFailover(
  env: Env,
  params: {
    fromAddr: string;
    fromName?: string;
    recipients: string[];
    cc?: string[] | null;
    bcc?: string[] | null;
    replyTo?: string | null;
    subject: string;
    html: string;
    text: string;
  }
): Promise<{
  status: "delivered" | "failed";
  provider: "resend" | "cloudflare";
  providerMessageId: string | null;
  errorReason: string | null;
  attempts: DeliveryAttemptRecord[];
}> {
  const attempts: DeliveryAttemptRecord[] = [];
  const dailyLimit = Number(env.RESEND_DAILY_LIMIT || 99);
  const monthlyLimit = Number(env.RESEND_MONTHLY_LIMIT || 2850);

  // 0. Pre-Flight Suppression Guard: block known bad/bounced recipients before touching mail servers
  for (const recipient of params.recipients) {
    const cleanRec = recipient.trim().toLowerCase();
    try {
      const sup: any = await env.DB.prepare(
        "SELECT reason FROM suppressions WHERE lower(email) = ? LIMIT 1"
      )
        .bind(cleanRec)
        .first();
      if (sup) {
        return {
          status: "failed",
          provider: "cloudflare",
          providerMessageId: null,
          errorReason: `Recipient '${cleanRec}' is suppressed (${sup.reason}). Dispatch aborted to protect domain sending reputation.`,
          attempts: [{
            provider: "cloudflare",
            status: "failed",
            errorMessage: `Recipient '${cleanRec}' is suppressed (${sup.reason})`,
            providerResponse: null,
            startedAt: Date.now(),
            finishedAt: Date.now(),
          }],
        };
      }
    } catch {}
  }

  // 1. Primary: Resend (free daily/monthly tier) if configured, not paused, and under caps
  if (env.RESEND_API_KEY) {
    let canUseResend = true;
    const now = Date.now();
    try {
      await env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS provider_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER NOT NULL)"
      ).run();
      const paused: any = await env.DB.prepare(
        "SELECT expires_at FROM provider_state WHERE key = 'resend_paused_until' LIMIT 1"
      ).first();
      if (paused && paused.expires_at > now) {
        canUseResend = false;
      }

      if (canUseResend) {
        const d = new Date();
        const startOfUtcDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        const startOfUtcMonth = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
        const dayRow: any = await env.DB.prepare(
          "SELECT count(*) as count FROM messages WHERE provider = 'resend' AND created_at >= ?"
        )
          .bind(startOfUtcDay)
          .first();
        const monthRow: any = await env.DB.prepare(
          "SELECT count(*) as count FROM messages WHERE provider = 'resend' AND created_at >= ?"
        )
          .bind(startOfUtcMonth)
          .first();

        if (Number(dayRow?.count || 0) >= dailyLimit || Number(monthRow?.count || 0) >= monthlyLimit) {
          canUseResend = false;
        }
      }
    } catch {}

    if (canUseResend) {
      const startedAt = Date.now();
      try {
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: params.fromName ? `${params.fromName} <${params.fromAddr}>` : params.fromAddr,
            to: params.recipients,
            ...(params.cc?.length ? { cc: params.cc } : {}),
            ...(params.bcc?.length ? { bcc: params.bcc } : {}),
            ...(params.replyTo ? { reply_to: params.replyTo } : {}),
            subject: params.subject,
            html: params.html || undefined,
            text: params.text || undefined,
          }),
        });
        const resendData: any = await resendRes.json().catch(() => ({}));
        const finishedAt = Date.now();

        if (resendRes.ok && resendData?.id) {
          attempts.push({
            provider: "resend",
            status: "success",
            errorMessage: null,
            providerResponse: JSON.stringify(resendData),
            startedAt,
            finishedAt,
          });
          return {
            status: "delivered",
            provider: "resend",
            providerMessageId: resendData.id,
            errorReason: null,
            attempts,
          };
        }

        const errMsg = String(resendData?.message || resendData?.name || `Resend HTTP ${resendRes.status}`);
        // Trip circuit breaker until next UTC midnight if daily/monthly quota is exhausted
        if (
          resendRes.status === 429 &&
          /daily|monthly|quota/i.test(errMsg)
        ) {
          try {
            const d = new Date();
            const nextUtcMidnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
            await env.DB.prepare(
              "INSERT OR REPLACE INTO provider_state (key, value, expires_at) VALUES ('resend_paused_until', ?, ?)"
            )
              .bind(errMsg, nextUtcMidnight)
              .run();
          } catch {}
        }

        attempts.push({
          provider: "resend",
          status: "failed",
          errorMessage: errMsg,
          providerResponse: JSON.stringify(resendData),
          startedAt,
          finishedAt,
        });
      } catch (err: any) {
        attempts.push({
          provider: "resend",
          status: "failed",
          errorMessage: err.message || "Resend request failed",
          providerResponse: null,
          startedAt,
          finishedAt: Date.now(),
        });
      }
    }
  }

  // 2. Failover / Overflow: Cloudflare Email Sending
  const cfStart = Date.now();
  let cfStatus: "delivered" | "failed" = "delivered";
  let cfError: string | null = null;
  if (env.EMAIL && typeof env.EMAIL.send === "function") {
    try {
      for (const recipient of params.recipients) {
        await env.EMAIL.send({
          to: recipient,
          from: params.fromName ? { email: params.fromAddr, name: params.fromName } : params.fromAddr,
          subject: params.subject,
          text: params.text || "",
          html: params.html || "",
        });
      }
    } catch (cfErr: any) {
      cfStatus = "failed";
      cfError = cfErr.message;
      // Auto-suppress any recipient that triggers a Cloudflare bounce or suppression error
      if (/suppress|bounce|spam|reject|not a verified|not found|550|invalid|disabled/i.test(cfErr.message || "")) {
        try {
          const now = Date.now();
          for (const recipient of params.recipients) {
            await env.DB.prepare(
              "INSERT OR REPLACE INTO suppressions (id, organisation_id, email, reason, created_at) VALUES (?, 'org_pitacs', ?, ?, ?)"
            )
              .bind(
                `sup_${now}_${Math.random().toString(36).slice(2, 6)}`,
                recipient.trim().toLowerCase(),
                `cloudflare_auto: ${String(cfErr.message || "").slice(0, 120)}`,
                now
              )
              .run();
          }
        } catch {}
      }
    }
  }
  attempts.push({
    provider: "cloudflare",
    status: cfStatus === "failed" ? "failed" : "success",
    errorMessage: cfError,
    providerResponse: null,
    startedAt: cfStart,
    finishedAt: Date.now(),
  });

  return {
    status: cfStatus,
    provider: "cloudflare",
    providerMessageId: null,
    errorReason: cfError,
    attempts,
  };
}

interface AuthContext {
  type: "api_key" | "session";
  organisationId: string;
  projectId: string;
  scopes: string[];
  userId?: string;
}

const ALLOWED_DASHBOARD_ORIGINS = new Set([
  "https://mail.pitx.uk",
  "https://pitxmail.pitacsdev.workers.dev",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function buildResponseHeaders(
  request: Request,
  extra: Record<string, string> = {}
): Record<string, string> {
  const origin = request.headers.get("Origin") || "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Idempotency-Key",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    ...extra,
  };

  if (origin && ALLOWED_DASHBOARD_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
    headers["Vary"] = "Origin";
  } else {
    headers["Access-Control-Allow-Origin"] = "*";
  }

  return headers;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function pbkdf2Hash(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  const hex = [...new Uint8Array(derived)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `pbkdf2_100000$${hex}`;
}

/**
 * Verify a Resend (Svix) webhook signature.
 * Signed content = `${svix-id}.${svix-timestamp}.${rawBody}`, HMAC-SHA256 with the base64 secret after "whsec_".
 */
async function verifySvixSignature(secret: string, headers: Headers, payload: string): Promise<boolean> {
  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sigHeader = headers.get("svix-signature");
  if (!id || !ts || !sigHeader) return false;

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) return false;

  try {
    const keyB64 = secret.startsWith("whsec_") ? secret.slice(6) : secret;
    const keyBytes = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${payload}`));
    const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
    return sigHeader.split(" ").some((part) => {
      const [version, value] = part.split(",");
      return version === "v1" && !!value && timingSafeEqualStr(value, expected);
    });
  } catch {
    return false;
  }
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function verifyPassword(
  password: string,
  salt: string,
  storedHash: string
): Promise<{ valid: boolean; needsUpgrade: boolean }> {
  if (storedHash.startsWith("pbkdf2_100000$")) {
    const calculated = await pbkdf2Hash(password, salt);
    return { valid: timingSafeEqualStr(calculated, storedHash), needsUpgrade: false };
  }
  const legacyCalculated = await sha256Hex(password + ":" + salt);
  return { valid: timingSafeEqualStr(legacyCalculated, storedHash), needsUpgrade: true };
}

function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(email.trim());
}

function parseEmailAddress(raw: string): { address: string; name?: string } {
  const match = String(raw).trim().match(/^(?:(.*?)<)?([^<>\s]+@[^<>\s]+)>?$/);
  if (match) {
    const name = match[1]?.trim().replace(/^["']|["']$/g, "");
    return { address: match[2].toLowerCase(), name: name || undefined };
  }
  return { address: String(raw).trim().toLowerCase() };
}

// 1x1 Transparent GIF representation (43 bytes) for open tracking
const TRANSPARENT_1X1_GIF_B64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function getTransparentGifResponse(): Response {
  const bin = atob(TRANSPARENT_1X1_GIF_B64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function injectTrackingPixel(html: string, messageId: string, origin = "https://mail.pitx.uk"): string {
  const pixel = `<img src="${origin}/api/v1/track/open/${messageId}.png" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />`;
  if (!html || !html.trim()) return pixel;
  if (html.includes("</body>")) {
    return html.replace("</body>", `${pixel}</body>`);
  }
  return `${html}${pixel}`;
}

async function getSessionUser(request: Request, env: Env): Promise<any | null> {
  const authHeader = request.headers.get("Authorization") || "";
  let token: string | null = null;
  if (authHeader.startsWith("Bearer pm_sess_")) {
    token = authHeader.slice(7).trim();
  } else {
    token = parseCookie(request.headers.get("Cookie"), "pitxmail_session");
  }
  if (!token) return null;

  try {
    const sessionRow: any = await env.DB.prepare(
      "SELECT s.id as session_id, s.expires_at, u.id as user_id, u.email, u.name, u.role, u.must_change_password FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.id = ? LIMIT 1"
    )
      .bind(token)
      .first();

    if (!sessionRow) return null;
    if (sessionRow.expires_at < Date.now()) {
      await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(token).run();
      return null;
    }

    return {
      id: sessionRow.user_id,
      email: sessionRow.email,
      name: sessionRow.name,
      role: sessionRow.role,
      mustChangePassword: Boolean(sessionRow.must_change_password),
      sessionId: sessionRow.session_id,
    };
  } catch {
    return null;
  }
}

async function authenticate(request: Request, env: Env): Promise<AuthContext | null> {
  const header = request.headers.get("Authorization") || "";
  if (header.startsWith("Bearer pm_live_") || header.startsWith("Bearer pm_test_")) {
    const token = header.slice(7).trim();
    if (token) {
      const hash = await sha256Hex(token);
      const row: any = await env.DB.prepare(
        "SELECT id, organisation_id, project_id, scopes, expires_at FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL LIMIT 1"
      )
        .bind(hash)
        .first();
      if (row && (!row.expires_at || row.expires_at >= Date.now())) {
        await env.DB.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?")
          .bind(Date.now(), row.id)
          .run();
        const scopes = String(row.scopes || "emails:send,emails:read")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        return {
          type: "api_key",
          organisationId: row.organisation_id,
          projectId: row.project_id,
          scopes,
        };
      }
    }
    return null;
  }

  // Session user auth (must have completed initial password change)
  const sessionUser = await getSessionUser(request, env);
  if (sessionUser && !sessionUser.mustChangePassword) {
    return {
      type: "session",
      organisationId: "org_pitacs",
      projectId: "proj_pitacs_hub",
      scopes: ["admin", "emails:send", "emails:read"],
      userId: sessionUser.id,
    };
  }

  return null;
}

function hasScope(auth: AuthContext, scope: string): boolean {
  return auth.type === "session" || auth.scopes.includes("admin") || auth.scopes.includes(scope);
}

async function queryDns(name: string, type: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`,
      { headers: { Accept: "application/dns-json" } }
    );
    if (!res.ok) return [];
    const data: any = await res.json();
    return (data.Answer || []).map((a: any) => String(a.data || ""));
  } catch {
    return [];
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = buildResponseHeaders(request);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
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

    // Resend Webhook Sync (POST /api/webhooks/resend)
    if (url.pathname === "/api/webhooks/resend" && request.method === "POST") {
      try {
        // Reject unsigned/forged events: this endpoint can trigger re-sends and suppressions
        if (!env.RESEND_WEBHOOK_SECRET) {
          return new Response(JSON.stringify({ error: "Webhook signing secret not configured" }), {
            status: 503,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const rawBody = await request.text();
        const signatureOk = await verifySvixSignature(env.RESEND_WEBHOOK_SECRET, request.headers, rawBody);
        if (!signatureOk) {
          return new Response(JSON.stringify({ error: "Invalid webhook signature" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const event: any = JSON.parse(rawBody);
        const eventType = String(event?.type || "");
        const emailId = String(event?.data?.email_id || "");
        if (!eventType || !emailId) {
          return new Response(JSON.stringify({ ok: true, ignored: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const msg: any = await env.DB.prepare(
          "SELECT * FROM messages WHERE provider_message_id = ? LIMIT 1"
        )
          .bind(emailId)
          .first();

        if (!msg) {
          return new Response(JSON.stringify({ ok: true, unmatched: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const now = Date.now();
        if (eventType === "email.delivered") {
          await env.DB.prepare(
            "UPDATE messages SET status = 'delivered', delivered_at = ?, updated_at = ? WHERE id = ?"
          )
            .bind(now, now, msg.id)
            .run();
        } else if (eventType === "email.bounced" || eventType === "email.complained") {
          const newStatus = eventType === "email.bounced" ? "bounced" : "complained";
          const reason = event?.data?.bounce?.message || eventType;
          await env.DB.prepare(
            "UPDATE messages SET status = ?, error_reason = ?, updated_at = ? WHERE id = ?"
          )
            .bind(newStatus, reason, now, msg.id)
            .run();

          const recipients = String(msg.to_address || "").split(",").map((s) => s.trim()).filter(Boolean);
          for (const rec of recipients) {
            await env.DB.prepare(
              "INSERT OR IGNORE INTO suppressions (id, organisation_id, email, reason, created_at) VALUES (?, ?, ?, ?, ?)"
            )
              .bind(`sup_${now}_${Math.random().toString(36).slice(2, 6)}`, msg.organisation_id, rec.toLowerCase(), newStatus, now)
              .run();
          }
        } else if (
          (eventType === "email.failed" || eventType === "email.delivery_delayed") &&
          Number(msg.retry_count || 0) === 0 &&
          env.EMAIL &&
          typeof env.EMAIL.send === "function"
        ) {
          // Automatic failover to Cloudflare Email Sending if Resend fails or delays
          const recipients = String(msg.to_address || "").split(",").map((s) => s.trim()).filter(Boolean);
          const cfStart = Date.now();
          let cfStatus: "delivered" | "failed" = "delivered";
          let cfErr: string | null = null;
          try {
            for (const rec of recipients) {
              await env.EMAIL.send({
                to: rec,
                from: msg.from_name ? { email: msg.from_address, name: msg.from_name } : msg.from_address,
                subject: msg.subject,
                text: msg.text_body || "",
                html: msg.html_body || "",
              });
            }
          } catch (e: any) {
            cfStatus = "failed";
            cfErr = e.message;
          }
          const cfEnd = Date.now();
          await env.DB.prepare(
            `INSERT INTO delivery_attempts (
              id, message_id, attempt_number, provider, status, error_message, provider_response, started_at, finished_at
            ) VALUES (?, ?, ?, 'cloudflare', ?, ?, ?, ?, ?)`
          )
            .bind(
              `att_${cfEnd}_${Math.random().toString(36).slice(2, 6)}`,
              msg.id,
              2,
              cfStatus === "delivered" ? "success" : "failed",
              cfErr,
              `Auto-failover from Resend (${eventType})`,
              cfStart,
              cfEnd
            )
            .run();
          await env.DB.prepare(
            "UPDATE messages SET status = ?, provider = 'cloudflare', error_reason = ?, retry_count = 1, updated_at = ? WHERE id = ?"
          )
            .bind(cfStatus, cfErr, cfEnd, msg.id)
            .run();
        }

        return new Response(JSON.stringify({ ok: true, processed: eventType }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // OpenAPI 3.0 Spec
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
                parameters: [
                  { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 100 } },
                  { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
                  { name: "status", in: "query", schema: { type: "string", enum: ["delivered", "failed", "bounced", "complained", "simulated"] } },
                  { name: "provider", in: "query", schema: { type: "string", enum: ["resend", "cloudflare", "sandbox"] } },
                  { name: "q", in: "query", description: "Search recipient, subject, sender or ID", schema: { type: "string" } },
                  { name: "since", in: "query", description: "Unix ms lower bound", schema: { type: "integer" } },
                  { name: "until", in: "query", description: "Unix ms upper bound", schema: { type: "integer" } },
                ],
                responses: { "200": { description: "List of messages" } },
              },
            },
            "/emails/batch": {
              post: {
                summary: "Dispatch a batch of emails (up to 100 in a single call)",
                operationId: "sendBatchEmails",
                requestBody: {
                  required: true,
                  content: {
                    "application/json": {
                      schema: {
                        type: "array",
                        items: {
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
                },
                responses: {
                  "200": { description: "Batch processed; returns array of email result objects" },
                  "400": { description: "Invalid payload or exceeds 100 items" },
                },
              },
            },
            "/track/open/{id}": {
              get: {
                summary: "Public read-receipt tracking pixel (1x1 transparent GIF)",
                operationId: "trackEmailOpen",
                parameters: [
                  { name: "id", in: "path", required: true, description: "Message ID", schema: { type: "string" } },
                ],
                responses: {
                  "200": { description: "1x1 transparent GIF returned; opened_at timestamp updated" },
                },
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
            "/emails/{id}/eml": {
              get: {
                summary: "Download the message as a raw RFC-822 .eml file",
                operationId: "downloadEml",
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
                responses: { "200": { description: "message/rfc822 file" } },
              },
            },
            "/suppressions": {
              get: {
                summary: "List suppressed recipients (bounces, complaints, manual)",
                operationId: "listSuppressions",
                responses: { "200": { description: "Suppression list" } },
              },
              post: {
                summary: "Manually suppress a recipient (admin)",
                operationId: "addSuppression",
                requestBody: {
                  required: true,
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        required: ["email"],
                        properties: { email: { type: "string" }, reason: { type: "string", example: "manual" } },
                      },
                    },
                  },
                },
                responses: { "201": { description: "Suppressed" } },
              },
            },
            "/suppressions/{idOrEmail}": {
              delete: {
                summary: "Remove a recipient from the suppression list (admin)",
                operationId: "removeSuppression",
                parameters: [{ name: "idOrEmail", in: "path", required: true, schema: { type: "string" } }],
                responses: { "200": { description: "Removed" } },
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

    // ==========================================
    // AUTHENTICATION ROUTES
    // ==========================================

    // POST /api/auth/login
    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      try {
        const body: any = await request.json();
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");

        if (!email || !password) {
          return new Response(JSON.stringify({ error: "Email and password are required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Brute-force rate limit (max 10 failed attempts per 15 mins per IP+email)
        const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
        const rateKey = `login:${clientIp}:${email}`;
        const now = Date.now();
        try {
          await env.DB.prepare(
            "CREATE TABLE IF NOT EXISTS auth_rate_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset_at INTEGER NOT NULL)"
          ).run();
          const rl: any = await env.DB.prepare(
            "SELECT attempts, reset_at FROM auth_rate_limits WHERE key = ? LIMIT 1"
          )
            .bind(rateKey)
            .first();
          if (rl && rl.reset_at > now && rl.attempts >= 10) {
            return new Response(
              JSON.stringify({ error: "Too many failed login attempts. Try again in 15 minutes." }),
              { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } catch {}

        const user: any = await env.DB.prepare(
          "SELECT * FROM users WHERE lower(email) = lower(?) LIMIT 1"
        )
          .bind(email)
          .first();

        const recordFailedAttempt = async () => {
          try {
            const windowMs = 15 * 60 * 1000;
            const existing: any = await env.DB.prepare(
              "SELECT attempts, reset_at FROM auth_rate_limits WHERE key = ? LIMIT 1"
            )
              .bind(rateKey)
              .first();
            if (!existing || existing.reset_at <= now) {
              await env.DB.prepare(
                "INSERT OR REPLACE INTO auth_rate_limits (key, attempts, reset_at) VALUES (?, 1, ?)"
              )
                .bind(rateKey, now + windowMs)
                .run();
            } else {
              await env.DB.prepare(
                "UPDATE auth_rate_limits SET attempts = attempts + 1 WHERE key = ?"
              )
                .bind(rateKey)
                .run();
            }
          } catch {}
        };

        if (!user) {
          await recordFailedAttempt();
          return new Response(JSON.stringify({ error: "Invalid email or password" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { valid, needsUpgrade } = await verifyPassword(password, user.salt, user.password_hash);
        if (!valid) {
          await recordFailedAttempt();
          return new Response(JSON.stringify({ error: "Invalid email or password" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Clear rate limit on success and transparently upgrade legacy hash if not temp password
        try {
          await env.DB.prepare("DELETE FROM auth_rate_limits WHERE key = ?").bind(rateKey).run();
          if (needsUpgrade && !user.must_change_password) {
            const newSalt = crypto.randomUUID().replace(/-/g, "");
            const upgradedHash = await pbkdf2Hash(password, newSalt);
            await env.DB.prepare(
              "UPDATE users SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?"
            )
              .bind(upgradedHash, newSalt, now, user.id)
              .run();
          }
        } catch {}

        const sessionId = `pm_sess_${crypto.randomUUID().replace(/-/g, "")}`;
        const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days

        await env.DB.prepare(
          "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
        )
          .bind(sessionId, user.id, expiresAt, now)
          .run();

        const cookie = `pitxmail_session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`;

        return new Response(
          JSON.stringify({
            success: true,
            sessionToken: sessionId,
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role,
              mustChangePassword: Boolean(user.must_change_password),
            },
          }),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
              "Set-Cookie": cookie,
            },
          }
        );
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // POST /api/auth/change-password
    if (url.pathname === "/api/auth/change-password" && request.method === "POST") {
      try {
        const body: any = await request.json();
        const newPassword = String(body.newPassword || "");
        if (newPassword.length < 8) {
          return new Response(
            JSON.stringify({ error: "New password must be at least 8 characters long" }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        let user: any = await getSessionUser(request, env);
        if (!user && body.email && body.currentPassword) {
          const u: any = await env.DB.prepare(
            "SELECT * FROM users WHERE lower(email) = lower(?) LIMIT 1"
          )
            .bind(String(body.email).trim().toLowerCase())
            .first();
          if (u) {
            const { valid } = await verifyPassword(body.currentPassword, u.salt, u.password_hash);
            if (valid) user = u;
          }
        }

        if (!user) {
          return new Response(JSON.stringify({ error: "Unauthorized. Please log in first." }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const userId = user.id || user.user_id;
        const newSalt = crypto.randomUUID().replace(/-/g, "");
        const newHash = await pbkdf2Hash(newPassword, newSalt);
        const now = Date.now();

        await env.DB.prepare(
          "UPDATE users SET password_hash = ?, salt = ?, must_change_password = 0, updated_at = ? WHERE id = ?"
        )
          .bind(newHash, newSalt, now, userId)
          .run();

        // Invalidate all prior sessions and issue a fresh session
        await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
        const newSessionId = `pm_sess_${crypto.randomUUID().replace(/-/g, "")}`;
        await env.DB.prepare(
          "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
        )
          .bind(newSessionId, userId, now + 7 * 24 * 60 * 60 * 1000, now)
          .run();

        const cookie = `pitxmail_session=${newSessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`;

        return new Response(
          JSON.stringify({
            success: true,
            message: "Password updated successfully",
          }),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
              "Set-Cookie": cookie,
            },
          }
        );
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // GET /api/auth/me
    if (url.pathname === "/api/auth/me" && request.method === "GET") {
      try {
        const sessionUser = await getSessionUser(request, env);
        if (!sessionUser) {
          return new Response(JSON.stringify({ authenticated: false }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            authenticated: true,
            user: {
              id: sessionUser.id,
              email: sessionUser.email,
              name: sessionUser.name,
              role: sessionUser.role,
              mustChangePassword: sessionUser.mustChangePassword,
            },
          }),
          {
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

    // POST /api/auth/logout
    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      try {
        const token =
          parseCookie(request.headers.get("Cookie"), "pitxmail_session") ||
          (request.headers.get("Authorization") || "").replace("Bearer ", "").trim();
        if (token) {
          await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(token).run();
        }
        const clearCookie = `pitxmail_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json", "Set-Cookie": clearCookie },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ==========================================
    // PUBLIC OPEN TRACKING PIXEL (Read Receipts)
    // No auth required: email clients fetch images without auth headers
    // ==========================================
    const trackOpenMatch = url.pathname.match(/^\/api\/v1\/track\/open\/([^/]+?)(?:\.(?:png|gif))?$/);
    if (trackOpenMatch && request.method === "GET") {
      const messageId = decodeURIComponent(trackOpenMatch[1]);
      if (env.DB) {
        try {
          await env.DB.prepare(
            "UPDATE messages SET opened_at = ? WHERE id = ? AND opened_at IS NULL"
          ).bind(Date.now(), messageId).run();
        } catch (trackErr: any) {
          console.error("Open tracking error:", trackErr.message);
        }
      }
      return getTransparentGifResponse();
    }

    // ==========================================
    // API V1 ROUTES
    // ==========================================
    let auth: AuthContext | null = null;
    if (url.pathname.startsWith("/api/v1/")) {
      auth = await authenticate(request, env);
      if (!auth) {
        return new Response(
          JSON.stringify({
            error: {
              message: "Unauthorized. Provide a valid API key ('Authorization: Bearer pm_live_...') or an active session.",
            },
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 1. GET /api/v1/stats
    if (url.pathname === "/api/v1/stats" && request.method === "GET") {
      if (!hasScope(auth!, "emails:read")) {
        return new Response(JSON.stringify({ error: "Insufficient API key scope (requires emails:read)" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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

        const nowDate = new Date();
        const startOfUtcDay = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate());
        const startOfUtcMonth = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), 1);

        // Count every message Resend accepted (matches the routing cap logic in dispatchWithFailover)
        const resendTodayRow: any = await env.DB.prepare(
          "SELECT count(*) as count FROM messages WHERE organisation_id = ? AND provider = 'resend' AND created_at >= ?"
        )
          .bind(auth!.organisationId, startOfUtcDay)
          .first();
        const resendMonthRow: any = await env.DB.prepare(
          "SELECT count(*) as count FROM messages WHERE organisation_id = ? AND provider = 'resend' AND created_at >= ?"
        )
          .bind(auth!.organisationId, startOfUtcMonth)
          .first();

        let resendPausedUntil: number | null = null;
        let resendPausedReason: string | null = null;
        try {
          const pausedRow: any = await env.DB.prepare(
            "SELECT value, expires_at FROM provider_state WHERE key = 'resend_paused_until' LIMIT 1"
          ).first();
          if (pausedRow && Number(pausedRow.expires_at) > Date.now()) {
            resendPausedUntil = Number(pausedRow.expires_at);
            resendPausedReason = String(pausedRow.value || "");
          }
        } catch {}

        const { results: providerRows } = await env.DB.prepare(
          "SELECT coalesce(provider, 'cloudflare') as provider, count(*) as count FROM messages WHERE organisation_id = ? GROUP BY provider"
        )
          .bind(auth!.organisationId)
          .all();
        const providerBreakdown: Record<string, number> = {};
        for (const p of providerRows || []) {
          providerBreakdown[String(p.provider || "cloudflare")] = Number(p.count || 0);
        }

        // 14-day daily series (UTC days), segmented by outcome/provider
        const dayMs = 24 * 60 * 60 * 1000;
        const seriesStart = startOfUtcDay - 13 * dayMs;
        const { results: seriesRows } = await env.DB.prepare(
          "SELECT CAST(created_at / 86400000 AS INTEGER) as day, coalesce(provider, 'cloudflare') as provider, status, count(*) as count FROM messages WHERE organisation_id = ? AND created_at >= ? GROUP BY day, provider, status"
        )
          .bind(auth!.organisationId, seriesStart)
          .all();
        const series = Array.from({ length: 14 }, (_, i) => ({
          date: seriesStart + i * dayMs,
          total: 0,
          resend: 0,
          cloudflare: 0,
          failed: 0,
        }));
        for (const r of seriesRows || []) {
          const idx = Number(r.day) - Math.floor(seriesStart / dayMs);
          if (idx < 0 || idx >= 14) continue;
          const c = Number(r.count || 0);
          const bucket = series[idx];
          bucket.total += c;
          if (r.status === "failed" || r.status === "bounced" || r.status === "complained") bucket.failed += c;
          else if (r.provider === "resend") bucket.resend += c;
          else bucket.cloudflare += c;
        }

        return new Response(
          JSON.stringify({
            total,
            delivered,
            failed,
            accepted,
            deliveryRate: `${deliveryRate}%`,
            volume24h: Number(last24h?.count || 0),
            resendConfigured: Boolean(env.RESEND_API_KEY),
            resendToday: Number(resendTodayRow?.count || 0),
            resendDailyLimit: Number(env.RESEND_DAILY_LIMIT || 99),
            resendMonth: Number(resendMonthRow?.count || 0),
            resendMonthlyLimit: Number(env.RESEND_MONTHLY_LIMIT || 2850),
            resendPausedUntil,
            resendPausedReason,
            providerBreakdown,
            series,
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
      if (!hasScope(auth!, "admin") && !hasScope(auth!, "emails:read")) {
        return new Response(JSON.stringify({ error: "Insufficient API key scope" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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

        return new Response(JSON.stringify({ domains: mapped, data: mapped }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 2b. POST /api/v1/domains
    if (url.pathname === "/api/v1/domains" && request.method === "POST") {
      if (!hasScope(auth!, "admin")) {
        return new Response(JSON.stringify({ error: "Admin session or admin API key required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      try {
        const body: any = await request.json();
        const domain = String(body.domain || "").trim().toLowerCase();
        if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
          return new Response(JSON.stringify({ error: "Invalid domain format" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const domId = `dom_${domain.replace(/[^a-z0-9]/g, "_")}`;
        const now = Date.now();
        await env.DB.prepare(
          `INSERT INTO domains (id, organisation_id, domain, verification_status, dkim_status, spf_status, dmarc_status, mx_status, created_at)
           VALUES (?, ?, ?, 'pending', 'pending', 'pending', 'pending', 'pending', ?)`
        )
          .bind(domId, auth!.organisationId, domain, now)
          .run();

        return new Response(JSON.stringify({ id: domId, domain, verificationStatus: "pending", createdAt: now }), {
          status: 201,
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
      if (!hasScope(auth!, "admin")) {
        return new Response(JSON.stringify({ error: "Admin session or admin API key required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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

        // Perform real DNS-over-HTTPS verification
        const [txtRecords, dmarcRecords, mxRecords] = await Promise.all([
          queryDns(domainRecord.domain, "TXT"),
          queryDns(`_dmarc.${domainRecord.domain}`, "TXT"),
          queryDns(domainRecord.domain, "MX"),
        ]);

        let spfOk = txtRecords.some((r) => r.toLowerCase().includes("v=spf1"));
        let dmarcOk = dmarcRecords.some((r) => r.toLowerCase().includes("v=dmarc1"));
        let mxOk = mxRecords.length > 0;

        // Subdomain inheritance: if a subdomain (e.g. pitacs.pitx.uk) lacks direct records,
        // check parent zone (pitx.uk) since Cloudflare Email Sending covers the entire zone
        const parts = domainRecord.domain.split(".");
        if ((!spfOk || !mxOk || !dmarcOk) && parts.length > 2) {
          const parentDomain = parts.slice(1).join(".");
          const [parentTxt, parentDmarc, parentMx] = await Promise.all([
            queryDns(parentDomain, "TXT"),
            queryDns(`_dmarc.${parentDomain}`, "TXT"),
            queryDns(parentDomain, "MX"),
          ]);
          if (!spfOk) spfOk = parentTxt.some((r) => r.toLowerCase().includes("v=spf1"));
          if (!dmarcOk) dmarcOk = parentDmarc.some((r) => r.toLowerCase().includes("v=dmarc1"));
          if (!mxOk) mxOk = parentMx.length > 0;
        }

        const dkimOk = domainRecord.domain === "pitx.uk" || domainRecord.domain.endsWith(".pitx.uk") ? true : spfOk && dmarcOk;
        const overall = spfOk && (mxOk || dmarcOk) ? "verified" : "pending";

        await env.DB.prepare(
          "UPDATE domains SET verification_status = ?, dkim_status = ?, spf_status = ?, dmarc_status = ?, mx_status = ? WHERE id = ?"
        )
          .bind(
            overall,
            dkimOk ? "verified" : "pending",
            spfOk ? "verified" : "pending",
            dmarcOk ? "verified" : "pending",
            mxOk ? "verified" : "pending",
            domId
          )
          .run();

        return new Response(
          JSON.stringify({
            success: overall === "verified",
            domain: domainRecord.domain,
            status: overall,
            spf: spfOk ? "verified" : "pending",
            dkim: dkimOk ? "verified" : "pending",
            dmarc: dmarcOk ? "verified" : "pending",
            mx: mxOk ? "verified" : "pending",
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
      if (!hasScope(auth!, "admin")) {
        return new Response(JSON.stringify({ error: "Admin session or admin API key required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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
          scopes: k.scopes || "emails:send,emails:read",
          createdAt: k.created_at,
          lastUsedAt: k.last_used_at,
          expiresAt: k.expires_at,
          revokedAt: k.revoked_at,
        }));

        return new Response(JSON.stringify({ keys: mapped, data: mapped }), {
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
      if (!hasScope(auth!, "admin")) {
        return new Response(JSON.stringify({ error: "Admin session or admin API key required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      try {
        const body: any = await request.json();
        const envPrefix = body.environment === "test" ? "pm_test_" : "pm_live_";
        const rawToken = `${envPrefix}${crypto.randomUUID().replace(/-/g, "")}`;
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
            key: rawToken,
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
      if (!hasScope(auth!, "admin")) {
        return new Response(JSON.stringify({ error: "Admin session or admin API key required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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
      if (!hasScope(auth!, "emails:read")) {
        return new Response(JSON.stringify({ error: "Insufficient API key scope (requires emails:read)" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      try {
        // Server-side filtering + pagination (bodies excluded; fetch /emails/:id for full content)
        const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 1), 100);
        const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);
        const where: string[] = ["organisation_id = ?"];
        const binds: any[] = [auth!.organisationId];

        const statusFilter = url.searchParams.get("status");
        if (statusFilter && statusFilter !== "all") {
          where.push("status = ?");
          binds.push(statusFilter);
        }
        const providerFilter = url.searchParams.get("provider");
        if (providerFilter === "cloudflare") {
          where.push("(provider IS NULL OR provider LIKE 'cloudflare%')");
        } else if (providerFilter && providerFilter !== "all") {
          where.push("provider = ?");
          binds.push(providerFilter);
        }
        const q = (url.searchParams.get("q") || url.searchParams.get("search") || "").trim().toLowerCase();
        if (q) {
          const like = `%${q.replace(/[%_]/g, "")}%`;
          where.push("(lower(to_address) LIKE ? OR lower(subject) LIKE ? OR lower(from_address) LIKE ? OR lower(id) LIKE ?)");
          binds.push(like, like, like, like);
        }
        const since = Number(url.searchParams.get("since") || 0);
        if (since > 0) {
          where.push("created_at >= ?");
          binds.push(since);
        }
        const until = Number(url.searchParams.get("until") || 0);
        if (until > 0) {
          where.push("created_at <= ?");
          binds.push(until);
        }
        const whereSql = where.join(" AND ");

        const totalRow: any = await env.DB.prepare(`SELECT count(*) as count FROM messages WHERE ${whereSql}`)
          .bind(...binds)
          .first();
        const { results } = await env.DB.prepare(
          `SELECT id, from_address, from_name, to_address, cc_address, bcc_address, reply_to, subject, status, provider,
                  provider_message_id, error_reason, retry_count, created_at, updated_at, opened_at
           FROM messages WHERE ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`
        )
          .bind(...binds, limit, offset)
          .all();

        const normalized = (results || []).map((m: any) => ({
          id: m.id,
          fromAddress: m.from_address,
          fromName: m.from_name,
          toAddress: m.to_address,
          ccAddress: m.cc_address,
          bccAddress: m.bcc_address,
          replyTo: m.reply_to,
          subject: m.subject,
          status: m.status,
          provider: m.provider,
          providerMessageId: m.provider_message_id,
          errorReason: m.error_reason,
          retryCount: m.retry_count ?? 0,
          createdAt: m.created_at,
          updatedAt: m.updated_at,
          openedAt: m.opened_at ?? null,
        }));
        const totalCount = Number(totalRow?.count || 0);

        return new Response(
          JSON.stringify({
            data: normalized,
            count: normalized.length,
            total: totalCount,
            limit,
            offset,
            hasMore: offset + normalized.length < totalCount,
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

    // 8. GET /api/v1/emails/:id
    const detailMatch = url.pathname.match(/^\/api\/v1\/emails\/([^/]+)$/);
    if (detailMatch && request.method === "GET") {
      if (!hasScope(auth!, "emails:read")) {
        return new Response(JSON.stringify({ error: "Insufficient API key scope (requires emails:read)" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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
          ccAddress: msg.cc_address,
          bccAddress: msg.bcc_address,
          replyTo: msg.reply_to,
          subject: msg.subject,
          htmlBody: msg.html_body,
          textBody: msg.text_body,
          status: msg.status,
          provider: msg.provider,
          providerMessageId: msg.provider_message_id,
          errorReason: msg.error_reason,
          retryCount: msg.retry_count ?? 0,
          createdAt: msg.created_at,
          updatedAt: msg.updated_at,
          deliveredAt: msg.delivered_at ?? null,
          openedAt: msg.opened_at ?? null,
          tags: (() => {
            try {
              return msg.tags ? JSON.parse(msg.tags) : null;
            } catch {
              return msg.tags;
            }
          })(),
          metadata: (() => {
            try {
              return msg.metadata ? JSON.parse(msg.metadata) : null;
            } catch {
              return msg.metadata;
            }
          })(),
        };

        const { results: attempts } = await env.DB.prepare(
          "SELECT * FROM delivery_attempts WHERE message_id = ? ORDER BY started_at ASC, attempt_number ASC"
        )
          .bind(id)
          .all();

        const normalizedAttempts = (attempts || []).map((a: any) => ({
          id: a.id,
          attemptNumber: a.attempt_number,
          provider: a.provider,
          status: a.status,
          errorMessage: a.error_message,
          providerResponse: a.provider_response,
          startedAt: a.started_at,
          finishedAt: a.finished_at,
        }));

        return new Response(
          JSON.stringify({ message: normalizedMsg, attempts: normalizedAttempts }),
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
      if (!hasScope(auth!, "emails:send")) {
        return new Response(JSON.stringify({ error: "Insufficient API key scope (requires emails:send)" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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
        const dispatch = await dispatchWithFailover(env, {
          fromAddr,
          fromName,
          recipients,
          subject: msg.subject,
          text: msg.text_body || "",
          html: msg.html_body || "",
        });
        const deliveryStatus = dispatch.status;
        const errorReason = dispatch.errorReason;
        const finishedAt = Date.now();

        for (let i = 0; i < dispatch.attempts.length; i++) {
          const att = dispatch.attempts[i];
          await env.DB.prepare(
            `INSERT INTO delivery_attempts (
              id, message_id, attempt_number, provider, status, error_message, provider_response, started_at, finished_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
            .bind(
              `att_${att.finishedAt}_${Math.random().toString(36).slice(2, 6)}`,
              id,
              newRetryCount + 1 + i,
              att.provider,
              att.status,
              att.errorMessage,
              att.providerResponse,
              att.startedAt,
              att.finishedAt
            )
            .run();
        }

        await env.DB.prepare(
          `UPDATE messages
           SET status = ?, provider = ?, provider_message_id = ?, error_reason = ?, retry_count = ?, updated_at = ?
           WHERE id = ?`
        )
          .bind(deliveryStatus, dispatch.provider, dispatch.providerMessageId, errorReason, newRetryCount, finishedAt, id)
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

    // 9b. GET /api/v1/emails/:id/eml (Raw RFC-822 download)
    const emlMatch = url.pathname.match(/^\/api\/v1\/emails\/([^/]+)\/eml$/);
    if (emlMatch && request.method === "GET") {
      if (!hasScope(auth!, "emails:read")) {
        return new Response(JSON.stringify({ error: "Insufficient API key scope" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      try {
        const id = decodeURIComponent(emlMatch[1]);
        const msg: any = await env.DB.prepare(
          "SELECT * FROM messages WHERE id = ? AND organisation_id = ? LIMIT 1"
        )
          .bind(id, auth!.organisationId)
          .first();

        if (!msg) {
          return new Response("Message not found", { status: 404 });
        }

        const dateHeader = new Date(msg.created_at).toUTCString();
        const fromHeader = msg.from_name ? `"${msg.from_name}" <${msg.from_address}>` : msg.from_address;
        const boundary = `----=_Part_${id}_${Date.now()}`;
        
        const eml = [
          `From: ${fromHeader}`,
          `To: ${msg.to_address}`,
          msg.cc_address ? `Cc: ${msg.cc_address}` : "",
          msg.reply_to ? `Reply-To: ${msg.reply_to}` : "",
          `Subject: ${msg.subject}`,
          `Date: ${dateHeader}`,
          `Message-ID: <${msg.id}@mail.pitx.uk>`,
          `MIME-Version: 1.0`,
          `X-Pitxmail-Provider: ${msg.provider || "cloudflare"}`,
          `X-Pitxmail-Status: ${msg.status || "delivered"}`,
          `Content-Type: multipart/alternative; boundary="${boundary}"`,
          "",
          `--${boundary}`,
          `Content-Type: text/plain; charset=UTF-8`,
          `Content-Transfer-Encoding: 7bit`,
          "",
          msg.text_body || "No plain text content provided.",
          "",
          `--${boundary}`,
          `Content-Type: text/html; charset=UTF-8`,
          `Content-Transfer-Encoding: 7bit`,
          "",
          msg.html_body || "<p>No HTML body provided.</p>",
          "",
          `--${boundary}--`,
          ""
        ].filter(Boolean).join("\r\n");

        return new Response(eml, {
          headers: {
            ...corsHeaders,
            "Content-Type": "message/rfc822; charset=utf-8",
            "Content-Disposition": `attachment; filename="${msg.id}.eml"`,
          },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 9c. GET /api/v1/suppressions
    if (url.pathname === "/api/v1/suppressions" && request.method === "GET") {
      if (!hasScope(auth!, "emails:read")) {
        return new Response(JSON.stringify({ error: "Insufficient API key scope" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      try {
        const { results } = await env.DB.prepare(
          "SELECT id, email, reason, created_at FROM suppressions WHERE organisation_id = ? ORDER BY created_at DESC LIMIT 200"
        )
          .bind(auth!.organisationId)
          .all();

        const mapped = (results || []).map((s: any) => ({
          id: s.id,
          email: s.email,
          reason: s.reason,
          createdAt: s.created_at,
        }));

        return new Response(JSON.stringify({ data: mapped, count: mapped.length }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 9d. POST /api/v1/suppressions (Manually suppress address)
    if (url.pathname === "/api/v1/suppressions" && request.method === "POST") {
      if (!hasScope(auth!, "admin")) {
        return new Response(JSON.stringify({ error: "Admin scope required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      try {
        const body: any = await request.json();
        const email = String(body.email || "").trim().toLowerCase();
        const reason = String(body.reason || "manual").trim();
        if (!isValidEmail(email)) {
          return new Response(JSON.stringify({ error: "Invalid email address" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const now = Date.now();
        const supId = `sup_${now}_${Math.random().toString(36).slice(2, 6)}`;
        await env.DB.prepare(
          "INSERT OR REPLACE INTO suppressions (id, organisation_id, email, reason, created_at) VALUES (?, ?, ?, ?, ?)"
        )
          .bind(supId, auth!.organisationId, email, reason, now)
          .run();

        return new Response(JSON.stringify({ success: true, id: supId, email, reason, createdAt: now }), {
          status: 201,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 9e. DELETE /api/v1/suppressions/:idOrEmail (Unblock recipient)
    const supDeleteMatch = url.pathname.match(/^\/api\/v1\/suppressions\/([^/]+)$/);
    if (supDeleteMatch && request.method === "DELETE") {
      if (!hasScope(auth!, "admin")) {
        return new Response(JSON.stringify({ error: "Admin scope required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      try {
        const param = decodeURIComponent(supDeleteMatch[1]).toLowerCase();
        await env.DB.prepare(
          "DELETE FROM suppressions WHERE organisation_id = ? AND (id = ? OR lower(email) = ?)"
        )
          .bind(auth!.organisationId, param, param)
          .run();

        return new Response(JSON.stringify({ success: true, removed: param }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 10. POST /api/v1/emails (Dispatch email)
    if (url.pathname === "/api/v1/emails" && request.method === "POST") {
      if (!hasScope(auth!, "emails:send")) {
        return new Response(JSON.stringify({ error: "Insufficient API key scope (requires emails:send)" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      try {
        const body: any = await request.json();

        if (!body.to || !body.subject) {
          return new Response(
            JSON.stringify({ error: "Missing required fields (to, subject)" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const rawFrom = body.from || "Pitacs Hub <noreply@pitacs.pitx.uk>";
        let { address: fromAddr, name: fromName } = parseEmailAddress(rawFrom);
        if (!isValidEmail(fromAddr)) {
          return new Response(JSON.stringify({ error: "Invalid 'from' email address" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Check sender domain verification; auto-normalize Pitacs/unverified domains to @pitacs.pitx.uk
        let fromDomain = fromAddr.split("@")[1]?.toLowerCase();
        const verifiedDomain: any = await env.DB.prepare(
          "SELECT id, verification_status FROM domains WHERE organisation_id = ? AND lower(domain) = ? LIMIT 1"
        )
          .bind(auth!.organisationId, fromDomain)
          .first();

        let autoReplyTo: string | null = null;
        if (!verifiedDomain || verifiedDomain.verification_status !== "verified") {
          const localPart = (fromAddr.split("@")[0] || "noreply").replace(/[^a-z0-9._+-]/gi, "") || "noreply";
          autoReplyTo = fromAddr;
          fromAddr = `${localPart}@pitacs.pitx.uk`;
          fromName = fromName || "Pitacs Hub";
          fromDomain = "pitacs.pitx.uk";
        }

        const rawRecipients = Array.isArray(body.to)
          ? body.to
          : String(body.to).split(",").map((s: string) => s.trim()).filter(Boolean);
        const recipients = rawRecipients.map((r: string) => parseEmailAddress(r).address);
        if (recipients.length === 0 || recipients.length > 50 || recipients.some((r: string) => !isValidEmail(r))) {
          return new Response(
            JSON.stringify({ error: "Invalid recipients: provide 1-50 valid email addresses in 'to'" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Check suppressions list (global domain protection)
        for (const recipient of recipients) {
          const suppressed: any = await env.DB.prepare(
            "SELECT reason FROM suppressions WHERE lower(email) = ? LIMIT 1"
          )
            .bind(recipient.toLowerCase())
            .first();
          if (suppressed) {
            return new Response(
              JSON.stringify({
                error: `Recipient '${recipient}' is suppressed (${suppressed.reason}). Halted before dispatch to protect domain reputation.`,
              }),
              { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        // Idempotency-Key support
        const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
        const now = Date.now();
        if (idempotencyKey) {
          const idemHash = await sha256Hex(idempotencyKey);
          const existingIdem: any = await env.DB.prepare(
            "SELECT message_id, expires_at FROM idempotency_keys WHERE project_id = ? AND key_hash = ? LIMIT 1"
          )
            .bind(auth!.projectId, idemHash)
            .first();
          if (existingIdem && existingIdem.expires_at > now) {
            const existingMsg: any = await env.DB.prepare(
              "SELECT id, status, provider, error_reason, created_at FROM messages WHERE id = ? LIMIT 1"
            )
              .bind(existingIdem.message_id)
              .first();
            if (existingMsg) {
              return new Response(
                JSON.stringify({
                  id: existingMsg.id,
                  object: "email",
                  status: existingMsg.status,
                  provider: existingMsg.provider,
                  error: existingMsg.error_reason,
                  idempotent_replay: true,
                  created_at: new Date(existingMsg.created_at).toISOString(),
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }
        }

        const normalizedTo = recipients.join(", ");
        const ccArr = body.cc ? (Array.isArray(body.cc) ? body.cc : [body.cc]).map((r: string) => parseEmailAddress(r).address) : null;
        const bccArr = body.bcc ? (Array.isArray(body.bcc) ? body.bcc : [body.bcc]).map((r: string) => parseEmailAddress(r).address) : null;
        const ccList = ccArr ? ccArr.join(", ") : null;
        const bccList = bccArr ? bccArr.join(", ") : null;
        const replyTo = body.reply_to
          ? parseEmailAddress(body.reply_to).address
          : body.replyTo
          ? parseEmailAddress(body.replyTo).address
          : autoReplyTo;
        const msgId = `pm_cf_${now}_${Math.random().toString(36).slice(2, 8)}`;

        const isSandbox = (request.headers.get("Authorization") || "").startsWith("Bearer pm_test_");
        let deliveryStatus: string = "simulated";
        let providerName: string = "sandbox";
        let providerMessageId: string | null = null;
        let errorReason: string | null = null;
        let attemptsToSave: DeliveryAttemptRecord[] = [
          {
            provider: "sandbox",
            status: "success",
            errorMessage: null,
            providerResponse: null,
            startedAt: now,
            finishedAt: Date.now(),
          },
        ];

        // Inject open tracking pixel into HTML if html is provided
        const finalHtml = body.html ? injectTrackingPixel(body.html, msgId) : "";

        if (!isSandbox) {
          const dispatch = await dispatchWithFailover(env, {
            fromAddr,
            fromName,
            recipients,
            cc: ccArr,
            bcc: bccArr,
            replyTo,
            subject: body.subject,
            text: body.text || "",
            html: finalHtml,
          });
          deliveryStatus = dispatch.status;
          providerName = dispatch.provider;
          providerMessageId = dispatch.providerMessageId;
          errorReason = dispatch.errorReason;
          attemptsToSave = dispatch.attempts;
        }

        if (env.DB) {
          try {
            await env.DB.prepare(
              `INSERT INTO messages (
                id, organisation_id, project_id, from_address, from_name, to_address,
                cc_address, bcc_address, reply_to, subject, html_body, text_body,
                status, provider, provider_message_id, error_reason, idempotency_key, tags, metadata,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
              .bind(
                msgId,
                auth!.organisationId,
                auth!.projectId,
                fromAddr,
                fromName || null,
                normalizedTo,
                ccList,
                bccList,
                replyTo,
                body.subject,
                finalHtml,
                body.text || "",
                deliveryStatus,
                providerName,
                providerMessageId,
                errorReason,
                idempotencyKey || null,
                body.tags ? JSON.stringify(body.tags) : null,
                body.metadata ? JSON.stringify(body.metadata) : null,
                now,
                now
              )
              .run();

            if (idempotencyKey) {
              const idemHash = await sha256Hex(idempotencyKey);
              const reqHash = await sha256Hex(JSON.stringify({ from: fromAddr, to: normalizedTo, subject: body.subject }));
              await env.DB.prepare(
                "INSERT OR REPLACE INTO idempotency_keys (project_id, key_hash, request_hash, message_id, expires_at) VALUES (?, ?, ?, ?, ?)"
              )
                .bind(auth!.projectId, idemHash, reqHash, msgId, now + 24 * 60 * 60 * 1000)
                .run();
            }

            for (let i = 0; i < attemptsToSave.length; i++) {
              const att = attemptsToSave[i];
              await env.DB.prepare(
                `INSERT INTO delivery_attempts (
                  id, message_id, attempt_number, provider, status, error_message, provider_response, started_at, finished_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
              )
                .bind(
                  `att_${att.finishedAt}_${Math.random().toString(36).slice(2, 6)}`,
                  msgId,
                  i + 1,
                  att.provider,
                  att.status,
                  att.errorMessage,
                  att.providerResponse,
                  att.startedAt,
                  att.finishedAt
                )
                .run();
            }
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

    // 11. POST /api/v1/emails/batch (Resend-compatible batch dispatch, up to 100 emails)
    if (url.pathname === "/api/v1/emails/batch" && request.method === "POST") {
      if (!hasScope(auth!, "emails:send")) {
        return new Response(JSON.stringify({ error: "Insufficient API key scope (requires emails:send)" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      try {
        const body: any = await request.json();
        const batchItems: any[] = Array.isArray(body)
          ? body
          : (Array.isArray(body?.emails) ? body.emails : (Array.isArray(body?.data) ? body.data : []));

        if (!Array.isArray(batchItems) || batchItems.length === 0) {
          return new Response(
            JSON.stringify({ error: "Invalid batch payload: provide an array of 1 to 100 email objects" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (batchItems.length > 100) {
          return new Response(
            JSON.stringify({ error: "Batch limit exceeded: maximum 100 emails per batch request" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const isSandbox = (request.headers.get("Authorization") || "").startsWith("Bearer pm_test_");
        const results: Array<{ id: string; object: "email"; status?: string; provider?: string; error?: string | null }> = [];

        // Preload verified domains for fast lookup
        const { results: orgDomains } = await env.DB.prepare(
          "SELECT domain, verification_status FROM domains WHERE organisation_id = ?"
        ).bind(auth!.organisationId).all();
        const verifiedDomainSet = new Set(
          (orgDomains || [])
            .filter((d: any) => d.verification_status === "verified")
            .map((d: any) => d.domain.toLowerCase())
        );

        // Preload suppressions for domain reputation guard
        const { results: allSuppressions } = await env.DB.prepare(
          "SELECT email, reason FROM suppressions"
        ).all();
        const suppressionMap = new Map<string, string>();
        for (const s of allSuppressions || []) {
          suppressionMap.set(String(s.email).toLowerCase(), s.reason || "suppressed");
        }

        const now = Date.now();

        for (let i = 0; i < batchItems.length; i++) {
          const item = batchItems[i];
          const itemMsgId = `pm_cf_${now}_${i}_${Math.random().toString(36).slice(2, 7)}`;

          if (!item.to || !item.subject) {
            results.push({
              id: itemMsgId,
              object: "email",
              status: "failed",
              provider: "none",
              error: "Missing required fields (to, subject)",
            });
            continue;
          }

          const rawFrom = item.from || "Pitacs Hub <noreply@pitacs.pitx.uk>";
          let { address: fromAddr, name: fromName } = parseEmailAddress(rawFrom);
          if (!isValidEmail(fromAddr)) {
            results.push({
              id: itemMsgId,
              object: "email",
              status: "failed",
              provider: "none",
              error: "Invalid 'from' email address",
            });
            continue;
          }

          let fromDomain = fromAddr.split("@")[1]?.toLowerCase();
          let autoReplyTo: string | null = null;
          if (!verifiedDomainSet.has(fromDomain)) {
            const localPart = (fromAddr.split("@")[0] || "noreply").replace(/[^a-z0-9._+-]/gi, "") || "noreply";
            autoReplyTo = fromAddr;
            fromAddr = `${localPart}@pitacs.pitx.uk`;
            fromName = fromName || "Pitacs Hub";
            fromDomain = "pitacs.pitx.uk";
          }

          const rawRecipients = Array.isArray(item.to)
            ? item.to
            : String(item.to).split(",").map((s: string) => s.trim()).filter(Boolean);
          const recipients = rawRecipients.map((r: string) => parseEmailAddress(r).address);

          if (recipients.length === 0 || recipients.some((r: string) => !isValidEmail(r))) {
            results.push({
              id: itemMsgId,
              object: "email",
              status: "failed",
              provider: "none",
              error: "Invalid recipients in 'to'",
            });
            continue;
          }

          // Check suppressions
          let isSuppressed = false;
          let supReason = "";
          for (const rec of recipients) {
            if (suppressionMap.has(rec.toLowerCase())) {
              isSuppressed = true;
              supReason = suppressionMap.get(rec.toLowerCase())!;
              break;
            }
          }

          if (isSuppressed) {
            results.push({
              id: itemMsgId,
              object: "email",
              status: "failed",
              provider: "cloudflare",
              error: `Recipient suppressed (${supReason})`,
            });
            continue;
          }

          const normalizedTo = recipients.join(", ");
          const ccArr = item.cc ? (Array.isArray(item.cc) ? item.cc : [item.cc]).map((r: string) => parseEmailAddress(r).address) : null;
          const bccArr = item.bcc ? (Array.isArray(item.bcc) ? item.bcc : [item.bcc]).map((r: string) => parseEmailAddress(r).address) : null;
          const ccList = ccArr ? ccArr.join(", ") : null;
          const bccList = bccArr ? bccArr.join(", ") : null;
          const replyTo = item.reply_to
            ? parseEmailAddress(item.reply_to).address
            : item.replyTo
            ? parseEmailAddress(item.replyTo).address
            : autoReplyTo;

          // Inject open tracking pixel into HTML
          const finalHtml = item.html ? injectTrackingPixel(item.html, itemMsgId) : "";

          let deliveryStatus: string = "simulated";
          let providerName: string = "sandbox";
          let providerMessageId: string | null = null;
          let errorReason: string | null = null;
          let attemptsToSave: DeliveryAttemptRecord[] = [
            {
              provider: "sandbox",
              status: "success",
              errorMessage: null,
              providerResponse: null,
              startedAt: now,
              finishedAt: Date.now(),
            },
          ];

          if (!isSandbox) {
            const dispatch = await dispatchWithFailover(env, {
              fromAddr,
              fromName,
              recipients,
              cc: ccArr,
              bcc: bccArr,
              replyTo,
              subject: item.subject,
              text: item.text || "",
              html: finalHtml,
            });
            deliveryStatus = dispatch.status;
            providerName = dispatch.provider;
            providerMessageId = dispatch.providerMessageId;
            errorReason = dispatch.errorReason;
            attemptsToSave = dispatch.attempts;
          }

          if (env.DB) {
            try {
              await env.DB.prepare(
                `INSERT INTO messages (
                  id, organisation_id, project_id, from_address, from_name, to_address,
                  cc_address, bcc_address, reply_to, subject, html_body, text_body,
                  status, provider, provider_message_id, error_reason, idempotency_key, tags, metadata,
                  created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
              )
                .bind(
                  itemMsgId,
                  auth!.organisationId,
                  auth!.projectId,
                  fromAddr,
                  fromName || null,
                  normalizedTo,
                  ccList,
                  bccList,
                  replyTo,
                  item.subject,
                  finalHtml,
                  item.text || "",
                  deliveryStatus,
                  providerName,
                  providerMessageId,
                  errorReason,
                  null,
                  item.tags ? JSON.stringify(item.tags) : null,
                  item.metadata ? JSON.stringify(item.metadata) : null,
                  now,
                  now
                )
                .run();

              for (let a = 0; a < attemptsToSave.length; a++) {
                const att = attemptsToSave[a];
                await env.DB.prepare(
                  `INSERT INTO delivery_attempts (
                    id, message_id, attempt_number, provider, status, error_message, provider_response, started_at, finished_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
                )
                  .bind(
                    `att_${att.finishedAt}_${Math.random().toString(36).slice(2, 6)}`,
                    itemMsgId,
                    a + 1,
                    att.provider,
                    att.status,
                    att.errorMessage,
                    att.providerResponse,
                    att.startedAt,
                    att.finishedAt
                  )
                  .run();
              }
            } catch (dbErr: any) {
              console.error("Batch item persistence error:", dbErr.message);
            }
          }

          results.push({
            id: itemMsgId,
            object: "email",
            status: deliveryStatus,
            provider: providerName,
            error: errorReason,
          });
        }

        return new Response(JSON.stringify({ data: results }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err: any) {
        return new Response(
          JSON.stringify({ error: err.message || "Failed to process email batch" }),
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
          batch: "POST /api/v1/emails/batch",
          track: "GET /api/v1/track/open/:id",
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

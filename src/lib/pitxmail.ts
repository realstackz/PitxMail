/**
 * Pitxmail Official TypeScript / JavaScript SDK
 * High-reliability hybrid transactional email client with Resend drop-in parity
 * and automatic Cloudflare Email Routing failover.
 */

export interface PitxmailOptions {
  apiKey: string;
  baseUrl?: string;
}

export interface SendEmailPayload {
  from: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  reply_to?: string; // Resend SDK compatibility
  subject: string;
  html?: string;
  text?: string;
  tags?: Record<string, string>;
  metadata?: Record<string, any>;
  idempotencyKey?: string;
}

export interface SendEmailResponse {
  id: string;
  object: "email";
  status: "delivered" | "submitted" | "queued" | "failed";
  provider?: "resend" | "cloudflare" | string;
  error?: string | null;
  created_at: string;
}

export interface BatchSendItem {
  id: string;
  object: "email";
  status?: string;
  provider?: string;
  error?: string | null;
}

export interface BatchSendResponse {
  data: BatchSendItem[];
}

export interface PitxmailError {
  message: string;
  code?: string;
  details?: any;
}

export interface EmailListParams {
  limit?: number;
  offset?: number;
  status?: "delivered" | "submitted" | "failed" | "bounced" | "all";
  provider?: "resend" | "cloudflare" | "all";
  since?: number;
  until?: number;
  q?: string; // Server-side search across to, subject, id
  search?: string; // Alias for q
}

export interface EmailListItem {
  id: string;
  fromAddress: string;
  fromName?: string;
  toAddress: string;
  ccAddress?: string | null;
  bccAddress?: string | null;
  replyTo?: string | null;
  subject: string;
  status: string;
  provider: string;
  providerMessageId?: string | null;
  errorReason?: string | null;
  retryCount: number;
  createdAt: number;
  updatedAt: number;
  openedAt?: number | null;
}

export interface EmailListResponse {
  data: EmailListItem[];
  count: number;
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface DeliveryAttempt {
  id: string;
  attemptNumber: number;
  provider: string;
  status: string;
  errorMessage?: string | null;
  providerResponse?: string | null;
  startedAt: number;
  finishedAt?: number | null;
}

export interface EmailDetailResponse {
  message: EmailListItem & {
    htmlBody?: string;
    textBody?: string;
    tags?: Record<string, string> | null;
    metadata?: Record<string, any> | null;
  };
  attempts: DeliveryAttempt[];
}

export interface StatsResponse {
  total: number;
  delivered: number;
  failed: number;
  accepted: number;
  deliveryRate: string;
  volume24h: number;
  resendConfigured?: boolean;
  resendToday?: number;
  resendDailyLimit?: number;
  resendMonth?: number;
  resendMonthlyLimit?: number;
  resendPausedUntil?: number | null;
  resendPausedReason?: string | null;
  activeProvider?: "resend" | "cloudflare";
  providerBreakdown?: Record<string, number>;
  series?: Array<{
    date: number;
    total: number;
    resend: number;
    cloudflare: number;
    failed: number;
  }>;
}

export interface SuppressionItem {
  id: string;
  email: string;
  reason: string;
  created_at: number;
}

export class Pitxmail {
  private apiKey: string;
  private baseUrl: string;

  constructor(options: PitxmailOptions | string) {
    if (typeof options === "string") {
      this.apiKey = options;
      this.baseUrl = "https://mail.pitx.uk";
    } else {
      if (!options?.apiKey) {
        throw new Error("Pitxmail apiKey is required");
      }
      this.apiKey = options.apiKey;
      this.baseUrl = (options.baseUrl || process.env.NEXT_PUBLIC_PITXMAIL_URL || "https://mail.pitx.uk").replace(/\/$/, "");
    }
  }

  private async fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string> || {}),
    };

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });

    const contentType = res.headers.get("content-type") || "";
    if (!res.ok) {
      let errBody: any = null;
      if (contentType.includes("application/json")) {
        errBody = await res.json().catch(() => null);
      } else {
        errBody = { message: await res.text() };
      }
      const msg = errBody?.error?.message || errBody?.error || errBody?.message || `HTTP ${res.status}`;
      const err = new Error(msg) as Error & { status: number; details?: any };
      err.status = res.status;
      err.details = errBody;
      throw err;
    }

    if (contentType.includes("application/json")) {
      return (await res.json()) as T;
    }
    return (await res.text()) as unknown as T;
  }

  get emails() {
    return {
      send: async (
        payload: SendEmailPayload
      ): Promise<{ data: SendEmailResponse | null; error: PitxmailError | null }> => {
        try {
          const headers: Record<string, string> = {};
          if (payload.idempotencyKey) {
            headers["Idempotency-Key"] = payload.idempotencyKey;
          }

          // Resend compatibility mapping
          const body: Record<string, any> = {
            from: payload.from,
            to: Array.isArray(payload.to) ? payload.to : [payload.to],
            subject: payload.subject,
            html: payload.html,
            text: payload.text,
          };
          if (payload.cc) body.cc = payload.cc;
          if (payload.bcc) body.bcc = payload.bcc;
          if (payload.replyTo || payload.reply_to) body.replyTo = payload.replyTo || payload.reply_to;
          if (payload.tags) body.tags = payload.tags;
          if (payload.metadata) body.metadata = payload.metadata;

          const data = await this.fetchJson<SendEmailResponse>("/api/v1/emails", {
            method: "POST",
            headers,
            body: JSON.stringify(body),
          });

          return { data, error: null };
        } catch (err: any) {
          return {
            data: null,
            error: {
              message: err.message || "Email dispatch failed",
              details: err.details,
            },
          };
        }
      },

      get: async (id: string): Promise<EmailDetailResponse> => {
        return this.fetchJson<EmailDetailResponse>(`/api/v1/emails/${encodeURIComponent(id)}`);
      },

      retry: async (id: string): Promise<SendEmailResponse> => {
        return this.fetchJson<SendEmailResponse>(`/api/v1/emails/${encodeURIComponent(id)}/retry`, {
          method: "POST",
        });
      },

      list: async (params?: EmailListParams): Promise<EmailListResponse> => {
        const query = new URLSearchParams();
        if (params?.limit) query.append("limit", String(params.limit));
        if (params?.offset) query.append("offset", String(params.offset));
        if (params?.status && params.status !== "all") query.append("status", params.status);
        if (params?.provider && params.provider !== "all") query.append("provider", params.provider);
        if (params?.since) query.append("since", String(params.since));
        if (params?.until) query.append("until", String(params.until));
        const searchTerm = params?.q || params?.search;
        if (searchTerm) query.append("q", searchTerm);

        const qs = query.toString();
        return this.fetchJson<EmailListResponse>(`/api/v1/emails${qs ? `?${qs}` : ""}`);
      },

      downloadEml: async (id: string): Promise<string> => {
        const res = await fetch(`${this.baseUrl}/api/v1/emails/${encodeURIComponent(id)}/eml`, {
          headers: { Authorization: `Bearer ${this.apiKey}` },
        });
        if (!res.ok) throw new Error(`Failed to download EML: HTTP ${res.status}`);
        return res.text();
      },

      sendBatch: async (
        payloads: SendEmailPayload[]
      ): Promise<{ data: BatchSendResponse | null; error: PitxmailError | null }> => {
        return this.batch.send(payloads);
      },
    };
  }

  get batch() {
    return {
      send: async (
        payloads: SendEmailPayload[]
      ): Promise<{ data: BatchSendResponse | null; error: PitxmailError | null }> => {
        try {
          const body = payloads.map((p) => ({
            from: p.from,
            to: Array.isArray(p.to) ? p.to : [p.to],
            subject: p.subject,
            html: p.html,
            text: p.text,
            cc: p.cc,
            bcc: p.bcc,
            replyTo: p.replyTo || p.reply_to,
            tags: p.tags,
            metadata: p.metadata,
          }));

          const data = await this.fetchJson<BatchSendResponse>("/api/v1/emails/batch", {
            method: "POST",
            body: JSON.stringify(body),
          });

          return { data, error: null };
        } catch (err: any) {
          return {
            data: null,
            error: {
              message: err.message || "Batch dispatch failed",
              details: err.details,
            },
          };
        }
      },
    };
  }

  get stats() {
    return {
      get: async (): Promise<StatsResponse> => {
        return this.fetchJson<StatsResponse>("/api/v1/stats");
      },
    };
  }

  get suppressions() {
    return {
      list: async (): Promise<{ data: SuppressionItem[]; count: number }> => {
        return this.fetchJson<{ data: SuppressionItem[]; count: number }>("/api/v1/suppressions");
      },
      create: async (email: string, reason = "manual"): Promise<SuppressionItem> => {
        return this.fetchJson<SuppressionItem>("/api/v1/suppressions", {
          method: "POST",
          body: JSON.stringify({ email, reason }),
        });
      },
      delete: async (id: string): Promise<{ success: boolean; deleted: string }> => {
        return this.fetchJson<{ success: boolean; deleted: string }>(
          `/api/v1/suppressions/${encodeURIComponent(id)}`,
          { method: "DELETE" }
        );
      },
    };
  }

  get domains() {
    return {
      list: async () => {
        return this.fetchJson<{ domains: any[]; data: any[] }>("/api/v1/domains");
      },
      create: async (domain: string) => {
        return this.fetchJson<any>("/api/v1/domains", {
          method: "POST",
          body: JSON.stringify({ domain }),
        });
      },
      verify: async (id: string) => {
        return this.fetchJson<any>(`/api/v1/domains/${encodeURIComponent(id)}/verify`, {
          method: "POST",
        });
      },
    };
  }

  get webhooks() {
    return {
      /**
       * Verify an incoming Resend / Svix webhook signature.
       * Useful for backend endpoints handling deliverability events.
       */
      verifySignature: async (
        rawPayload: string,
        headers: {
          "svix-id"?: string;
          "svix-timestamp"?: string;
          "svix-signature"?: string;
          [key: string]: any;
        },
        secret: string
      ): Promise<boolean> => {
        const id = headers["svix-id"] || headers["Svix-Id"];
        const timestamp = headers["svix-timestamp"] || headers["Svix-Timestamp"];
        const signature = headers["svix-signature"] || headers["Svix-Signature"];

        if (!id || !timestamp || !signature || !secret) return false;

        // Check replay attack window (5 minutes)
        const tsSec = parseInt(timestamp, 10);
        const nowSec = Math.floor(Date.now() / 1000);
        if (isNaN(tsSec) || Math.abs(nowSec - tsSec) > 300) return false;

        try {
          const rawSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
          const binarySecret = Uint8Array.from(atob(rawSecret), (c) => c.charCodeAt(0));
          const signedContent = `${id}.${timestamp}.${rawPayload}`;
          const encoder = new TextEncoder();

          const key = await crypto.subtle.importKey(
            "raw",
            binarySecret,
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"]
          );

          const sigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(signedContent));
          const bytes = new Uint8Array(sigBuffer);
          let binary = "";
          for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
          const expectedSig = btoa(binary);

          const sigHeader = String(signature);
          const signatures = sigHeader.split(" ").map((s: string) => s.replace(/^v1,/, ""));
          return signatures.includes(expectedSig);
        } catch {
          return false;
        }
      },
    };
  }
}

/**
 * Resend Drop-In Replacement Alias
 * Allows existing code like `import { Resend } from "resend"` to simply use
 * `import { Resend } from "pitxmail"` or `import { Resend } from "@/lib/pitxmail"`
 */
export { Pitxmail as Resend };
export default Pitxmail;

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
  reply_to?: string; // Resend compatibility
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
  provider?: string;
  created_at: string;
}

export interface PitxmailError {
  message: string;
  details?: any;
}

export class Pitxmail {
  private apiKey: string;
  private baseUrl: string;

  constructor(options: PitxmailOptions) {
    if (!options.apiKey) {
      throw new Error("Pitxmail apiKey is required");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || process.env.NEXT_PUBLIC_PITXMAIL_URL || "https://pitxmail.pitacsdev.workers.dev").replace(/\/$/, "");
  }

  get emails() {
    return {
      send: async (
        payload: SendEmailPayload
      ): Promise<{ data: SendEmailResponse | null; error: PitxmailError | null }> => {
        try {
          const headers: Record<string, string> = {
            "Authorization": `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          };

          if (payload.idempotencyKey) {
            headers["Idempotency-Key"] = payload.idempotencyKey;
          }

          const res = await fetch(`${this.baseUrl}/api/v1/emails`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
          });

          const json = await res.json();

          if (!res.ok) {
            return {
              data: null,
              error: {
                message: json.error?.message || `Request failed with status ${res.status}`,
                details: json.error?.details,
              },
            };
          }

          return { data: json, error: null };
        } catch (err: any) {
          return {
            data: null,
            error: {
              message: err.message || "Network error",
            },
          };
        }
      },

      get: async (id: string) => {
        const res = await fetch(`${this.baseUrl}/api/v1/emails/${id}`, {
          headers: { "Authorization": `Bearer ${this.apiKey}` },
        });
        return res.json();
      },

      retry: async (id: string) => {
        const res = await fetch(`${this.baseUrl}/api/v1/emails/${id}/retry`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${this.apiKey}` },
        });
        return res.json();
      },

      list: async (params?: { status?: string; search?: string; limit?: number }) => {
        const query = new URLSearchParams();
        if (params?.status) query.append("status", params.status);
        if (params?.search) query.append("search", params.search);
        if (params?.limit) query.append("limit", String(params.limit));

        const res = await fetch(`${this.baseUrl}/api/v1/emails?${query.toString()}`, {
          headers: { "Authorization": `Bearer ${this.apiKey}` },
        });
        return res.json();
      },
    };
  }

  get domains() {
    return {
      list: async () => {
        const res = await fetch(`${this.baseUrl}/api/v1/domains`, {
          headers: { "Authorization": `Bearer ${this.apiKey}` },
        });
        return res.json();
      },

      create: async (domain: string) => {
        const res = await fetch(`${this.baseUrl}/api/v1/domains`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ domain }),
        });
        return res.json();
      },

      verify: async (id: string) => {
        const res = await fetch(`${this.baseUrl}/api/v1/domains/${id}/verify`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${this.apiKey}` },
        });
        return res.json();
      },
    };
  }
}

export default Pitxmail;

import { EmailProvider, OutboundEmailPayload, DeliveryResult } from "../types";

export class CloudflareEmailProvider implements EmailProvider {
  readonly name = "cloudflare";

  isConfigured(): boolean {
    // 1. Direct Cloudflare Worker send_email binding (available on globalThis or context)
    const hasWorkerBinding = typeof (globalThis as any).EMAIL !== "undefined" && typeof (globalThis as any).EMAIL.send === "function";
    // 2. Or configured via Pitxmail Cloudflare Worker Gateway URL
    const hasWorkerGateway = !!process.env.CLOUDFLARE_EMAIL_GATEWAY_URL;
    return hasWorkerBinding || hasWorkerGateway;
  }

  async send(payload: OutboundEmailPayload): Promise<DeliveryResult> {
    try {
      const globalEmail = (globalThis as any).EMAIL;

      // Direct Cloudflare Worker binding
      if (globalEmail && typeof globalEmail.send === "function") {
        for (const recipient of payload.to) {
          await globalEmail.send({
            to: recipient,
            from: {
              email: payload.from,
              name: payload.fromName || "Pitacs Mail",
            },
            subject: payload.subject,
            text: payload.text || "",
            html: payload.html || "",
          });
        }

        const cfMessageId = `cf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        return {
          status: "submitted",
          provider: this.name,
          providerMessageId: cfMessageId,
          rawResponse: JSON.stringify({ message: "Dispatched via Cloudflare send_email binding" }),
        };
      }

      // External Cloudflare Worker gateway proxy
      if (process.env.CLOUDFLARE_EMAIL_GATEWAY_URL) {
        const response = await fetch(process.env.CLOUDFLARE_EMAIL_GATEWAY_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.CLOUDFLARE_EMAIL_GATEWAY_SECRET || ""}`,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errText = await response.text();
          return {
            status: "failed",
            provider: this.name,
            errorReason: `Cloudflare gateway error (${response.status}): ${errText}`,
            retryable: response.status >= 500,
            rawResponse: errText,
          };
        }

        const data: any = await response.json();
        return {
          status: "submitted",
          provider: this.name,
          providerMessageId: data.id || `cf_${Date.now()}`,
          rawResponse: JSON.stringify(data),
        };
      }

      return {
        status: "failed",
        provider: this.name,
        errorReason: "Cloudflare Email binding or gateway URL not configured",
        retryable: false,
      };
    } catch (err: any) {
      return {
        status: "failed",
        provider: this.name,
        errorReason: err.message || "Failed to deliver via Cloudflare",
        retryable: true,
      };
    }
  }
}

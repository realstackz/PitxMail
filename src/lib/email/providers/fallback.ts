import { EmailProvider, OutboundEmailPayload, DeliveryResult } from "../types";

export class FallbackProvider implements EmailProvider {
  readonly name = "resend_fallback";

  isConfigured(): boolean {
    return !!process.env.RESEND_API_KEY;
  }

  async send(payload: OutboundEmailPayload): Promise<DeliveryResult> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return {
        status: "failed",
        provider: this.name,
        errorReason: "Resend fallback API key not provided",
        retryable: false,
      };
    }

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: payload.fromName ? `${payload.fromName} <${payload.from}>` : payload.from,
          to: payload.to,
          cc: payload.cc,
          bcc: payload.bcc,
          reply_to: payload.replyTo,
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
          tags: payload.tags ? Object.entries(payload.tags).map(([name, value]) => ({ name, value })) : undefined,
        }),
      });

      const data: any = await res.json();
      if (!res.ok) {
        return {
          status: "failed",
          provider: this.name,
          errorReason: data.message || `Resend error: ${res.statusText}`,
          retryable: res.status >= 500,
          rawResponse: JSON.stringify(data),
        };
      }

      return {
        status: "delivered",
        provider: this.name,
        providerMessageId: data.id,
        rawResponse: JSON.stringify(data),
      };
    } catch (err: any) {
      return {
        status: "failed",
        provider: this.name,
        errorReason: err.message || "Failed to reach fallback provider",
        retryable: true,
      };
    }
  }
}

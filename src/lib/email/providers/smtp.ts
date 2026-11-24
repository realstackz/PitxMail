import { EmailProvider, OutboundEmailPayload, DeliveryResult } from "../types";
import nodemailer from "nodemailer";

export class SmtpProvider implements EmailProvider {
  readonly name = "smtp";

  isConfigured(): boolean {
    return !!process.env.SMTP_HOST && !!process.env.SMTP_USER;
  }

  async send(payload: OutboundEmailPayload): Promise<DeliveryResult> {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || "587", 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const secure = process.env.SMTP_SECURE === "true" || port === 465;

    if (!host || !user) {
      return {
        status: "failed",
        provider: this.name,
        errorReason: "SMTP configuration missing (SMTP_HOST and SMTP_USER required)",
        retryable: false,
      };
    }

    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
          user,
          pass,
        },
        connectionTimeout: 10000,
      });

      const info = await transporter.sendMail({
        from: payload.fromName ? `"${payload.fromName}" <${payload.from}>` : payload.from,
        to: payload.to,
        cc: payload.cc,
        bcc: payload.bcc,
        replyTo: payload.replyTo,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
      });

      return {
        status: "delivered",
        provider: this.name,
        providerMessageId: info.messageId,
        rawResponse: JSON.stringify({ messageId: info.messageId, response: info.response }),
      };
    } catch (err: any) {
      return {
        status: "failed",
        provider: this.name,
        errorReason: err.message || "Failed to deliver via SMTP",
        retryable: true,
      };
    }
  }
}

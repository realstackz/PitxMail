import { db, initDb } from "@/lib/db";
import { messages, deliveryAttempts, suppressions, idempotencyKeys } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { SendEmailRequest, OutboundEmailPayload, DeliveryResult, EmailProvider } from "./types";
import { CloudflareEmailProvider } from "./providers/cloudflare";
import { SmtpProvider } from "./providers/smtp";
import { FallbackProvider } from "./providers/fallback";
import { MockProvider } from "./providers/mock";
import crypto from "crypto";

function parseEmailAddress(raw: string): { address: string; name?: string } {
  const match = raw.match(/^(?:(.*?)<)?([^<>\s]+@[^<>\s]+)>?$/);
  if (match) {
    const name = match[1]?.trim().replace(/^["']|["']$/g, "");
    return { address: match[2].toLowerCase(), name: name || undefined };
  }
  return { address: raw.trim().toLowerCase() };
}

function formatDiagnosticError(rawError: string | undefined): string | undefined {
  if (!rawError) return undefined;
  if (rawError.includes("domain was not found") || rawError.includes("could not find account config")) {
    return "Cloudflare Domain Verification Pending: Domain must be added to your Cloudflare account to send outbound emails.";
  }
  if (rawError.includes("Missing domain or user") || rawError.includes("Invalid email address")) {
    return "Invalid sender address format. Expected valid RFC5322 email like 'Sender <user@domain.com>'.";
  }
  return rawError;
}

export class EmailEngine {
  private providers: EmailProvider[];

  constructor() {
    this.providers = [
      new CloudflareEmailProvider(),
      new SmtpProvider(),
      new FallbackProvider(),
      new MockProvider(),
    ];
  }

  private getConfiguredProviders(): EmailProvider[] {
    const configured = this.providers.filter((p) => p.isConfigured());
    // If no real provider is configured, always include the MockProvider
    if (configured.length === 0 || (configured.length === 1 && configured[0].name === "mock")) {
      return [new MockProvider()];
    }
    return configured;
  }

  async sendEmail(
    params: SendEmailRequest,
    context: { organisationId: string; projectId: string }
  ): Promise<{ messageId: string; status: string; provider: string; error?: string }> {
    await initDb();

    const toAddresses = Array.isArray(params.to) ? params.to : [params.to];
    const normalizedTo = toAddresses.map((a) => parseEmailAddress(a).address);
    const { address: fromAddr, name: fromName } = parseEmailAddress(params.from);

    // 1. Idempotency Check
    if (params.idempotencyKey) {
      const keyHash = crypto.createHash("sha256").update(params.idempotencyKey).digest("hex");
      const existing = await db
        .select()
        .from(idempotencyKeys)
        .where(
          and(
            eq(idempotencyKeys.projectId, context.projectId),
            eq(idempotencyKeys.keyHash, keyHash)
          )
        )
        .limit(1);

      if (existing.length > 0 && existing[0].expiresAt > Date.now()) {
        const cachedMsg = await db
          .select()
          .from(messages)
          .where(eq(messages.id, existing[0].messageId))
          .limit(1);

        if (cachedMsg.length > 0) {
          return {
            messageId: cachedMsg[0].id,
            status: cachedMsg[0].status,
            provider: cachedMsg[0].provider || "cached",
          };
        }
      }
    }

    // 2. Suppression Check
    for (const addr of normalizedTo) {
      const suppressed = await db
        .select()
        .from(suppressions)
        .where(
          and(
            eq(suppressions.organisationId, context.organisationId),
            eq(suppressions.email, addr)
          )
        )
        .limit(1);

      if (suppressed.length > 0) {
        throw new Error(`Recipient ${addr} is on the suppression list (reason: ${suppressed[0].reason})`);
      }
    }

    // 3. Create Message in Database
    const messageId = `pm_msg_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const now = Date.now();

    await db.insert(messages).values({
      id: messageId,
      organisationId: context.organisationId,
      projectId: context.projectId,
      fromAddress: fromAddr,
      fromName: fromName,
      toAddress: normalizedTo.join(", "),
      ccAddress: params.cc ? (Array.isArray(params.cc) ? params.cc.join(", ") : params.cc) : null,
      bccAddress: params.bcc ? (Array.isArray(params.bcc) ? params.bcc.join(", ") : params.bcc) : null,
      replyTo: params.replyTo || null,
      subject: params.subject,
      htmlBody: params.html || null,
      textBody: params.text || null,
      status: "accepted",
      idempotencyKey: params.idempotencyKey || null,
      tags: params.tags ? JSON.stringify(params.tags) : null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      createdAt: now,
      updatedAt: now,
    });

    if (params.idempotencyKey) {
      const keyHash = crypto.createHash("sha256").update(params.idempotencyKey).digest("hex");
      const requestHash = crypto.createHash("sha256").update(JSON.stringify(params)).digest("hex");
      await db.insert(idempotencyKeys).values({
        projectId: context.projectId,
        keyHash,
        requestHash,
        messageId,
        expiresAt: now + 24 * 60 * 60 * 1000,
      });
    }

    // 4. Cascade Dispatch Loop across Configured Providers
    const providersToTry = this.getConfiguredProviders();
    const payload: OutboundEmailPayload = {
      id: messageId,
      from: fromAddr,
      fromName,
      to: normalizedTo,
      cc: params.cc ? (Array.isArray(params.cc) ? params.cc : [params.cc]) : undefined,
      bcc: params.bcc ? (Array.isArray(params.bcc) ? params.bcc : [params.bcc]) : undefined,
      replyTo: params.replyTo,
      subject: params.subject,
      html: params.html,
      text: params.text,
      tags: params.tags,
      metadata: params.metadata,
    };

    let finalResult: DeliveryResult = {
      status: "failed",
      provider: "none",
      errorReason: "No delivery provider succeeded",
    };

    let attemptNumber = 1;
    for (const provider of providersToTry) {
      const attemptId = `att_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
      const startedAt = Date.now();

      await db.insert(deliveryAttempts).values({
        id: attemptId,
        messageId,
        attemptNumber,
        provider: provider.name,
        status: "pending",
        startedAt,
      });

      let res: DeliveryResult;
      try {
        res = await provider.send(payload);
      } catch (err: any) {
        res = {
          status: "failed",
          provider: provider.name,
          errorReason: err.message || "Dispatch execution error",
          retryable: true,
        };
      }

      const finishedAt = Date.now();
      const diagnostic = formatDiagnosticError(res.errorReason);

      await db
        .update(deliveryAttempts)
        .set({
          status: res.status === "failed" ? "failed" : "success",
          errorMessage: diagnostic || null,
          providerResponse: res.rawResponse || null,
          finishedAt,
        })
        .where(eq(deliveryAttempts.id, attemptId));

      finalResult = { ...res, errorReason: diagnostic };

      if (res.status === "delivered" || res.status === "submitted") {
        break;
      }

      attemptNumber++;
    }

    // 5. Update Final Status on Message Record
    await db
      .update(messages)
      .set({
        status: finalResult.status,
        provider: finalResult.provider,
        providerMessageId: finalResult.providerMessageId || null,
        errorReason: finalResult.errorReason || null,
        deliveredAt: finalResult.status === "delivered" ? Date.now() : null,
        updatedAt: Date.now(),
      })
      .where(eq(messages.id, messageId));

    return {
      messageId,
      status: finalResult.status,
      provider: finalResult.provider,
      error: finalResult.errorReason,
    };
  }

  async retryEmail(messageId: string): Promise<{ success: boolean; status: string; error?: string }> {
    await initDb();

    const existing = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);

    if (existing.length === 0) {
      throw new Error("Message not found");
    }

    const msg = existing[0];
    const newRetryCount = msg.retryCount + 1;

    const payload: OutboundEmailPayload = {
      id: msg.id,
      from: msg.fromAddress,
      fromName: msg.fromName || undefined,
      to: msg.toAddress.split(",").map((s) => s.trim()),
      cc: msg.ccAddress ? msg.ccAddress.split(",").map((s) => s.trim()) : undefined,
      bcc: msg.bccAddress ? msg.bccAddress.split(",").map((s) => s.trim()) : undefined,
      replyTo: msg.replyTo || undefined,
      subject: msg.subject,
      html: msg.htmlBody || undefined,
      text: msg.textBody || undefined,
      tags: msg.tags ? JSON.parse(msg.tags) : undefined,
      metadata: msg.metadata ? JSON.parse(msg.metadata) : undefined,
    };

    const providersToTry = this.getConfiguredProviders();
    let finalResult: DeliveryResult = {
      status: "failed",
      provider: "none",
      errorReason: "Retry failed across all providers",
    };

    let attemptNum = newRetryCount + 1;
    for (const provider of providersToTry) {
      const attemptId = `att_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
      const startedAt = Date.now();

      await db.insert(deliveryAttempts).values({
        id: attemptId,
        messageId: msg.id,
        attemptNumber: attemptNum,
        provider: provider.name,
        status: "pending",
        startedAt,
      });

      let res: DeliveryResult;
      try {
        res = await provider.send(payload);
      } catch (err: any) {
        res = {
          status: "failed",
          provider: provider.name,
          errorReason: err.message || "Retry attempt failed",
          retryable: true,
        };
      }

      const finishedAt = Date.now();
      const diagnostic = formatDiagnosticError(res.errorReason);

      await db
        .update(deliveryAttempts)
        .set({
          status: res.status === "failed" ? "failed" : "success",
          errorMessage: diagnostic || null,
          providerResponse: res.rawResponse || null,
          finishedAt,
        })
        .where(eq(deliveryAttempts.id, attemptId));

      finalResult = { ...res, errorReason: diagnostic };

      if (res.status === "delivered" || res.status === "submitted") {
        break;
      }
      attemptNum++;
    }

    await db
      .update(messages)
      .set({
        status: finalResult.status,
        provider: finalResult.provider,
        providerMessageId: finalResult.providerMessageId || null,
        errorReason: finalResult.errorReason || null,
        retryCount: newRetryCount,
        deliveredAt: finalResult.status === "delivered" ? Date.now() : null,
        updatedAt: Date.now(),
      })
      .where(eq(messages.id, msg.id));

    return {
      success: finalResult.status !== "failed",
      status: finalResult.status,
      error: finalResult.errorReason,
    };
  }
}

export const emailEngine = new EmailEngine();

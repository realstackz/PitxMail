import { db, initDb } from "@/lib/db";
import { messages, deliveryAttempts, suppressions, idempotencyKeys } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { SendEmailRequest, OutboundEmailPayload, DeliveryResult, EmailProvider } from "./types";
import { CloudflareEmailProvider } from "./providers/cloudflare";
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

export class EmailEngine {
  private providers: EmailProvider[];

  constructor() {
    this.providers = [
      new CloudflareEmailProvider(),
      new FallbackProvider(),
      new MockProvider(),
    ];
  }

  private getActiveProvider(): EmailProvider {
    for (const provider of this.providers) {
      if (provider.isConfigured()) {
        return provider;
      }
    }
    return new MockProvider();
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

    // Save idempotency key if specified (valid for 24 hours)
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

    // 4. Attempt Dispatch
    const provider = this.getActiveProvider();
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

    const attemptId = `att_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const startedAt = Date.now();

    await db.insert(deliveryAttempts).values({
      id: attemptId,
      messageId,
      attemptNumber: 1,
      provider: provider.name,
      status: "pending",
      startedAt,
    });

    let result: DeliveryResult;
    try {
      result = await provider.send(payload);
    } catch (err: any) {
      result = {
        status: "failed",
        provider: provider.name,
        errorReason: err.message || "Unexpected dispatch error",
        retryable: true,
      };
    }

    const finishedAt = Date.now();

    // 5. Update Delivery Attempt
    await db
      .update(deliveryAttempts)
      .set({
        status: result.status === "failed" ? "failed" : "success",
        errorMessage: result.errorReason || null,
        providerResponse: result.rawResponse || null,
        finishedAt,
      })
      .where(eq(deliveryAttempts.id, attemptId));

    // 6. Update Message Record
    await db
      .update(messages)
      .set({
        status: result.status,
        provider: result.provider,
        providerMessageId: result.providerMessageId || null,
        errorReason: result.errorReason || null,
        deliveredAt: result.status === "delivered" ? finishedAt : null,
        updatedAt: finishedAt,
      })
      .where(eq(messages.id, messageId));

    return {
      messageId,
      status: result.status,
      provider: result.provider,
      error: result.errorReason,
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
    const provider = this.getActiveProvider();

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

    const attemptId = `att_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const startedAt = Date.now();

    await db.insert(deliveryAttempts).values({
      id: attemptId,
      messageId: msg.id,
      attemptNumber: newRetryCount + 1,
      provider: provider.name,
      status: "pending",
      startedAt,
    });

    let result: DeliveryResult;
    try {
      result = await provider.send(payload);
    } catch (err: any) {
      result = {
        status: "failed",
        provider: provider.name,
        errorReason: err.message || "Retry delivery failed",
        retryable: true,
      };
    }

    const finishedAt = Date.now();

    await db
      .update(deliveryAttempts)
      .set({
        status: result.status === "failed" ? "failed" : "success",
        errorMessage: result.errorReason || null,
        providerResponse: result.rawResponse || null,
        finishedAt,
      })
      .where(eq(deliveryAttempts.id, attemptId));

    await db
      .update(messages)
      .set({
        status: result.status,
        provider: result.provider,
        providerMessageId: result.providerMessageId || null,
        errorReason: result.errorReason || null,
        retryCount: newRetryCount,
        deliveredAt: result.status === "delivered" ? finishedAt : null,
        updatedAt: finishedAt,
      })
      .where(eq(messages.id, msg.id));

    return {
      success: result.status !== "failed",
      status: result.status,
      error: result.errorReason,
    };
  }
}

export const emailEngine = new EmailEngine();

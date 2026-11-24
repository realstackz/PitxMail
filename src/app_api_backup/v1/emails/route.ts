import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-key";
import { emailEngine } from "@/lib/email/engine";
import { db, initDb } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { desc, eq, like, or, and } from "drizzle-orm";
import { z } from "zod";

const sendEmailSchema = z.object({
  from: z.string().min(3, "Sender address is required"),
  to: z.union([z.string().email(), z.array(z.string().email()).min(1)]),
  cc: z.union([z.string(), z.array(z.string())]).optional(),
  bcc: z.union([z.string(), z.array(z.string())]).optional(),
  replyTo: z.string().optional(),
  reply_to: z.string().optional(), // Resend compatibility
  subject: z.string().min(1, "Subject is required"),
  html: z.string().optional(),
  text: z.string().optional(),
  tags: z.record(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    const body = await req.json();

    const validated = sendEmailSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        {
          error: {
            message: "Validation failed",
            details: validated.error.flatten(),
          },
        },
        { status: 422 }
      );
    }

    const idempotencyKey =
      req.headers.get("Idempotency-Key") || req.headers.get("X-Idempotency-Key") || undefined;

    const data = validated.data;
    const result = await emailEngine.sendEmail(
      {
        from: data.from,
        to: data.to,
        cc: data.cc,
        bcc: data.bcc,
        replyTo: data.replyTo || data.reply_to,
        subject: data.subject,
        html: data.html,
        text: data.text,
        tags: data.tags,
        metadata: data.metadata,
        idempotencyKey,
      },
      {
        organisationId: auth.organisationId,
        projectId: auth.projectId,
      }
    );

    return NextResponse.json(
      {
        id: result.messageId,
        object: "email",
        status: result.status,
        provider: result.provider,
        error: result.error,
        created_at: new Date().toISOString(),
      },
      { status: result.status === "failed" ? 502 : 200 }
    );
  } catch (err: any) {
    const isAuthError = err.message?.includes("API key") || err.message?.includes("Authorization");
    return NextResponse.json(
      {
        error: {
          message: err.message || "Internal server error",
        },
      },
      { status: isAuthError ? 401 : 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    await initDb();
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const search = url.searchParams.get("search");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    let query = db.select().from(messages);
    const conditions = [];

    if (status && status !== "all") {
      conditions.push(eq(messages.status, status));
    }

    if (search) {
      conditions.push(
        or(
          like(messages.toAddress, `%${search}%`),
          like(messages.subject, `%${search}%`),
          like(messages.id, `%${search}%`)
        )
      );
    }

    const data = await db
      .select()
      .from(messages)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(messages.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      data,
      count: data.length,
      limit,
      offset,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

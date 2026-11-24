import { NextRequest, NextResponse } from "next/server";
import { db, initDb } from "@/lib/db";
import { messages, deliveryAttempts } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await initDb();
    const { id } = await params;

    const msg = await db
      .select()
      .from(messages)
      .where(eq(messages.id, id))
      .limit(1);

    if (msg.length === 0) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const attempts = await db
      .select()
      .from(deliveryAttempts)
      .where(eq(deliveryAttempts.messageId, id))
      .orderBy(desc(deliveryAttempts.attemptNumber));

    return NextResponse.json({
      message: msg[0],
      attempts,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

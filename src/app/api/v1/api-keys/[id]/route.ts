import { NextRequest, NextResponse } from "next/server";
import { db, initDb } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await initDb();
    const { id } = await params;

    await db
      .update(apiKeys)
      .set({ revokedAt: Date.now() })
      .where(eq(apiKeys.id, id));

    return NextResponse.json({ success: true, message: "API key revoked" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

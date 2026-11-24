import { NextResponse } from "next/server";
import { db, initDb } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    await initDb();

    const counts = await db
      .select({
        status: messages.status,
        count: sql<number>`count(*)`,
      })
      .from(messages)
      .groupBy(messages.status);

    let total = 0;
    let delivered = 0;
    let failed = 0;
    let accepted = 0;

    for (const item of counts) {
      const c = Number(item.count);
      total += c;
      if (item.status === "delivered" || item.status === "submitted") {
        delivered += c;
      } else if (item.status === "failed" || item.status === "bounced") {
        failed += c;
      } else {
        accepted += c;
      }
    }

    const deliveryRate = total > 0 ? ((delivered / total) * 100).toFixed(1) : "100.0";

    // 24 hour count
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const last24hResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(sql`${messages.createdAt} >= ${oneDayAgo}`);

    const volume24h = Number(last24hResult[0]?.count || 0);

    return NextResponse.json({
      total,
      delivered,
      failed,
      accepted,
      deliveryRate: `${deliveryRate}%`,
      volume24h,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

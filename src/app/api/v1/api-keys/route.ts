import { NextRequest, NextResponse } from "next/server";
import { db, initDb } from "@/lib/db";
import { apiKeys, projects } from "@/lib/db/schema";
import { generateApiKey } from "@/lib/auth/api-key";
import { desc, isNull, eq } from "drizzle-orm";
import crypto from "crypto";

export async function GET() {
  try {
    await initDb();
    const keys = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        scopes: apiKeys.scopes,
        environment: projects.environment,
        projectName: projects.name,
        lastUsedAt: apiKeys.lastUsedAt,
        revokedAt: apiKeys.revokedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .leftJoin(projects, eq(apiKeys.projectId, projects.id))
      .orderBy(desc(apiKeys.createdAt));

    return NextResponse.json({ keys });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await initDb();
    const body = await req.json();
    const name = body.name?.trim() || "New API Key";
    const environment: "live" | "test" = body.environment === "test" ? "test" : "live";

    const { key, keyPrefix, keyHash } = generateApiKey(environment);
    const keyId = `key_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const now = Date.now();

    await db.insert(apiKeys).values({
      id: keyId,
      organisationId: "org_pitacs",
      projectId: "proj_pitacs_hub",
      name,
      keyPrefix,
      keyHash,
      scopes: "emails:send,emails:read",
      createdAt: now,
    });

    return NextResponse.json({
      id: keyId,
      name,
      key, // Returned ONCE upon creation
      keyPrefix,
      environment,
      created_at: new Date(now).toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import crypto from "crypto";
import { db, initDb } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";

export interface AuthContext {
  keyId: string;
  organisationId: string;
  projectId: string;
  scopes: string[];
}

export function generateApiKey(environment: "live" | "test" = "live"): {
  key: string;
  keyPrefix: string;
  keyHash: string;
} {
  const randomSecret = crypto.randomBytes(24).toString("hex");
  const key = `pm_${environment}_${randomSecret}`;
  const keyPrefix = `pm_${environment}_${randomSecret.slice(0, 6)}...`;
  const keyHash = crypto.createHash("sha256").update(key).digest("hex");

  return { key, keyPrefix, keyHash };
}

export async function authenticateRequest(req: Request): Promise<AuthContext> {
  await initDb();

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header. Expected 'Bearer pm_live_...'");
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const results = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, tokenHash), isNull(apiKeys.revokedAt)))
    .limit(1);

  if (results.length === 0) {
    throw new Error("Invalid or revoked API key");
  }

  const keyRecord = results[0];

  if (keyRecord.expiresAt && keyRecord.expiresAt < Date.now()) {
    throw new Error("API key has expired");
  }

  // Update lastUsedAt asynchronously
  db.update(apiKeys)
    .set({ lastUsedAt: Date.now() })
    .where(eq(apiKeys.id, keyRecord.id))
    .catch((err) => console.error("Failed to update key lastUsedAt:", err));

  return {
    keyId: keyRecord.id,
    organisationId: keyRecord.organisationId,
    projectId: keyRecord.projectId,
    scopes: keyRecord.scopes.split(",").map((s) => s.trim()),
  };
}

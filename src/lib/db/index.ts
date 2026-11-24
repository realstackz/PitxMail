import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";
import fs from "fs";
import path from "path";

// Ensure local storage directory exists in Node runtime
const dbDir = path.join(process.cwd(), ".pitxmail");
if (typeof window === "undefined" && !fs.existsSync(dbDir)) {
  try {
    fs.mkdirSync(dbDir, { recursive: true });
  } catch {
    // Ignore in edge environments
  }
}

const dbUrl = process.env.DATABASE_URL || `file:${path.join(dbDir, "pitxmail.db")}`;

const client = createClient({
  url: dbUrl,
});

export const db = drizzle(client, { schema });

// Auto-initialize tables and seed default Pitacs tenant if not exists
let isInitialized = false;

export async function initDb() {
  if (isInitialized) return;

  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS organisations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL
      );
    `);

    await client.execute(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        environment TEXT NOT NULL DEFAULT 'production',
        created_at INTEGER NOT NULL
      );
    `);

    await client.execute(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        key_prefix TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        scopes TEXT NOT NULL DEFAULT 'emails:send,emails:read',
        expires_at INTEGER,
        revoked_at INTEGER,
        last_used_at INTEGER,
        created_at INTEGER NOT NULL
      );
    `);

    await client.execute(`
      CREATE TABLE IF NOT EXISTS domains (
        id TEXT PRIMARY KEY,
        organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
        domain TEXT NOT NULL UNIQUE,
        verification_status TEXT NOT NULL DEFAULT 'pending',
        dkim_status TEXT NOT NULL DEFAULT 'pending',
        spf_status TEXT NOT NULL DEFAULT 'pending',
        dmarc_status TEXT NOT NULL DEFAULT 'pending',
        mx_status TEXT NOT NULL DEFAULT 'pending',
        dns_records TEXT,
        created_at INTEGER NOT NULL
      );
    `);

    await client.execute(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        from_address TEXT NOT NULL,
        from_name TEXT,
        to_address TEXT NOT NULL,
        cc_address TEXT,
        bcc_address TEXT,
        reply_to TEXT,
        subject TEXT NOT NULL,
        html_body TEXT,
        text_body TEXT,
        status TEXT NOT NULL DEFAULT 'accepted',
        provider TEXT,
        provider_message_id TEXT,
        error_reason TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        idempotency_key TEXT,
        tags TEXT,
        metadata TEXT,
        scheduled_at INTEGER,
        delivered_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    await client.execute(`
      CREATE TABLE IF NOT EXISTS delivery_attempts (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        attempt_number INTEGER NOT NULL,
        provider TEXT NOT NULL,
        status TEXT NOT NULL,
        error_message TEXT,
        provider_response TEXT,
        started_at INTEGER NOT NULL,
        finished_at INTEGER
      );
    `);

    await client.execute(`
      CREATE TABLE IF NOT EXISTS suppressions (
        id TEXT PRIMARY KEY,
        organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    await client.execute(`
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        key_hash TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL,
        PRIMARY KEY (project_id, key_hash)
      );
    `);

    // Ensure default Pitacs organization and default project exist
    const now = Date.now();
    await client.execute({
      sql: `INSERT OR IGNORE INTO organisations (id, name, slug, status, created_at) VALUES (?, ?, ?, ?, ?)`,
      args: ["org_pitacs", "Pitacs Ltd", "pitacs", "active", now],
    });

    await client.execute({
      sql: `INSERT OR IGNORE INTO projects (id, organisation_id, name, environment, created_at) VALUES (?, ?, ?, ?, ?)`,
      args: ["proj_pitacs_hub", "org_pitacs", "Pitacs Hub", "production", now],
    });

    // Check if any API key exists; if not, create an initial default live key for testing
    const existingKeys = await client.execute(`SELECT id FROM api_keys LIMIT 1`);
    if (existingKeys.rows.length === 0) {
      // Key: pm_live_default_pitacs_key_2026
      // Precomputed SHA-256 for: pm_live_default_pitacs_key_2026
      const defaultKey = "pm_live_default_pitacs_key_2026";
      const keyPrefix = "pm_live_def...";
      // We'll compute hash via crypto
      const crypto = await import("crypto");
      const keyHash = crypto.createHash("sha256").update(defaultKey).digest("hex");

      await client.execute({
        sql: `INSERT INTO api_keys (id, organisation_id, project_id, name, key_prefix, key_hash, scopes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          "key_default_hub",
          "org_pitacs",
          "proj_pitacs_hub",
          "Default Pitacs Hub Key",
          keyPrefix,
          keyHash,
          "emails:send,emails:read",
          now,
        ],
      });
    }

    isInitialized = true;
  } catch (err) {
    console.error("Database initialization error:", err);
  }
}

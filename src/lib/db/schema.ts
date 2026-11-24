import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";

export const organisations = sqliteTable("organisations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: text("status").notNull().default("active"),
  createdAt: integer("created_at").notNull(),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  organisationId: text("organisation_id")
    .notNull()
    .references(() => organisations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  environment: text("environment").notNull().default("production"), // 'production' | 'test'
  createdAt: integer("created_at").notNull(),
});

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  organisationId: text("organisation_id")
    .notNull()
    .references(() => organisations.id, { onDelete: "cascade" }),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  keyPrefix: text("key_prefix").notNull(), // e.g. pm_live_xxxx
  keyHash: text("key_hash").notNull().unique(), // sha256 hash
  scopes: text("scopes").notNull().default("emails:send,emails:read"),
  expiresAt: integer("expires_at"),
  revokedAt: integer("revoked_at"),
  lastUsedAt: integer("last_used_at"),
  createdAt: integer("created_at").notNull(),
});

export const domains = sqliteTable("domains", {
  id: text("id").primaryKey(),
  organisationId: text("organisation_id")
    .notNull()
    .references(() => organisations.id, { onDelete: "cascade" }),
  domain: text("domain").notNull().unique(),
  verificationStatus: text("verification_status").notNull().default("pending"), // 'verified' | 'pending' | 'failed'
  dkimStatus: text("dkim_status").notNull().default("pending"),
  spfStatus: text("spf_status").notNull().default("pending"),
  dmarcStatus: text("dmarc_status").notNull().default("pending"),
  mxStatus: text("mx_status").notNull().default("pending"),
  dnsRecords: text("dns_records"), // JSON stringified DNS records
  createdAt: integer("created_at").notNull(),
});

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(), // pm_msg_...
    organisationId: text("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    fromAddress: text("from_address").notNull(),
    fromName: text("from_name"),
    toAddress: text("to_address").notNull(), // Comma-separated or JSON array
    ccAddress: text("cc_address"),
    bccAddress: text("bcc_address"),
    replyTo: text("reply_to"),
    subject: text("subject").notNull(),
    htmlBody: text("html_body"),
    textBody: text("text_body"),
    status: text("status").notNull().default("accepted"), // 'accepted' | 'queued' | 'submitted' | 'delivered' | 'failed' | 'bounced'
    provider: text("provider"), // 'cloudflare' | 'smtp' | 'resend' | 'mock'
    providerMessageId: text("provider_message_id"),
    errorReason: text("error_reason"),
    retryCount: integer("retry_count").notNull().default(0),
    idempotencyKey: text("idempotency_key"),
    tags: text("tags"), // JSON stringified key-value tags
    metadata: text("metadata"), // JSON stringified metadata
    scheduledAt: integer("scheduled_at"),
    deliveredAt: integer("delivered_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_messages_org_created").on(table.organisationId, table.createdAt),
    index("idx_messages_status").on(table.status),
    index("idx_messages_to").on(table.toAddress),
  ]
);

export const deliveryAttempts = sqliteTable(
  "delivery_attempts",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    provider: text("provider").notNull(),
    status: text("status").notNull(), // 'success' | 'failed' | 'pending'
    errorMessage: text("error_message"),
    providerResponse: text("provider_response"),
    startedAt: integer("started_at").notNull(),
    finishedAt: integer("finished_at"),
  },
  (table) => [
    index("idx_delivery_message").on(table.messageId),
  ]
);

export const suppressions = sqliteTable("suppressions", {
  id: text("id").primaryKey(),
  organisationId: text("organisation_id")
    .notNull()
    .references(() => organisations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  reason: text("reason").notNull(), // 'bounce' | 'complaint' | 'unsubscribe'
  createdAt: integer("created_at").notNull(),
});

export const idempotencyKeys = sqliteTable(
  "idempotency_keys",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    keyHash: text("key_hash").notNull(),
    requestHash: text("request_hash").notNull(),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.keyHash] }),
  ]
);

export type Organisation = typeof organisations.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type Domain = typeof domains.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type DeliveryAttempt = typeof deliveryAttempts.$inferSelect;
export type Suppression = typeof suppressions.$inferSelect;

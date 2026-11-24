# Pitxmail ⚡

> **Fast, Zero-Cost, Cloudflare-Native Email Infrastructure**  
> Built for internal Pitacs projects first, expanding into multi-tenant SaaS. A developer-first drop-in replacement for Resend, SendGrid, and Mailgun.

---

## 🚀 Features

- **Zero External Subscription Costs:** Runs 100% on Cloudflare's $5 Workers plan using **Cloudflare Email Sending** (`send_email` binding) and **Cloudflare D1** SQLite on the edge.
- **Drop-in Resend Compatibility:** Simple REST API (`POST /api/v1/emails`) and TypeScript SDK with familiar syntax.
- **Delivery Visibility & 1-Click Retry:** Real-time log of every email sent, recipient address, delivery attempts, error traces, HTML/text previews, and a 1-click retry engine for failed dispatches.
- **Multi-Tenant Foundation from Day 1:** Logical isolation by Organizations, Projects, Domains, and scoped API keys (`pm_live_...`, `pm_test_...`).
- **Interactive Dashboard:** Modern dark-mode UI with Overview analytics, Outbound email inspector, Sending Domains DNS verification (SPF, DKIM, DMARC), API Keys manager, and live Email Playground.
- **Pluggable Providers:** Native Cloudflare Worker sending, fallback to Resend/SMTP when desired, and instant local dev mock provider.

---

## 🛠️ Tech Stack

- **Framework:** Next.js 15 (App Router, Server Actions, Route Handlers)
- **Language:** TypeScript 5
- **Styling:** Tailwind CSS, Lucide Icons, Modern Dark UI
- **Database:** Cloudflare D1 / LibSQL SQLite with **Drizzle ORM**
- **Edge Deployment:** Cloudflare Workers (`wrangler`)

---

## ⚡ Quickstart (Local Development)

Clone and run locally in under 60 seconds without needing external accounts:

```bash
# 1. Install dependencies
pnpm install

# 2. Start the development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to access the Pitxmail Dashboard.

The database auto-initializes tables and a default Pitacs live API key (`pm_live_default_pitacs_key_2026`) in `.pitxmail/pitxmail.db`.

---

## 📦 Using the TypeScript SDK

You can drop `Pitxmail` directly into any other Pitacs project (e.g. Pitacs Hub, Trendkit):

```typescript
import { Pitxmail } from "./lib/pitxmail";

const pitxmail = new Pitxmail({
  apiKey: process.env.PITXMAIL_API_KEY || "pm_live_default_pitacs_key_2026",
  baseUrl: process.env.PITXMAIL_BASE_URL || "http://localhost:3000",
});

// Send an email
const { data, error } = await pitxmail.emails.send({
  from: "Pitacs Notifications <noreply@pitacs.com>",
  to: ["staff@pitacs.com"],
  subject: "Overtime Claim Approved",
  html: "<h2>Your overtime claim #104 has been approved.</h2>",
  tags: {
    system: "pitacs-hub",
    category: "overtime",
  },
});

if (error) {
  console.error("Email failed:", error.message);
} else {
  console.log("Delivered message ID:", data.id);
}
```

---

## 🌐 Cloudflare Deployment ($5 Plan)

### 1. Enable Cloudflare Email Sending
In your Cloudflare Dashboard:
1. Navigate to your domain (e.g. `pitacs.com`).
2. Go to **Compute > Email Service > Email Sending** (or run `npx wrangler email sending enable pitacs.com`).
3. Cloudflare will automatically set up SPF, DKIM, and DMARC DNS records.

### 2. Create the D1 Database
```bash
npx wrangler d1 create pitxmail-db
```
Copy the generated `database_id` into `wrangler.jsonc`.

### 3. Deploy
```bash
# Deploy standalone high-performance Worker API
pnpm worker:deploy

# Or deploy Next.js dashboard
pnpm build
```

---

## 📡 REST API Reference

### Send Email
`POST /api/v1/emails`

**Headers:**
```http
Authorization: Bearer pm_live_...
Content-Type: application/json
Idempotency-Key: optional-uuid-v4
```

**Body:**
```json
{
  "from": "Pitacs <noreply@pitacs.com>",
  "to": ["user@example.com"],
  "subject": "System Notice",
  "html": "<p>Notice content</p>",
  "text": "Notice content",
  "tags": { "type": "transactional" }
}
```

**Response (200 OK):**
```json
{
  "id": "pm_msg_1732445829104",
  "object": "email",
  "status": "delivered",
  "provider": "cloudflare",
  "created_at": "2026-11-24T10:48:00.000Z"
}
```

### Retry Failed Email
`POST /api/v1/emails/:id/retry`

Triggers an immediate re-delivery attempt and records the attempt log in the database.

---

## 🔒 Security Model

- **Hashed API Keys:** Only SHA-256 hashes are stored in the database. Raw tokens are displayed once upon creation.
- **Tenant Isolation:** Every message, attempt, and domain belongs to a validated `organisation_id` and `project_id`.
- **Suppression Protection:** Bounced and unsubscribed addresses are automatically prevented from receiving further dispatches.
- **Idempotency Guard:** Prevents duplicate sends when network timeouts occur.

---

## 📄 License
MIT © Pitacs Ltd

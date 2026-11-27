# Pitxmail API Reference & Developer Guide

Pitxmail is Pitacs' high-reliability transactional email infrastructure built on Cloudflare Workers, Cloudflare D1, and Cloudflare Email Sending, featuring automatic hybrid failover to/from Resend.

---

## 1. Credentials & Endpoints

| Parameter | Value |
| :--- | :--- |
| **Production URL** | `https://mail.pitx.uk` |
| **API Base URL** | `https://mail.pitx.uk/api/v1` |
| **Fallback URL** | `https://pitxmail.pitacsdev.workers.dev/api/v1` |
| **Send Email** | `POST https://mail.pitx.uk/api/v1/emails` |
| **List Emails** | `GET https://mail.pitx.uk/api/v1/emails` |
| **Email Detail** | `GET https://mail.pitx.uk/api/v1/emails/:id` |
| **Retry Email** | `POST https://mail.pitx.uk/api/v1/emails/:id/retry` |
| **Download EML** | `GET https://mail.pitx.uk/api/v1/emails/:id/eml` |
| **Telemetry & Stats** | `GET https://mail.pitx.uk/api/v1/stats` |
| **Suppressions** | `GET / POST / DELETE https://mail.pitx.uk/api/v1/suppressions` |
| **Resend Webhook** | `POST https://mail.pitx.uk/api/webhooks/resend` |
| **Health Check** | `GET https://mail.pitx.uk/health` (Public) |
| **Verified Sender Domains** | `@pitx.uk`, `@pitacs.pitx.uk` |
| **Authentication** | `Authorization: Bearer <PITXMAIL_API_KEY>` |

---

## 2. Hybrid Failover Architecture

Pitxmail implements intelligent multi-provider routing:
1. **Primary Route (Resend)**: Outbound emails route through Resend up to your configured daily quota (99 emails/day).
2. **Automatic Edge Failover (Cloudflare)**: When daily quota is exhausted, or upon receiving HTTP 429 / 5xx, Pitxmail automatically trips a circuit breaker and routes traffic to Cloudflare Email Sending.
3. **Transparent Recovery**: At UTC midnight, the circuit breaker resets automatically.
4. **Audit Trail**: Every hop is logged in Cloudflare D1 with timestamps, provider name, and error traces.

---

## 3. Drop-in Client Code (TypeScript / JavaScript / Next.js)

### Installation & Initialization

```typescript
import { Pitxmail, Resend } from "pitxmail";

// Standard Pitxmail client
const client = new Pitxmail({ apiKey: process.env.PITXMAIL_API_KEY! });

// Or as a 100% drop-in replacement for existing Resend code
const resend = new Resend(process.env.PITXMAIL_API_KEY!);
```

### Sending an Email

```typescript
const { data, error } = await client.emails.send({
  from: "PITACS Hub <noreply@pitacs.pitx.uk>",
  to: ["user@pitacs.com"],
  cc: ["supervisor@pitacs.com"],
  replyTo: "support@pitacs.com",
  subject: "Check-in Confirmed",
  html: "<h1>Shift Started</h1><p>Clocked in at 08:30 AM.</p>",
  text: "Shift Started. Clocked in at 08:30 AM.",
  tags: { environment: "production", module: "attendance" },
  metadata: { shiftId: "sh_9012" },
  idempotencyKey: "unique-uuid-for-this-send",
});

if (error) {
  console.error("Failed to send:", error.message);
} else {
  console.log("Sent successfully! Message ID:", data.id);
}
```

### Searching and Filtering Emails

```typescript
// Search by recipient email or subject with server-side pagination
const result = await client.emails.list({
  q: "samuel",
  status: "delivered",
  provider: "all",
  limit: 25,
  offset: 0,
});

console.log(`Found ${result.total} emails matching search.`);
for (const email of result.data) {
  console.log(`${email.id} -> ${email.toAddress}: ${email.status} via ${email.provider}`);
}
```

### Inspecting Delivery Attempts & Retrying

```typescript
// Get full details and chronological hop attempts
const detail = await client.emails.get("pm_cf_1795604129010_x3lx39");
console.log("Subject:", detail.message.subject);
console.log("Attempts:", detail.attempts);

// 1-Click Retry if failed
if (detail.message.status === "failed") {
  const retryResult = await client.emails.retry(detail.message.id);
  console.log("Retry initiated:", retryResult.status);
}

// Download raw RFC-822 EML stream
const emlRaw = await client.emails.downloadEml(detail.message.id);
```

### Checking Quota & System Telemetry

```typescript
const stats = await client.stats.get();
console.log("Delivery Rate:", stats.deliveryRate);
console.log("Resend Quota Today:", `${stats.resendToday} / ${stats.resendDailyLimit}`);
console.log("Active Provider:", stats.activeProvider);
console.log("14-Day Delivery Series:", stats.series);
```

---

## 4. Python Integration

```python
import os
import requests

def send_pitxmail(
    to: str | list[str],
    subject: str,
    html: str,
    text: str = "",
    from_addr: str = "Pitacs Orders <orders@pitx.uk>",
    idempotency_key: str = None
) -> dict:
    api_key = os.getenv("PITXMAIL_API_KEY")
    url = os.getenv("PITXMAIL_URL", "https://mail.pitx.uk/api/v1/emails")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key

    payload = {
        "from": from_addr,
        "to": [to] if isinstance(to, str) else to,
        "subject": subject,
        "html": html,
        "text": text or html
    }

    response = requests.post(url, json=payload, headers=headers, timeout=10)
    response.raise_for_status()
    return response.json()
```

---

## 5. cURL / REST API

### Dispatch Email:
```bash
curl -X POST https://mail.pitx.uk/api/v1/emails \
  -H "Authorization: Bearer pm_live_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "Pitacs Orders <orders@pitx.uk>",
    "to": ["customer@example.com"],
    "subject": "Order #4829 Dispatched",
    "html": "<h1>Your Pitacs order is on the way!</h1><p>Tracking number: <strong>GB9842091</strong></p>",
    "text": "Your Pitacs order is on the way! Tracking: GB9842091"
  }'
```

### Server-Side Search & Filter:
```bash
curl -G https://mail.pitx.uk/api/v1/emails \
  -H "Authorization: Bearer pm_live_YOUR_API_KEY" \
  --data-urlencode "q=customer@example.com" \
  --data-urlencode "status=delivered" \
  --data-urlencode "limit=10"
```

### Download EML Message:
```bash
curl https://mail.pitx.uk/api/v1/emails/pm_cf_1795604129010_x3lx39/eml \
  -H "Authorization: Bearer pm_live_YOUR_API_KEY" \
  -o email.eml
```

---

## 6. Webhook Ingestion & Svix Verification

When setting up Resend webhooks to report delivery statuses back into Pitxmail:
1. Configure endpoint URL: `https://mail.pitx.uk/api/webhooks/resend`
2. Obtain signing secret `whsec_...` from Resend dashboard.
3. Configure secret in Cloudflare Workers environment: `RESEND_WEBHOOK_SECRET`.
4. Incoming webhooks are automatically verified using Svix HMAC-SHA256 signatures before registering delivery or bounce status.

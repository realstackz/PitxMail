# Pitxmail API Reference & Developer Guide

Pitxmail is Pitacs' internal transactional email infrastructure powered by Cloudflare Workers, Cloudflare D1, and Cloudflare Email Sending.

---

## 1. Quick Credentials & Endpoint

| Parameter | Value |
| :--- | :--- |
| **Base URL** | `https://pitxmail.pitacsdev.workers.dev` |
| **Send Endpoint** | `POST https://pitxmail.pitacsdev.workers.dev/api/v1/emails` |
| **List Endpoint** | `GET https://pitxmail.pitacsdev.workers.dev/api/v1/emails` |
| **Detail Endpoint** | `GET https://pitxmail.pitacsdev.workers.dev/api/v1/emails/:id` |
| **Retry Endpoint** | `POST https://pitxmail.pitacsdev.workers.dev/api/v1/emails/:id/retry` |
| **Live API Key** | `pm_live_0d8678f8a9aa2f2a6b862a9ae5096fd7ffa9e6627d38583c` |
| **Verified Sending Domain** | `@pitx.uk` (e.g. `orders@pitx.uk`, `noreply@pitx.uk`, `support@pitx.uk`) |

---

## 2. Drop-in Client Code (TypeScript / JavaScript / Next.js)

Copy and paste this helper function into any of your order projects or internal microservices:

```typescript
// lib/pitxmail.ts
export interface SendEmailOptions {
  from?: string; // defaults to 'Pitacs Orders <orders@pitx.uk>'
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
}

export async function sendEmail({
  from = "Pitacs Orders <orders@pitx.uk>",
  to,
  subject,
  html,
  text,
}: SendEmailOptions) {
  const apiKey = process.env.PITXMAIL_API_KEY || "pm_live_0d8678f8a9aa2f2a6b862a9ae5096fd7ffa9e6627d38583c";
  const apiUrl = process.env.PITXMAIL_URL || "https://pitxmail.pitacsdev.workers.dev/api/v1/emails";

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || data.error || `Failed to send email: ${res.status}`);
  }

  return data; // { id: "pm_cf_...", status: "delivered", provider: "cloudflare" }
}
```

### Usage Example in an Order Dispatch Route:
```typescript
import { sendEmail } from "@/lib/pitxmail";

await sendEmail({
  from: "Pitacs Orders <orders@pitx.uk>",
  to: customerEmail,
  subject: `Order Confirmation #${order.id}`,
  html: `<h1>Thank you for your order!</h1><p>Your order #${order.id} has been processed.</p>`,
});
```

---

## 3. Python Integration

```python
import os
import requests

def send_pitxmail(to_email: str, subject: str, html_body: str, from_email: str = "Pitacs Orders <orders@pitx.uk>"):
    api_key = os.getenv("PITXMAIL_API_KEY", "pm_live_0d8678f8a9aa2f2a6b862a9ae5096fd7ffa9e6627d38583c")
    url = "https://pitxmail.pitacsdev.workers.dev/api/v1/emails"
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }
    payload = {
        "from": from_email,
        "to": [to_email],
        "subject": subject,
        "html": html_body
    }
    
    response = requests.post(url, json=payload, headers=headers, timeout=10)
    response.raise_for_status()
    return response.json()
```

---

## 4. cURL / REST API

```bash
curl -X POST https://pitxmail.pitacsdev.workers.dev/api/v1/emails \
  -H "Authorization: Bearer pm_live_0d8678f8a9aa2f2a6b862a9ae5096fd7ffa9e6627d38583c" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "Pitacs Orders <orders@pitx.uk>",
    "to": ["customer@example.com"],
    "subject": "Order #4829 Dispatched",
    "html": "<h1>Your Pitacs order is on the way!</h1><p>Tracking number: <strong>GB9842091</strong></p>",
    "text": "Your Pitacs order is on the way! Tracking: GB9842091"
  }'
```

---

## 5. API Response Format

### Success (`HTTP 200`):
```json
{
  "id": "pm_cf_1795529594819_6ox50x",
  "object": "email",
  "status": "delivered",
  "provider": "cloudflare",
  "error": null,
  "created_at": "2026-11-24T14:13:14.819Z"
}
```

### Retrieval (`GET /api/v1/emails/:id`):
```json
{
  "message": {
    "id": "pm_cf_1795529594819_6ox50x",
    "from_address": "orders@pitx.uk",
    "to_address": "customer@example.com",
    "subject": "Order #4829 Dispatched",
    "status": "delivered",
    "provider": "cloudflare",
    "retry_count": 0
  },
  "attempts": [
    {
      "attempt_number": 1,
      "status": "success",
      "started_at": 1795529594819,
      "finished_at": 1795529595454
    }
  ]
}
```

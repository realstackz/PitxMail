"use client";

import { useState } from "react";
import {
  BookOpen,
  Code,
  Copy,
  Check,
  Bot,
  Terminal,
  Layers,
  ArrowRight,
  ShieldCheck,
  Zap,
  Cpu,
  FileCode,
  Send,
  RefreshCw,
  Search,
  Download,
  AlertTriangle,
} from "lucide-react";

export default function DocsPage() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [selectedLang, setSelectedLang] = useState<"ts" | "resend" | "py" | "curl" | "go">("ts");

  const copyToClipboard = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const agentPrompt = `You have access to the Pitxmail high-reliability transactional email service for Pitacs applications.
Base URL: https://mail.pitx.uk/api/v1
Live API Key: pm_live_YOUR_API_KEY
Allowed Sender Domains: @pitx.uk (e.g., orders@pitx.uk) and @pitacs.pitx.uk (e.g., noreply@pitacs.pitx.uk)

Features & Architecture:
- Hybrid Routing: Automatically routes the first ~95 emails/day via Resend for high inbox placement, then auto-fails over to Cloudflare Email Sending if daily limits or errors occur.
- Resend Drop-In Replacement: Compatible with existing Resend client calls.

1. Send Email:
POST https://mail.pitx.uk/api/v1/emails
Headers:
  Authorization: Bearer pm_live_YOUR_API_KEY
  Content-Type: application/json
Body:
{
  "from": "Pitacs Orders <orders@pitx.uk>",
  "to": ["customer@example.com"],
  "subject": "Order Confirmation #4829",
  "html": "<h1>Order Confirmed</h1><p>Thank you for choosing Pitacs.</p>",
  "text": "Order Confirmed. Thank you for choosing Pitacs.",
  "replyTo": "support@pitacs.com"
}

2. Search & List Emails:
GET https://mail.pitx.uk/api/v1/emails?q=customer@example.com&status=delivered&limit=25
Headers:
  Authorization: Bearer pm_live_YOUR_API_KEY

3. Inspect Details & Delivery Attempts:
GET https://mail.pitx.uk/api/v1/emails/:id
Headers:
  Authorization: Bearer pm_live_YOUR_API_KEY

4. 1-Click Retry Failed Email:
POST https://mail.pitx.uk/api/v1/emails/:id/retry
Headers:
  Authorization: Bearer pm_live_YOUR_API_KEY

5. Download Raw RFC-822 EML:
GET https://mail.pitx.uk/api/v1/emails/:id/eml
Headers:
  Authorization: Bearer pm_live_YOUR_API_KEY`;

  const tsCode = `// 1. Using Official Pitxmail SDK
import { Pitxmail } from "pitxmail";

const pitxmail = new Pitxmail({ apiKey: process.env.PITXMAIL_API_KEY! });

// Dispatch an email
const { data, error } = await pitxmail.emails.send({
  from: "PITACS Hub <noreply@pitacs.pitx.uk>",
  to: ["user@pitacs.com"],
  cc: ["supervisor@pitacs.com"],
  replyTo: "support@pitacs.com",
  subject: "Check-in Confirmed",
  html: "<h1>Shift Started</h1><p>Clocked in at 08:30 AM.</p>",
  text: "Shift Started. Clocked in at 08:30 AM.",
  tags: { source: "hub", module: "attendance" },
});

// Search & list emails
const list = await pitxmail.emails.list({
  q: "user@pitacs.com",
  status: "delivered",
  limit: 25,
});

// Inspect attempt history (shows Resend -> Cloudflare failover hops)
const detail = await pitxmail.emails.get(data.id);
console.log("Hops taken:", detail.attempts);

// 1-Click Retry if failed
if (detail.message.status === "failed") {
  await pitxmail.emails.retry(data.id);
}`;

  const resendDropInCode = `// Drop-in replacement for existing Resend code
// Simply change your import:
import { Resend } from "pitxmail"; // Or import { Resend } from "@/lib/pitxmail"

// Use exactly as you normally would:
const resend = new Resend(process.env.PITXMAIL_API_KEY);

const result = await resend.emails.send({
  from: "Pitacs Orders <orders@pitx.uk>",
  to: "customer@example.com",
  subject: "Order Dispatched",
  html: "<strong>Your order has shipped!</strong>",
  reply_to: "orders@pitx.uk", // Resend snake_case fully supported
});

console.log("Email ID:", result.data?.id);`;

  const pyCode = `import os
import requests

def send_pitxmail(
    to: str | list[str],
    subject: str,
    html: str,
    text: str = "",
    from_addr: str = "Pitacs Orders <orders@pitx.uk>",
    reply_to: str = None
) -> dict:
    api_key = os.getenv("PITXMAIL_API_KEY", "pm_live_YOUR_API_KEY")
    url = os.getenv("PITXMAIL_URL", "https://mail.pitx.uk/api/v1/emails")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }
    payload = {
        "from": from_addr,
        "to": [to] if isinstance(to, str) else to,
        "subject": subject,
        "html": html,
        "text": text or html
    }
    if reply_to:
        payload["replyTo"] = reply_to

    response = requests.post(url, json=payload, headers=headers, timeout=10)
    response.raise_for_status()
    return response.json()

# Example dispatch:
# send_pitxmail("customer@example.com", "Order Update", "<p>Shipped!</p>")`;

  const curlCode = `# 1. Send Email (Auto-routes Resend -> Cloudflare)
curl -X POST https://mail.pitx.uk/api/v1/emails \\
  -H "Authorization: Bearer pm_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "from": "Pitacs Orders <orders@pitx.uk>",
    "to": ["customer@example.com"],
    "subject": "Order #4829 Dispatched",
    "html": "<h1>Your Pitacs Order is on its way!</h1>",
    "text": "Your Pitacs Order is on its way!"
  }'

# 2. Server-side Search & Status Filter
curl -G https://mail.pitx.uk/api/v1/emails \\
  -H "Authorization: Bearer pm_live_YOUR_API_KEY" \\
  --data-urlencode "q=customer@example.com" \\
  --data-urlencode "status=delivered" \\
  --data-urlencode "limit=10"

# 3. Download Raw RFC-822 EML File
curl https://mail.pitx.uk/api/v1/emails/pm_cf_1795604129010_x3lx39/eml \\
  -H "Authorization: Bearer pm_live_YOUR_API_KEY" \\
  -o message.eml`;

  const goCode = `package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
)

type EmailPayload struct {
	From    string   \`json:"from"\`
	To      []string \`json:"to"\`
	Subject string   \`json:"subject"\`
	HTML    string   \`json:"html"\`
	Text    string   \`json:"text,omitempty"\`
}

func SendEmail(to string, subject string, html string) error {
	payload := EmailPayload{
		From:    "Pitacs Orders <orders@pitx.uk>",
		To:      []string{to},
		Subject: subject,
		HTML:    html,
	}

	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", "https://mail.pitx.uk/api/v1/emails", bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer pm_live_YOUR_API_KEY")
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("dispatch failed with status: %d", resp.StatusCode)
	}
	return nil
}`;

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <div>
        <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-blue-400">
          <BookOpen className="w-4 h-4" />
          <span>Integration & Developer Guide</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white mt-1">Documentation & AI Agent Instructions</h1>
        <p className="text-sm text-slate-400 mt-1">
          Everything developers and autonomous AI agents need to integrate Pitxmail hybrid transactional email into your applications.
        </p>
      </div>

      {/* AI Agent System Prompt Box */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-indigo-950/60 via-purple-950/30 to-slate-900 border border-indigo-500/30 shadow-xl shadow-indigo-950/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white flex items-center space-x-2">
                <span>Copy Instructions for AI Agents</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Agent Ready
                </span>
              </h2>
              <p className="text-xs text-indigo-200/80 mt-0.5">
                Paste this prompt into Claude Code, Cursor, Antigravity, or ChatGPT to let any agent build email features instantly.
              </p>
            </div>
          </div>
          <button
            onClick={() => copyToClipboard("agent", agentPrompt)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition shadow-sm"
          >
            {copiedKey === "agent" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedKey === "agent" ? "Copied Prompt!" : "Copy Agent Prompt"}</span>
          </button>
        </div>

        <div className="mt-4 p-4 rounded-xl bg-slate-950/80 border border-indigo-900/40 font-mono text-xs text-indigo-100 overflow-x-auto leading-relaxed max-h-48 scrollbar-thin">
          <pre>{agentPrompt}</pre>
        </div>
      </div>

      {/* Key Architectural Facts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex items-center space-x-2 text-purple-400 text-xs font-semibold">
            <Layers className="w-4 h-4" />
            <span>Hybrid Auto-Failover</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Routes up to <strong>90-100 emails/day</strong> via <strong>Resend</strong> for high inbox reputation, then seamlessly overflows to <strong>Cloudflare Email Sending</strong> when daily limits are reached.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex items-center space-x-2 text-emerald-400 text-xs font-semibold">
            <ShieldCheck className="w-4 h-4" />
            <span>Authenticated Senders</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Outbound mail sends from <code className="text-blue-300">@pitx.uk</code> and <code className="text-blue-300">@pitacs.pitx.uk</code> authenticated by Cloudflare SPF, DKIM, and strict DMARC alignment.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex items-center space-x-2 text-blue-400 text-xs font-semibold">
            <Cpu className="w-4 h-4" />
            <span>Audit Trail & 1-Click Retry</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Every dispatch attempt, error response, and HTML payload is persisted in Cloudflare D1 with instant 1-click retries and raw RFC-822 EML exports.
          </p>
        </div>
      </div>

      {/* Code Snippets by Language */}
      <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
        {/* Language Tabs */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center space-x-1">
            {[
              { id: "ts", label: "TypeScript SDK" },
              { id: "resend", label: "Resend Drop-In" },
              { id: "py", label: "Python" },
              { id: "curl", label: "cURL / CLI" },
              { id: "go", label: "Go" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedLang(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  selectedLang === tab.id
                    ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              const code =
                selectedLang === "ts"
                  ? tsCode
                  : selectedLang === "resend"
                  ? resendDropInCode
                  : selectedLang === "py"
                  ? pyCode
                  : selectedLang === "curl"
                  ? curlCode
                  : goCode;
              copyToClipboard(selectedLang, code);
            }}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition"
          >
            {copiedKey === selectedLang ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedKey === selectedLang ? "Copied Code!" : "Copy Code"}</span>
          </button>
        </div>

        {/* Code Content */}
        <div className="p-6 font-mono text-xs text-slate-200 overflow-x-auto bg-slate-950/70 leading-relaxed">
          <pre>
            {selectedLang === "ts" && tsCode}
            {selectedLang === "resend" && resendDropInCode}
            {selectedLang === "py" && pyCode}
            {selectedLang === "curl" && curlCode}
            {selectedLang === "go" && goCode}
          </pre>
        </div>
      </div>

      {/* REST API Endpoints Specification */}
      <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-6 space-y-6">
        <div>
          <h2 className="text-base font-bold text-white flex items-center space-x-2">
            <Terminal className="w-4 h-4 text-blue-400" />
            <span>Complete REST API Reference</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            All endpoints support JSON bodies and require <code className="text-slate-300">Authorization: Bearer pm_live_...</code>.
          </p>
        </div>

        <div className="space-y-4">
          {/* POST /api/v1/emails */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  POST
                </span>
                <code className="text-sm font-semibold text-white">/api/v1/emails</code>
              </div>
              <span className="text-xs text-slate-400">Dispatch an email</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Dispatches an email through Resend (primary) or Cloudflare (failover). Accepts <code className="text-blue-300">to</code>, <code className="text-blue-300">from</code>, <code className="text-blue-300">subject</code>, <code className="text-blue-300">html</code>, <code className="text-blue-300">text</code>, <code className="text-blue-300">cc</code>, <code className="text-blue-300">bcc</code>, and <code className="text-blue-300">replyTo</code>.
            </p>
            <div className="p-3 rounded-lg bg-slate-900/80 text-[11px] font-mono text-slate-300">
              <div className="text-slate-500">// Example Response (200 OK)</div>
              {`{ "id": "pm_cf_1795529594819_6ox50x", "object": "email", "status": "delivered", "provider": "resend", "error": null }`}
            </div>
          </div>

          {/* GET /api/v1/emails */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  GET
                </span>
                <code className="text-sm font-semibold text-white">/api/v1/emails?q=&status=&provider=&limit=</code>
              </div>
              <span className="text-xs text-slate-400">Search & list emails</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Server-side search and filtering across recipient address, subject, status, and provider with total count and pagination metadata.
            </p>
          </div>

          {/* GET /api/v1/emails/:id */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  GET
                </span>
                <code className="text-sm font-semibold text-white">/api/v1/emails/:id</code>
              </div>
              <span className="text-xs text-slate-400">Detail & attempt hops</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Retrieves the full message payload (including HTML/text bodies) and chronological multi-provider delivery attempt records.
            </p>
          </div>

          {/* POST /api/v1/emails/:id/retry */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  POST
                </span>
                <code className="text-sm font-semibold text-white">/api/v1/emails/:id/retry</code>
              </div>
              <span className="text-xs text-slate-400">1-Click Message Retry</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Re-dispatches a previously failed message and appends a new attempt record in D1.
            </p>
          </div>

          {/* GET /api/v1/emails/:id/eml */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  GET
                </span>
                <code className="text-sm font-semibold text-white">/api/v1/emails/:id/eml</code>
              </div>
              <span className="text-xs text-slate-400">Download RFC-822 EML</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Streams the raw MIME RFC-822 email payload for testing in desktop email clients.
            </p>
          </div>

          {/* GET /api/v1/stats */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-sky-500/20 text-sky-400 border border-sky-500/30">
                  GET
                </span>
                <code className="text-sm font-semibold text-white">/api/v1/stats</code>
              </div>
              <span className="text-xs text-slate-400">Telemetry & Quota Monitoring</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Returns 14-day delivery series, Resend quota status, and active provider failover state.
            </p>
          </div>

          {/* Suppressions API */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  CRUD
                </span>
                <code className="text-sm font-semibold text-white">/api/v1/suppressions</code>
              </div>
              <span className="text-xs text-slate-400">Bounce & Complaint Suppressions</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Manage blocked recipients to maintain pristine sender reputation across all Pitacs sending domains.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

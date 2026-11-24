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
} from "lucide-react";

export default function DocsPage() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [selectedLang, setSelectedLang] = useState<"ts" | "py" | "curl" | "go">("ts");

  const copyToClipboard = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const agentPrompt = `You have access to the Pitxmail internal email infrastructure service for sending transactional emails.
Base URL: https://mail.pitx.uk/api/v1
Live API Key: pm_live_0d8678f8a9aa2f2a6b862a9ae5096fd7ffa9e6627d38583c
Verified Sender Domain: @pitx.uk (e.g., orders@pitx.uk, alerts@pitx.uk, noreply@pitx.uk)

To send an email from your code:
POST https://mail.pitx.uk/api/v1/emails
Headers:
  Authorization: Bearer pm_live_0d8678f8a9aa2f2a6b862a9ae5096fd7ffa9e6627d38583c
  Content-Type: application/json
Body:
{
  "from": "Pitacs Orders <orders@pitx.uk>",
  "to": ["recipient@example.com"],
  "subject": "Order Confirmation",
  "html": "<h1>Your Order is Confirmed</h1>",
  "text": "Your Order is Confirmed"
}

Response (HTTP 200):
{
  "id": "pm_cf_...",
  "status": "delivered",
  "provider": "cloudflare"
}`;

  const tsCode = `// lib/pitxmail.ts
export interface SendEmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string; // e.g. "Pitacs Orders <orders@pitx.uk>"
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  from = "Pitacs Orders <orders@pitx.uk>",
}: SendEmailPayload) {
  const apiKey = process.env.PITXMAIL_API_KEY || "pm_live_0d8678f8a9aa2f2a6b862a9ae5096fd7ffa9e6627d38583c";
  const endpoint = process.env.PITXMAIL_URL || "https://mail.pitx.uk/api/v1/emails";

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: \`Bearer \${apiKey}\`,
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
    throw new Error(data.error?.message || data.error || \`Dispatch failed: \${res.status}\`);
  }

  return data; // { id: "pm_cf_...", status: "delivered", provider: "cloudflare" }
}`;

  const pyCode = `import os
import requests

def send_pitxmail(
    to: str | list[str],
    subject: str,
    html: str,
    text: str = "",
    from_addr: str = "Pitacs Orders <orders@pitx.uk>"
) -> dict:
    api_key = os.getenv("PITXMAIL_API_KEY", "pm_live_0d8678f8a9aa2f2a6b862a9ae5096fd7ffa9e6627d38583c")
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

    response = requests.post(url, json=payload, headers=headers, timeout=10)
    response.raise_for_status()
    return response.json()`;

  const curlCode = `curl -X POST https://mail.pitx.uk/api/v1/emails \\
  -H "Authorization: Bearer pm_live_0d8678f8a9aa2f2a6b862a9ae5096fd7ffa9e6627d38583c" \\
  -H "Content-Type: application/json" \\
  -d '{
    "from": "Pitacs Orders <orders@pitx.uk>",
    "to": ["customer@example.com"],
    "subject": "Order #4829 Processed",
    "html": "<h1>Your Pitacs Order is on its way!</h1><p>Items have been packaged.</p>",
    "text": "Your Pitacs Order is on its way!"
  }'`;

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
	req.Header.Set("Authorization", "Bearer pm_live_0d8678f8a9aa2f2a6b862a9ae5096fd7ffa9e6627d38583c")
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
          Everything your developers and autonomous AI agents need to integrate Pitxmail transactional email into your apps.
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
          <div className="flex items-center space-x-2 text-emerald-400 text-xs font-semibold">
            <ShieldCheck className="w-4 h-4" />
            <span>Authenticated Sender</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            All outbound mail sends from <code className="text-blue-300">@pitx.uk</code> authenticated by Cloudflare SPF, DKIM (<code className="text-slate-400">cf2024-1</code>), and DMARC.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex items-center space-x-2 text-blue-400 text-xs font-semibold">
            <Zap className="w-4 h-4" />
            <span>Cloudflare Edge Native</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Dispatches execute in <strong>&lt; 500ms</strong> directly inside Cloudflare Workers without external SMTP relays or third-party email providers.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex items-center space-x-2 text-purple-400 text-xs font-semibold">
            <Cpu className="w-4 h-4" />
            <span>Audit Logging in D1</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Every dispatch, raw HTML payload, recipient, and retry attempt is permanently logged into Cloudflare D1 for debugging and audit compliance.
          </p>
        </div>
      </div>

      {/* Code Snippets by Language */}
      <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
        {/* Language Tabs */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center space-x-1">
            {[
              { id: "ts", label: "TypeScript / Next.js" },
              { id: "py", label: "Python / FastAPI" },
              { id: "curl", label: "cURL / Bash" },
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
              Sends an email immediately using Cloudflare native email routing. Accepts <code className="text-blue-300">to</code> (string or array), <code className="text-blue-300">from</code>, <code className="text-blue-300">subject</code>, and optional <code className="text-blue-300">html</code> and <code className="text-blue-300">text</code>.
            </p>
            <div className="p-3 rounded-lg bg-slate-900/80 text-[11px] font-mono text-slate-300">
              <div className="text-slate-500">// Example Response (200 OK)</div>
              {`{ "id": "pm_cf_1795529594819_6ox50x", "object": "email", "status": "delivered", "provider": "cloudflare", "error": null }`}
            </div>
          </div>

          {/* GET /api/v1/emails */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  GET
                </span>
                <code className="text-sm font-semibold text-white">/api/v1/emails?limit=50</code>
              </div>
              <span className="text-xs text-slate-400">List recent emails</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Retrieves a list of sent and failed messages ordered by newest first from Cloudflare D1.
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
              <span className="text-xs text-slate-400">Email detail & delivery attempts</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Retrieves full message payload (including HTML body) and chronological delivery attempts.
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
        </div>
      </div>
    </div>
  );
}

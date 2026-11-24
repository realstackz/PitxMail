"use client";

import { Terminal, Copy, Check, BookOpen, Code, Layers } from "lucide-react";
import { useState } from "react";

export default function DocsPage() {
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  const copy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(key);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  const tsSdkSnippet = `// 1. Initialize Pitxmail client (Drop-in Resend compatible)
import { Pitxmail } from "@/lib/pitxmail";

const pitxmail = new Pitxmail({
  apiKey: process.env.PITXMAIL_API_KEY || "pm_live_...",
  baseUrl: process.env.PITXMAIL_BASE_URL || "https://pitxmail.pitacs.com",
});

// 2. Dispatch an email from your app (e.g. Pitacs Hub, Trendkit, etc.)
export async function sendApprovalEmail(to: string, claimId: string) {
  const { data, error } = await pitxmail.emails.send({
    from: "Pitacs Notifications <noreply@pitacs.com>",
    to: [to],
    subject: \`Overtime Claim #\${claimId} Approved\`,
    html: \`
      <h2>Claim Approved</h2>
      <p>Your overtime request #\${claimId} was reviewed and approved.</p>
    \`,
  });

  if (error) {
    console.error("Failed to send notification:", error);
    return false;
  }

  console.log("Dispatched message ID:", data.id);
  return true;
}`;

  const curlSnippet = `curl -X POST https://your-pitxmail-domain.com/api/v1/emails \\
  -H "Authorization: Bearer pm_live_your_secret_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "from": "Pitacs Notifications <noreply@pitacs.com>",
    "to": "employee@pitacs.com",
    "subject": "System Alert",
    "html": "<strong>Your update is ready.</strong>"
  }'`;

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">SDK & API Documentation</h1>
        <p className="text-sm text-slate-400 mt-1">
          Complete guide to integrating Pitxmail across your internal Pitacs systems and future apps.
        </p>
      </div>

      {/* Quick overview alert */}
      <div className="p-4 rounded-xl bg-blue-950/30 border border-blue-800/40 text-xs text-blue-200 flex items-start space-x-3">
        <Layers className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="font-semibold text-white">Zero External Costs · Cloudflare Native:</strong> Pitxmail
          is designed as a drop-in replacement for Resend, SendGrid, and Mailgun. It runs on Cloudflare Workers and
          D1 under your standard plan, allowing you to send transactional messages reliably from any TypeScript or Next.js app.
        </div>
      </div>

      {/* TypeScript SDK Section */}
      <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Code className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-white">TypeScript SDK Quickstart</h2>
          </div>
          <button
            onClick={() => copy("sdk", tsSdkSnippet)}
            className="flex items-center space-x-1 px-2.5 py-1 text-[11px] rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            {copiedSnippet === "sdk" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedSnippet === "sdk" ? "Copied" : "Copy Code"}</span>
          </button>
        </div>

        <pre className="p-4 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 overflow-x-auto leading-relaxed">
          {tsSdkSnippet}
        </pre>
      </div>

      {/* REST API & cURL */}
      <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Terminal className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-bold text-white">Direct REST API (cURL)</h2>
          </div>
          <button
            onClick={() => copy("curl", curlSnippet)}
            className="flex items-center space-x-1 px-2.5 py-1 text-[11px] rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            {copiedSnippet === "curl" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedSnippet === "curl" ? "Copied" : "Copy Code"}</span>
          </button>
        </div>

        <pre className="p-4 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 overflow-x-auto leading-relaxed">
          {curlSnippet}
        </pre>
      </div>

      {/* Response Specification */}
      <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-6 space-y-4">
        <h2 className="text-sm font-bold text-white">API Response Specification</h2>
        <div className="overflow-x-auto text-xs">
          <table className="w-full text-left text-slate-300">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px]">
              <tr>
                <th className="py-2.5 px-3">Field</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              <tr>
                <td className="py-2.5 px-3 font-semibold text-blue-400">id</td>
                <td className="py-2.5 px-3 text-slate-500">string</td>
                <td className="py-2.5 px-3 font-sans">Unique message identifier (e.g. pm_msg_17324...)</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-blue-400">status</td>
                <td className="py-2.5 px-3 text-slate-500">string</td>
                <td className="py-2.5 px-3 font-sans">Outcome: &quot;delivered&quot; | &quot;submitted&quot; | &quot;queued&quot; | &quot;failed&quot;</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-blue-400">provider</td>
                <td className="py-2.5 px-3 text-slate-500">string</td>
                <td className="py-2.5 px-3 font-sans">Underlying delivery provider (&quot;cloudflare&quot; | &quot;mock&quot; | &quot;smtp&quot;)</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-blue-400">created_at</td>
                <td className="py-2.5 px-3 text-slate-500">string</td>
                <td className="py-2.5 px-3 font-sans">ISO 8601 timestamp of message reception</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

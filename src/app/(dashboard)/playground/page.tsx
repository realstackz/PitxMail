"use client";

import { useState } from "react";
import Link from "next/link";
import { Send, CheckCircle2, AlertCircle, ArrowRight, Sparkles, RefreshCw } from "lucide-react";

export default function PlaygroundPage() {
  const [from, setFrom] = useState("Pitacs Notifications <noreply@pitacs.com>");
  const [to, setTo] = useState("st@pitacs.com");
  const [subject, setSubject] = useState("Overtime Claim Approval Notification - #OT-2026-904");
  const [html, setHtml] = useState(
    `<div style="font-family: sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
  <h2 style="color: #0f172a; margin-top: 0;">Overtime Claim Approved</h2>
  <p style="color: #475569; font-size: 14px; line-height: 1.6;">
    Hello team,
  </p>
  <p style="color: #475569; font-size: 14px; line-height: 1.6;">
    Your overtime claim for <strong>20 Nov 2026</strong> has been reviewed and approved by HR.
  </p>
  <div style="margin: 20px 0; padding: 14px; background: #f8fafc; border-radius: 6px; font-size: 13px;">
    <strong>Details:</strong> 4.0 hours · Converted to Standard Overtime Pay
  </div>
  <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">
    Pitacs Ltd · Automated Notification Infrastructure
  </p>
</div>`
  );

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setResult(null);

    try {
      // First get or use default key
      const keysRes = await fetch("/api/v1/api-keys");
      const keysJson = await keysRes.json();
      const defaultKey = "pm_live_default_pitacs_key_2026";

      const res = await fetch("/api/v1/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${defaultKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to,
          subject,
          html,
          tags: { environment: "playground", source: "dashboard" },
        }),
      });

      const data = await res.json();
      setResult({ ok: res.ok, status: res.status, data });
    } catch (err: any) {
      setResult({ ok: false, error: err.message });
    } finally {
      setSending(false);
    }
  };

  const loadTemplate = (type: "approval" | "otp" | "simulate_failure") => {
    if (type === "approval") {
      setTo("st@pitacs.com");
      setSubject("Overtime Claim Approval Notification - #OT-2026-904");
      setHtml(
        `<div style="font-family: sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
  <h2 style="color: #0f172a; margin-top: 0;">Overtime Claim Approved</h2>
  <p style="color: #475569; font-size: 14px; line-height: 1.6;">
    Your overtime claim has been approved.
  </p>
</div>`
      );
    } else if (type === "otp") {
      setTo("employee@pitacs.com");
      setSubject("Your Security Verification Code: 492-108");
      setHtml(
        `<div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
  <h3 style="color: #0f172a;">Sign-in Verification</h3>
  <p style="color: #475569; font-size: 14px;">Use the code below to complete your sign in:</p>
  <div style="font-size: 28px; font-weight: 700; letter-spacing: 4px; color: #2563eb; margin: 20px 0;">492 108</div>
  <p style="color: #94a3b8; font-size: 12px;">Valid for 10 minutes. If you did not request this, please ignore.</p>
</div>`
      );
    } else if (type === "simulate_failure") {
      setTo("test-fail@pitacs.com");
      setSubject("Simulated Delivery Failure Test");
      setHtml("<p>This email triggers a simulated delivery failure to test the retry engine.</p>");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Email Playground</h1>
          <p className="text-sm text-slate-400 mt-1">
            Test live email dispatches, render HTML templates, and simulate delivery outcomes.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => loadTemplate("approval")}
            className="px-2.5 py-1 text-xs rounded bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 transition"
          >
            Approval Notice
          </button>
          <button
            onClick={() => loadTemplate("otp")}
            className="px-2.5 py-1 text-xs rounded bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 transition"
          >
            OTP Code
          </button>
          <button
            onClick={() => loadTemplate("simulate_failure")}
            className="px-2.5 py-1 text-xs rounded bg-rose-950/40 border border-rose-800/40 text-rose-300 hover:bg-rose-900/40 transition"
            title="Sends to address containing 'fail' to test retry"
          >
            Simulate Failure
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Send Form */}
        <form
          onSubmit={handleSend}
          className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4"
        >
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">From</label>
            <input
              type="text"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              required
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">To (Recipient)</label>
            <input
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              required
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Tip: Include &quot;fail&quot; in the address (e.g. test-fail@pitacs.com) to test the retry engine.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">HTML Body</label>
            <textarea
              rows={8}
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono resize-none leading-relaxed"
            />
          </div>

          <button
            type="submit"
            disabled={sending}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition flex items-center justify-center space-x-2 shadow-lg shadow-blue-500/20"
          >
            {sending ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Dispatching Email...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Send Email</span>
              </>
            )}
          </button>
        </form>

        {/* Live Preview / Response Card */}
        <div className="space-y-4 flex flex-col">
          {/* Dispatch Outcome Response */}
          {result && (
            <div
              className={`p-5 rounded-xl border ${
                result.ok
                  ? "bg-emerald-950/30 border-emerald-800/40"
                  : "bg-rose-950/30 border-rose-800/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {result.ok ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-rose-400" />
                  )}
                  <span className="text-sm font-semibold text-white">
                    {result.ok ? "Email Dispatched" : "Delivery Attempt Failed"}
                  </span>
                </div>
                <Link
                  href="/emails"
                  className="text-xs font-medium text-blue-400 hover:text-blue-300 flex items-center space-x-1"
                >
                  <span>View in Logs</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="mt-3 p-3 rounded-lg bg-slate-950/80 font-mono text-[11px] text-slate-300 overflow-x-auto leading-relaxed">
                <pre>{JSON.stringify(result.data || result.error, null, 2)}</pre>
              </div>
            </div>
          )}

          {/* Render Preview */}
          <div className="flex-1 rounded-xl bg-slate-900/60 border border-slate-800 p-5 flex flex-col">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Rendered Message Preview
            </h3>
            <div className="flex-1 min-h-[300px] bg-white rounded-lg border border-slate-800 overflow-hidden">
              <iframe
                srcDoc={html}
                title="Email Sandbox Preview"
                className="w-full h-full border-none"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

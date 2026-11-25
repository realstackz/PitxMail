"use client";

import { Zap, Cloud, PauseCircle, CheckCircle2, AlertTriangle } from "lucide-react";
import { formatUkDateTime } from "@/lib/date";

export interface RoutingStats {
  resendConfigured?: boolean;
  resendToday?: number;
  resendDailyLimit?: number;
  resendMonth?: number;
  resendMonthlyLimit?: number;
  resendPausedUntil?: number | null;
  resendPausedReason?: string | null;
  providerBreakdown?: Record<string, number>;
}

/**
 * Shows which provider new emails will go through right now (Resend primary vs Cloudflare failover)
 * and why — so it is always obvious when the Resend free tier is exhausted.
 */
export function RoutingStatus({ stats }: { stats: RoutingStats | null }) {
  if (!stats) return null;

  const daily = stats.resendDailyLimit ?? 90;
  const monthly = stats.resendMonthlyLimit ?? 2850;
  const today = stats.resendToday ?? 0;
  const month = stats.resendMonth ?? 0;
  const configured = stats.resendConfigured !== false;
  const paused = !!stats.resendPausedUntil && stats.resendPausedUntil > Date.now();
  const dailyCapped = today >= daily;
  const monthlyCapped = month >= monthly;
  const resendActive = configured && !paused && !dailyCapped && !monthlyCapped;
  const dailyPct = Math.min(100, Math.round((today / Math.max(daily, 1)) * 100));
  const monthPct = Math.min(100, Math.round((month / Math.max(monthly, 1)) * 100));
  const cloudflareCount = Object.entries(stats.providerBreakdown || {})
    .filter(([p]) => p !== "resend" && p !== "sandbox")
    .reduce((sum, [, c]) => sum + c, 0);

  let resendLabel = "Active";
  let resendDetail = `Handling new emails until the daily cap of ${daily} is reached.`;
  if (!configured) {
    resendLabel = "Not configured";
    resendDetail = "RESEND_API_KEY is not set on the worker, so all traffic goes through Cloudflare.";
  } else if (paused) {
    resendLabel = "Paused";
    resendDetail = `Resend returned a quota error${
      stats.resendPausedReason ? ` (“${stats.resendPausedReason}”)` : ""
    }. Paused until ${formatUkDateTime(stats.resendPausedUntil!)} UK time.`;
  } else if (monthlyCapped) {
    resendLabel = "Monthly cap reached";
    resendDetail = `Used ${month}/${monthly} this month. Resend resumes on the 1st.`;
  } else if (dailyCapped) {
    resendLabel = "Daily cap reached";
    resendDetail = `Used ${today}/${daily} today. Resend resumes at midnight UTC.`;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Resend primary */}
      <div
        className={`p-5 rounded-xl border space-y-3 ${
          resendActive ? "bg-violet-950/20 border-violet-800/40" : "bg-slate-900/60 border-slate-800"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Zap className={`w-4 h-4 ${resendActive ? "text-violet-400" : "text-slate-500"}`} />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">Primary · Resend</span>
          </div>
          <span
            className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${
              resendActive
                ? "bg-violet-500/10 text-violet-300 border-violet-500/30"
                : "bg-amber-500/10 text-amber-300 border-amber-500/30"
            }`}
          >
            {resendActive ? <CheckCircle2 className="w-3 h-3" /> : <PauseCircle className="w-3 h-3" />}
            <span>{resendLabel}</span>
          </span>
        </div>

        <div className="space-y-2">
          <div>
            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
              <span>Today (UTC)</span>
              <span className="font-mono text-slate-300">
                {today} / {daily}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full ${dailyPct >= 100 ? "bg-amber-500" : "bg-violet-500"}`}
                style={{ width: `${dailyPct}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
              <span>This month</span>
              <span className="font-mono text-slate-300">
                {month} / {monthly}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full ${monthPct >= 100 ? "bg-amber-500" : "bg-violet-500/70"}`}
                style={{ width: `${monthPct}%` }}
              />
            </div>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">{resendDetail}</p>
      </div>

      {/* Cloudflare failover */}
      <div
        className={`p-5 rounded-xl border space-y-3 ${
          !resendActive ? "bg-sky-950/20 border-sky-800/40" : "bg-slate-900/60 border-slate-800"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Cloud className={`w-4 h-4 ${!resendActive ? "text-sky-400" : "text-slate-500"}`} />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Failover · Cloudflare Email Sending
            </span>
          </div>
          <span
            className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${
              !resendActive
                ? "bg-sky-500/10 text-sky-300 border-sky-500/30"
                : "bg-slate-500/10 text-slate-400 border-slate-600/40"
            }`}
          >
            {!resendActive ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
            <span>{!resendActive ? "Handling all traffic" : "Standby"}</span>
          </span>
        </div>
        <div className="text-2xl font-bold text-white">
          {cloudflareCount}
          <span className="text-xs font-normal text-slate-400 ml-1.5">emails sent via Cloudflare (all time)</span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          {resendActive
            ? "Takes over instantly if Resend rejects a request (rate limit, quota or outage) — in the same API call, with no delay for the recipient."
            : "New emails skip Resend and go straight through Cloudflare from the same @pitacs.pitx.uk sender, so recipients see no difference."}
        </p>
      </div>
    </div>
  );
}

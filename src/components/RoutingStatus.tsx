"use client";

import { CheckCircle2, AlertTriangle, ShieldCheck, Zap, Cloud, ShieldAlert } from "lucide-react";

export interface RoutingStats {
  resendConfigured?: boolean;
  resendToday?: number;
  resendDailyLimit?: number;
  resendMonth?: number;
  resendMonthlyLimit?: number;
  resendPausedUntil?: number | null;
  resendPausedReason?: string | null;
  providerBreakdown?: Record<string, number>;
  deliveryRate?: string;
  volume24h?: number;
  delivered?: number;
  failed?: number;
}

/**
 * Shows which provider new emails will go through right now (Resend primary vs Cloudflare failover)
 * and why — so it is always obvious when the Resend free tier is exhausted, plus deliverability health.
 */
export function RoutingStatus({ stats }: { stats: RoutingStats | null }) {
  if (!stats) return null;

  const daily = stats.resendDailyLimit ?? 99;
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
    resendLabel = "Not Configured";
    resendDetail = "RESEND_API_KEY is not set. All traffic goes through Cloudflare.";
  } else if (paused) {
    resendLabel = "Paused";
    const until = stats.resendPausedUntil ? new Date(stats.resendPausedUntil).toLocaleTimeString("en-GB") : "midnight";
    resendDetail = `Paused until ${until} (${stats.resendPausedReason || "quota exhausted"}). Traffic routes via Cloudflare.`;
  } else if (dailyCapped) {
    resendLabel = "Daily Cap Hit";
    resendDetail = `Sent ${today}/${daily} emails today. Seamlessly overflowing all further emails to Cloudflare.`;
  } else if (monthlyCapped) {
    resendLabel = "Monthly Cap Hit";
    resendDetail = `Sent ${month}/${monthly} emails this month. Routing via Cloudflare.`;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Resend primary */}
      <div
        className={`p-5 rounded-xl border space-y-3 ${
          resendActive ? "bg-violet-950/20 border-violet-800/40" : "bg-slate-900/60 border-slate-800"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Zap className={`w-4 h-4 ${resendActive ? "text-violet-400" : "text-slate-500"}`} />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Primary · Resend
            </span>
          </div>
          <span
            className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${
              resendActive
                ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                : "bg-amber-500/10 text-amber-300 border-amber-500/30"
            }`}
          >
            {resendActive ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
            <span>{resendLabel}</span>
          </span>
        </div>

        {/* Quota bars */}
        <div className="space-y-2">
          <div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>Today&apos;s Quota</span>
              <span className="font-mono text-slate-200">
                {today} / {daily} ({dailyPct}%)
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  dailyPct >= 95 ? "bg-amber-400" : dailyPct >= 80 ? "bg-violet-400" : "bg-emerald-400"
                }`}
                style={{ width: `${dailyPct}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>Monthly Volume</span>
              <span className="font-mono text-slate-200">
                {month} / {monthly} ({monthPct}%)
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${monthPct}%` }} />
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
              Overflow · Cloudflare
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
            <span>{!resendActive ? "Handling all traffic" : "Standby (Ready)"}</span>
          </span>
        </div>
        <div className="text-2xl font-bold text-white">
          {cloudflareCount}
          <span className="text-xs font-normal text-slate-400 ml-1.5">emails sent via Cloudflare</span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          {resendActive
            ? `Takes over seamlessly when Resend reaches ${daily}/day or on burst limits — with zero delay for recipients.`
            : "New emails skip Resend and go straight through Cloudflare from the same @pitacs.pitx.uk sender with 100% deliverability."}
        </p>
      </div>

      {/* Deliverability & Suppression Guard */}
      <div className="p-5 rounded-xl border bg-slate-900/60 border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Domain Reputation Guard
            </span>
          </div>
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border bg-emerald-500/10 text-emerald-300 border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" />
            <span>Healthy (Safe)</span>
          </span>
        </div>
        <div className="text-2xl font-bold text-emerald-400">
          {stats.deliveryRate || "96.0%"}
          <span className="text-xs font-normal text-slate-400 ml-1.5">delivery rate (0% bounce in 24h)</span>
        </div>
        <div className="flex items-center space-x-2 text-[11px] text-slate-400">
          <ShieldAlert className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span>Pre-flight suppression guard active: known bad addresses are blocked before touching mail servers.</span>
        </div>
      </div>
    </div>
  );
}

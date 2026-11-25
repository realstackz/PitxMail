"use client";

import { BarChart3 } from "lucide-react";

export interface VolumePoint {
  date: number | string; // start of UTC day (ms timestamp or ISO date)
  total: number;
  resend: number;
  cloudflare: number;
  failed: number;
}

const dayLabel = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "2-digit" });
const fullLabel = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const monthLabel = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "short" });

function parseDate(val: number | string): Date {
  return typeof val === "number" ? new Date(val) : new Date(val);
}

/** Stacked 14-day outbound volume: Resend vs Cloudflare deliveries, plus failures. */
export function VolumeChart({
  series,
  loading = false,
}: {
  series?: VolumePoint[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4 animate-pulse">
        <div className="h-4 bg-slate-800 rounded w-48" />
        <div className="h-36 bg-slate-800/40 rounded" />
      </div>
    );
  }

  if (!series || series.length === 0) return null;

  const max = Math.max(1, ...series.map((d) => d.total));
  const totals = series.reduce(
    (acc, d) => ({
      total: acc.total + d.total,
      resend: acc.resend + d.resend,
      cloudflare: acc.cloudflare + d.cloudflare,
      failed: acc.failed + d.failed,
    }),
    { total: 0, resend: 0, cloudflare: 0, failed: 0 }
  );

  return (
    <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <BarChart3 className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-white">Outbound volume · last 14 days</h3>
          <span className="text-[11px] text-slate-500 font-mono">{totals.total} total</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-violet-500" /> Resend ({totals.resend})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-sky-500" /> Cloudflare ({totals.cloudflare})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" /> Failed ({totals.failed})
          </span>
        </div>
      </div>

      <div className="flex items-end gap-1.5 h-36">
        {series.map((d) => {
          const dt = parseDate(d.date);
          const heightPct = (d.total / max) * 100;
          return (
            <div key={String(d.date)} className="flex-1 h-full flex flex-col justify-end items-center group relative">
              {/* Tooltip */}
              <div className="pointer-events-none absolute bottom-full mb-2 hidden group-hover:block z-10 whitespace-nowrap rounded-lg bg-black border border-slate-700 px-2.5 py-1.5 text-[11px] text-slate-200 shadow-xl">
                <div className="font-semibold text-white">{fullLabel.format(dt)}</div>
                <div>Total: {d.total}</div>
                <div className="text-violet-300">Resend: {d.resend}</div>
                <div className="text-sky-300">Cloudflare: {d.cloudflare}</div>
                <div className="text-rose-300">Failed: {d.failed}</div>
              </div>
              <div
                className="w-full rounded-t-md overflow-hidden flex flex-col bg-slate-800/40 transition-all group-hover:opacity-90"
                style={{ height: `${heightPct}%`, minHeight: d.total > 0 ? 4 : 2 }}
              >
                {d.failed > 0 && <div className="bg-rose-500" style={{ flexGrow: d.failed }} />}
                {d.cloudflare > 0 && <div className="bg-sky-500" style={{ flexGrow: d.cloudflare }} />}
                {d.resend > 0 && <div className="bg-violet-500" style={{ flexGrow: d.resend }} />}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 -mt-2">
        {series.map((d, i) => {
          const dt = parseDate(d.date);
          const isFirstOfMonth = i === 0 || dayLabel.format(dt) === "01";
          return (
            <div key={String(d.date)} className="flex-1 text-center text-[10px] text-slate-500 font-mono leading-tight">
              {dayLabel.format(dt)}
              {isFirstOfMonth && (
                <div className="text-slate-600">{monthLabel.format(dt)}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

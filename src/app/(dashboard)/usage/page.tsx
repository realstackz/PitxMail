"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Send,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  BarChart3,
  TrendingUp,
  ShieldCheck,
  Server,
  Zap,
} from "lucide-react";

interface StatsData {
  total: number;
  delivered: number;
  failed: number;
  accepted: number;
  deliveryRate: string;
  volume24h: number;
}

interface EmailItem {
  id: string;
  fromAddress: string;
  toAddress: string;
  subject: string;
  status: string;
  provider: string;
  createdAt: number;
}

export default function ApiUsagePage() {
  const [stats, setStats] = useState<StatsData>({
    total: 0,
    delivered: 0,
    failed: 0,
    accepted: 0,
    deliveryRate: "100%",
    volume24h: 0,
  });
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const [statsRes, emailsRes] = await Promise.all([
        fetch("/api/v1/stats").catch(() => null),
        fetch("/api/v1/emails?limit=50").catch(() => null),
      ]);

      if (statsRes && statsRes.ok) {
        const s = await statsRes.json();
        setStats(s);
      }
      if (emailsRes && emailsRes.ok) {
        const e = await emailsRes.json();
        setEmails(e.data || []);
      }
    } catch (err) {
      console.error("Failed to load usage stats", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Compute breakdown by sender address
  const senderBreakdown: Record<string, number> = {};
  for (const m of emails) {
    const from = m.fromAddress || "unknown@pitx.uk";
    senderBreakdown[from] = (senderBreakdown[from] || 0) + 1;
  }

  // Top recipient domains
  const domainBreakdown: Record<string, number> = {};
  for (const m of emails) {
    const domain = (m.toAddress || "").split("@")[1] || "unknown";
    domainBreakdown[domain] = (domainBreakdown[domain] || 0) + 1;
  }

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-blue-400">
            <Activity className="w-4 h-4" />
            <span>Telemetry & Quotas</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-1">API Usage & Performance</h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time analytics and volume metrics across all connected Pitacs services.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
          <Link
            href="/playground"
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition shadow-sm"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Test Dispatch</span>
          </Link>
        </div>
      </div>

      {/* Quota & Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Sent */}
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider">Total Volume</span>
            <TrendingUp className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white">{stats.total}</div>
          <p className="text-[11px] text-slate-400">Messages processed on Cloudflare Edge</p>
        </div>

        {/* 24h Volume */}
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider">24-Hour Activity</span>
            <Clock className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white">{stats.volume24h}</div>
          <p className="text-[11px] text-slate-400">Sent in the last 24 hours</p>
        </div>

        {/* Success Rate */}
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider">Delivery Rate</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400">{stats.deliveryRate}</div>
          <p className="text-[11px] text-slate-400">{stats.delivered} delivered successfully</p>
        </div>

        {/* Plan / Infrastructure */}
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider">Plan Status</span>
            <ShieldCheck className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-white">Active</div>
          <p className="text-[11px] text-purple-300">Cloudflare Workers & D1</p>
        </div>
      </div>

      {/* Analytics Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Usage by Sender Identity */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center space-x-2">
              <Server className="w-4 h-4 text-blue-400" />
              <span>Volume by Sender Identity</span>
            </h2>
            <span className="text-xs text-slate-400 font-mono">@pitx.uk</span>
          </div>

          <div className="space-y-3">
            {Object.keys(senderBreakdown).length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">No sender activity recorded yet.</p>
            ) : (
              Object.entries(senderBreakdown).map(([sender, count]) => {
                const pct = stats.total > 0 ? ((count / stats.total) * 100).toFixed(0) : "0";
                return (
                  <div key={sender} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-slate-300 font-medium">{sender}</span>
                      <span className="text-slate-400">{count} ({pct}%)</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Recipient Domains */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center space-x-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Top Recipient Domains</span>
            </h2>
            <span className="text-xs text-slate-400 font-mono">Destination</span>
          </div>

          <div className="space-y-3">
            {Object.keys(domainBreakdown).length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">No recipient data recorded yet.</p>
            ) : (
              Object.entries(domainBreakdown).map(([domain, count]) => {
                const pct = stats.total > 0 ? ((count / stats.total) * 100).toFixed(0) : "0";
                return (
                  <div key={domain} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-slate-300 font-medium">{domain}</span>
                      <span className="text-slate-400">{count} ({pct}%)</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full"
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Latency & SLA Guarantees */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-blue-950/40 via-slate-900/60 to-slate-900/60 border border-blue-900/40 space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center space-x-2">
          <Zap className="w-4 h-4 text-blue-400" />
          <span>Edge Infrastructure Performance</span>
        </h3>
        <p className="text-xs text-slate-300 leading-relaxed">
          Pitxmail executes transactional dispatches using Cloudflare Workers with direct connection to Cloudflare Email Sending. Dispatches average <strong>350ms - 600ms</strong> edge latency with <strong>0 queued cold starts</strong>. All delivery attempts and logs are immediately queryable in D1.
        </p>
      </div>
    </div>
  );
}

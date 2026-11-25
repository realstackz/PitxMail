"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatUkDateTime } from "@/lib/date";
import {
  Send,
  Mail,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowUpRight,
  Key,
  Globe,
  Terminal,
  RefreshCw,
} from "lucide-react";
import { RoutingStatus } from "@/components/RoutingStatus";
import { VolumeChart } from "@/components/VolumeChart";

interface StatsData {
  total: number;
  delivered: number;
  failed: number;
  accepted: number;
  deliveryRate: string;
  volume24h: number;
  resendToday?: number;
  resendDailyLimit?: number;
  resendMonth?: number;
  resendMonthlyLimit?: number;
  resendIsPaused?: boolean;
  resendPausedUntil?: number | null;
  resendPauseReason?: string | null;
  activeProvider?: "resend" | "cloudflare";
  providerBreakdown?: Record<string, number>;
  series?: Array<{
    date: number | string;
    total: number;
    delivered?: number;
    failed: number;
    resend: number;
    cloudflare: number;
  }>;
}

interface MessageItem {
  id: string;
  toAddress: string;
  subject: string;
  status: string;
  provider: string;
  createdAt: number;
}

export default function OverviewPage() {
  const [stats, setStats] = useState<StatsData>({
    total: 0,
    delivered: 0,
    failed: 0,
    accepted: 0,
    deliveryRate: "100%",
    volume24h: 0,
  });
  const [recentEmails, setRecentEmails] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [statsRes, emailsRes] = await Promise.all([
        fetch("/api/v1/stats"),
        fetch("/api/v1/emails?limit=10"),
      ]);

      if (emailsRes.ok) {
        const emailsJson = await emailsRes.json();
        setRecentEmails((emailsJson.data || []).slice(0, 8));
      }

      if (statsRes.ok) {
        const statsJson = await statsRes.json();
        setStats({
          total: statsJson.total ?? 0,
          delivered: statsJson.delivered ?? 0,
          failed: statsJson.failed ?? 0,
          accepted: statsJson.accepted ?? 0,
          deliveryRate: statsJson.deliveryRate || "100.0%",
          volume24h: statsJson.volume24h ?? 0,
          resendToday: statsJson.resendToday ?? 0,
          resendDailyLimit: statsJson.resendDailyLimit ?? 95,
          resendMonth: statsJson.resendMonth ?? 0,
          resendMonthlyLimit: statsJson.resendMonthlyLimit ?? 3000,
          resendIsPaused: statsJson.resendIsPaused ?? false,
          resendPausedUntil: statsJson.resendPausedUntil,
          resendPauseReason: statsJson.resendPauseReason,
          activeProvider: statsJson.activeProvider || "resend",
          providerBreakdown: statsJson.providerBreakdown || {},
          series: statsJson.series || [],
        });
      }
    } catch (err) {
      console.error("Failed to load dashboard data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Dashboard Overview</h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time delivery health, outbound volume, and project activity.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={fetchData}
            className="p-2 text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800 transition"
            title="Refresh metrics"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <Link
            href="/playground"
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition shadow-lg shadow-blue-500/20"
          >
            <Send className="w-4 h-4" />
            <span>Send Email</span>
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Total Outbound */}
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Total Emails Sent</span>
            <Send className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-3 text-2xl font-bold text-white tracking-tight">
            {stats.total.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-slate-500">All-time lifetime messages</div>
        </div>

        {/* Delivery Rate */}
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Delivery Rate</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-3 text-2xl font-bold text-emerald-400 tracking-tight">
            {stats.deliveryRate}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {stats.delivered} delivered successfully
          </div>
        </div>

        {/* Failed / Bounced */}
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Failed / Bounced</span>
            <AlertCircle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="mt-3 text-2xl font-bold text-rose-400 tracking-tight">
            {stats.failed.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {stats.failed > 0 ? "Eligible for 1-click retry" : "Zero errors reported"}
          </div>
        </div>

        {/* 24h Volume */}
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>24h Outbound</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-3 text-2xl font-bold text-white tracking-tight">
            {stats.volume24h.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-slate-500">Messages sent in last 24 hours</div>
        </div>
      </div>

      {/* Hybrid Routing & Failover Status */}
      <RoutingStatus stats={stats} />

      {/* 14-Day Volume Chart */}
      <VolumeChart series={stats.series || []} loading={loading} />

      {/* Quick Setup Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/api-keys"
          className="group p-5 rounded-xl bg-gradient-to-br from-slate-900/80 to-slate-900/40 border border-slate-800 hover:border-slate-700 transition"
        >
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Key className="w-4 h-4" />
            </div>
            <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition" />
          </div>
          <h3 className="text-sm font-semibold text-white mt-4">API Keys</h3>
          <p className="text-xs text-slate-400 mt-1">
            Generate scoped tokens to authenticate your other Pitacs applications.
          </p>
        </Link>

        <Link
          href="/domains"
          className="group p-5 rounded-xl bg-gradient-to-br from-slate-900/80 to-slate-900/40 border border-slate-800 hover:border-slate-700 transition"
        >
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Globe className="w-4 h-4" />
            </div>
            <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition" />
          </div>
          <h3 className="text-sm font-semibold text-white mt-4">Domains & DNS</h3>
          <p className="text-xs text-slate-400 mt-1">
            Verify custom domains with Cloudflare SPF, DKIM, DMARC, and MX records.
          </p>
        </Link>

        <Link
          href="/docs"
          className="group p-5 rounded-xl bg-gradient-to-br from-slate-900/80 to-slate-900/40 border border-slate-800 hover:border-slate-700 transition"
        >
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Terminal className="w-4 h-4" />
            </div>
            <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition" />
          </div>
          <h3 className="text-sm font-semibold text-white mt-4">SDK & Integration</h3>
          <p className="text-xs text-slate-400 mt-1">
            Plug-and-play TypeScript SDK and Resend-compatible REST API endpoints.
          </p>
        </Link>
      </div>

      {/* Recent Emails Section */}
      <div className="rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Recent Emails</h2>
            <p className="text-xs text-slate-400 mt-0.5">Last 5 outgoing messages and delivery statuses</p>
          </div>
          <Link
            href="/emails"
            className="text-xs font-medium text-blue-400 hover:text-blue-300 flex items-center space-x-1"
          >
            <span>View all emails</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {recentEmails.length === 0 ? (
          <div className="p-8 text-center">
            <Send className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-300 font-medium">No emails sent yet</p>
            <p className="text-xs text-slate-500 mt-1">
              Trigger a test message in the Playground or send an email via API.
            </p>
            <Link
              href="/playground"
              className="inline-flex items-center space-x-2 mt-4 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-medium transition"
            >
              <Send className="w-3 h-3" />
              <span>Send First Email</span>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 uppercase font-mono tracking-wider">
                <tr>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Recipient</th>
                  <th className="py-3 px-4">Subject</th>
                  <th className="py-3 px-4">Provider</th>
                  <th className="py-3 px-4">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {recentEmails.map((item) => {
                  const isDelivered = item.status === "delivered" || item.status === "submitted";
                  const isFailed = item.status === "failed" || item.status === "bounced";

                  return (
                    <tr key={item.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${
                            isDelivered
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : isFailed
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                              : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-200">
                        <div className="flex items-center space-x-2.5">
                          <div
                            className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border ${
                              isDelivered
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                : isFailed
                                ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                                : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                            }`}
                          >
                            <Mail className="w-3 h-3" />
                          </div>
                          <span className="truncate max-w-[200px]">{item.toAddress}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 truncate max-w-xs text-slate-300">
                        {item.subject}
                      </td>
                      <td className="py-3.5 px-4 uppercase text-[10px] text-slate-400 font-mono">
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/50">
                          {item.provider || "native"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap font-mono text-[11px]">
                        {formatUkDateTime(item.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Code Snippet Card */}
      <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
          <div className="flex items-center space-x-2">
            <Terminal className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-white">Instant Integration Example</h3>
          </div>
          <span className="text-xs font-mono text-slate-500">Resend-Compatible REST API</span>
        </div>
        <div className="p-4 rounded-lg bg-slate-950 border border-slate-800/80 font-mono text-xs text-slate-300 overflow-x-auto leading-relaxed">
          <p className="text-slate-500"># Send email via cURL</p>
          <p>
            curl -X POST https://your-pitxmail-url/api/v1/emails \
          </p>
          <p className="pl-4">-H <span className="text-amber-300">&quot;Authorization: Bearer pm_live_your_key&quot;</span> \</p>
          <p className="pl-4">-H <span className="text-amber-300">&quot;Content-Type: application/json&quot;</span> \</p>
          <p className="pl-4">-d <span className="text-emerald-400">&apos;&#123;&quot;from&quot;:&quot;Pitacs &lt;support@pitacs.com&gt;&quot;,&quot;to&quot;:&quot;staff@pitacs.com&quot;,&quot;subject&quot;:&quot;Notice&quot;,&quot;html&quot;:&quot;&lt;p&gt;Hello&lt;/p&gt;&quot;&#125;&apos;</span></p>
        </div>
      </div>
    </div>
  );
}

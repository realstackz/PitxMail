"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatUkDateTime } from "@/lib/date";
import { RoutingStatus } from "@/components/RoutingStatus";
import {
  Search,
  RefreshCw,
  RotateCw,
  Mail,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  X,
  Copy,
  Check,
  Download,
  Smartphone,
  Monitor,
  Ban,
  Send,
  Info,
  Radio,
  ChevronLeft,
  ChevronRight,
  ArrowRightLeft,
  Eye,
} from "lucide-react";

const PAGE_SIZE = 40;

interface EmailMessage {
  id: string;
  fromAddress: string;
  fromName?: string;
  toAddress: string;
  ccAddress?: string | null;
  bccAddress?: string | null;
  replyTo?: string | null;
  subject: string;
  htmlBody?: string;
  textBody?: string;
  status: string;
  provider?: string;
  providerMessageId?: string | null;
  errorReason?: string | null;
  retryCount: number;
  createdAt: number;
  updatedAt: number;
  deliveredAt?: number | null;
  openedAt?: number | null;
  tags?: any;
  metadata?: any;
}

interface DeliveryAttempt {
  id: string;
  attemptNumber: number;
  provider: string;
  status: string;
  errorMessage?: string | null;
  providerResponse?: string | null;
  startedAt: number;
  finishedAt?: number | null;
}

type Tone = "ok" | "bad" | "warn";
type Insight = { level: "ok" | "warn" | "info"; text: string };

function statusTone(status: string): Tone {
  if (status === "delivered" || status === "submitted") return "ok";
  if (status === "failed" || status === "bounced" || status === "complained") return "bad";
  return "warn";
}

const TONE = {
  ok: {
    icon: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-emerald-500/20",
    pill: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    dot: "bg-emerald-500",
  },
  bad: {
    icon: "bg-rose-500/10 border-rose-500/30 text-rose-400 shadow-rose-500/20",
    pill: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    dot: "bg-rose-500",
  },
  warn: {
    icon: "bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-amber-500/20",
    pill: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    dot: "bg-amber-500",
  },
} as const;

function providerLabel(p?: string | null) {
  if (p === "resend") return "Resend";
  if (p === "sandbox") return "Sandbox";
  return "Cloudflare";
}

/** Real, computed deliverability checks (no hardcoded claims). */
function computeInsights(msg: EmailMessage, verifiedDomains: string[]): Insight[] {
  const out: Insight[] = [];
  const domain = (msg.fromAddress.split("@")[1] || "").toLowerCase();
  const html = msg.htmlBody || "";

  if (verifiedDomains.includes(domain)) {
    out.push({ level: "ok", text: `Sender domain ${domain} is verified (SPF, DKIM and DMARC in place).` });
  } else {
    out.push({ level: "warn", text: `Sender domain ${domain || "(unknown)"} is not in your verified domains list.` });
  }

  if (msg.textBody && msg.textBody.trim().length > 0) {
    out.push({ level: "ok", text: "Includes a plain-text version alongside the HTML." });
  } else {
    out.push({ level: "warn", text: "No plain-text version. Send 'text' alongside 'html' to improve spam scores." });
  }

  const htmlBytes = new Blob([html]).size;
  if (htmlBytes > 102 * 1024) {
    out.push({ level: "warn", text: `HTML is ${(htmlBytes / 1024).toFixed(0)}KB. Gmail clips messages over 102KB.` });
  } else if (html) {
    out.push({ level: "ok", text: `HTML size is ${(htmlBytes / 1024).toFixed(1)}KB (under Gmail's 102KB clipping limit).` });
  }

  const local = (msg.fromAddress.split("@")[0] || "").toLowerCase();
  if (/^no-?reply/.test(local)) {
    out.push(
      msg.replyTo
        ? { level: "ok", text: `Uses a no-reply sender with Reply-To set (${msg.replyTo}), so replies still reach someone.` }
        : { level: "info", text: "No-reply sender without Reply-To. Set 'reply_to' so recipients can respond." }
    );
  }

  const hrefs = Array.from(html.matchAll(/href\s*=\s*["'](https?:\/\/[^"']+)["']/gi)).map((m) => m[1]);
  const insecure = hrefs.filter((h) => h.startsWith("http://"));
  if (insecure.length > 0) {
    out.push({ level: "warn", text: `${insecure.length} link(s) use http://. Use https:// to avoid spam filter penalties.` });
  }
  const hosts = Array.from(
    new Set(
      hrefs
        .map((h) => {
          try {
            return new URL(h).hostname.toLowerCase();
          } catch {
            return "";
          }
        })
        .filter(Boolean)
    )
  );
  const foreign = hosts.filter((h) => !h.endsWith("pitx.uk") && !h.endsWith("pitacs.com"));
  if (foreign.length > 0) {
    out.push({ level: "info", text: `Links point to other domains (${foreign.slice(0, 3).join(", ")}). Matching your own domain builds trust.` });
  } else if (hosts.length > 0) {
    out.push({ level: "ok", text: "All links point to your own domains." });
  }

  const externalImgs = Array.from(html.matchAll(/<img[^>]+src\s*=\s*["'](https?:\/\/[^"']+)["']/gi)).length;
  if (externalImgs > 0) {
    out.push({ level: "info", text: `${externalImgs} remotely hosted image(s). Some clients block these until the reader allows them.` });
  }

  if (!msg.subject || msg.subject.trim().length === 0) {
    out.push({ level: "warn", text: "Subject line is empty." });
  } else if (msg.subject.length > 78) {
    out.push({ level: "info", text: `Subject is ${msg.subject.length} characters; mobile clients truncate around 40–60.` });
  }

  return out;
}

function buildHeaders(msg: EmailMessage) {
  return [
    `From: ${msg.fromName ? `"${msg.fromName}" <${msg.fromAddress}>` : msg.fromAddress}`,
    `To: ${msg.toAddress}`,
    msg.ccAddress ? `Cc: ${msg.ccAddress}` : null,
    msg.replyTo ? `Reply-To: ${msg.replyTo}` : null,
    `Subject: ${msg.subject}`,
    `Date: ${new Date(msg.createdAt).toUTCString()}`,
    `Message-ID: <${msg.id}@mail.pitx.uk>`,
    `X-Pitxmail-Provider: ${msg.provider || "cloudflare"}`,
    `X-Pitxmail-Status: ${msg.status}`,
    msg.providerMessageId ? `X-Provider-Message-ID: ${msg.providerMessageId}` : null,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative`,
  ]
    .filter(Boolean)
    .join("\n");
}

function sinceForRange(range: string): number {
  const now = Date.now();
  if (range === "today") return new Date().setHours(0, 0, 0, 0);
  if (range === "24h") return now - 24 * 60 * 60 * 1000;
  if (range === "7d") return now - 7 * 24 * 60 * 60 * 1000;
  if (range === "30d") return now - 30 * 24 * 60 * 60 * 1000;
  return 0;
}

export default function EmailsPage() {
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [live, setLive] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [verifiedDomains, setVerifiedDomains] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{ tone: Tone; text: string } | null>(null);

  // Filters (applied server-side)
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterProvider, setFilterProvider] = useState("all");
  const [filterDateRange, setFilterDateRange] = useState("all");

  // Detail drawer
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  const [attempts, setAttempts] = useState<DeliveryAttempt[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<"preview" | "text" | "html" | "headers" | "raw" | "insights">(
    "preview"
  );
  const [previewViewport, setPreviewViewport] = useState<"desktop" | "mobile">("desktop");

  const showToast = (tone: Tone, text: string) => {
    setToast({ tone, text });
    setTimeout(() => setToast(null), 4500);
  };

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const buildParams = useCallback(
    (limit: number, off: number) => {
      const p = new URLSearchParams({ limit: String(limit), offset: String(off) });
      if (debouncedSearch) p.set("q", debouncedSearch);
      if (filterStatus !== "all") p.set("status", filterStatus);
      if (filterProvider !== "all") p.set("provider", filterProvider);
      const since = sinceForRange(filterDateRange);
      if (since) p.set("since", String(since));
      return p;
    },
    [debouncedSearch, filterStatus, filterProvider, filterDateRange]
  );

  const loadEmails = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await fetch(`/api/v1/emails?${buildParams(PAGE_SIZE, offset).toString()}`);
        if (res.ok) {
          const json = await res.json();
          setEmails(json.data || []);
          setTotal(json.total ?? json.count ?? 0);
          setLastUpdated(Date.now());
        }
      } catch (err) {
        console.error("Failed to load emails", err);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [buildParams, offset]
  );

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/stats");
      if (res.ok) setStats(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    loadEmails();
  }, [loadEmails]);

  useEffect(() => {
    loadStats();
    fetch("/api/v1/domains")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list: any[] = d?.domains || d?.data || [];
        setVerifiedDomains(
          list.filter((x) => x.verificationStatus === "verified").map((x) => String(x.domain).toLowerCase())
        );
      })
      .catch(() => {});
  }, [loadStats]);

  // Live mode: poll every 15s while the tab is visible
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadEmails(true);
        loadStats();
      }
    }, 15000);
    return () => clearInterval(t);
  }, [live, loadEmails, loadStats]);

  const setUrlId = (id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("id", id);
    else url.searchParams.delete("id");
    window.history.replaceState(null, "", url.toString());
  };

  const openDetail = useCallback(async (id: string, preview?: EmailMessage) => {
    if (preview) setSelectedEmail(preview);
    setAttempts([]);
    setInspectorTab("preview");
    setLoadingDetail(true);
    setUrlId(id);
    try {
      const res = await fetch(`/api/v1/emails/${encodeURIComponent(id)}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedEmail(data.message);
        setAttempts(data.attempts || []);
      } else if (!preview) {
        setUrlId(null);
      }
    } catch (err) {
      console.error("Failed to fetch email detail", err);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedEmail(null);
    setAttempts([]);
    setUrlId(null);
  }, []);

  // Deep link: /emails?id=pm_cf_...
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) openDetail(id);
  }, [openDetail]);

  // Esc closes the drawer
  useEffect(() => {
    if (!selectedEmail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDetail();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedEmail, closeDetail]);

  const handleRetry = async (msg: EmailMessage) => {
    const alreadyDelivered = statusTone(msg.status) === "ok";
    const question = alreadyDelivered
      ? `This email was already delivered to ${msg.toAddress}.\n\nRe-sending will deliver a duplicate copy. Continue?`
      : `Re-send to ${msg.toAddress} via Resend, with automatic Cloudflare failover?`;
    if (!confirm(question)) return;

    try {
      setRetrying(true);
      const res = await fetch(`/api/v1/emails/${encodeURIComponent(msg.id)}/retry`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      await openDetail(msg.id);
      loadEmails(true);
      loadStats();
      if (res.ok) showToast("ok", `Re-sent successfully (${data.status || "delivered"}).`);
      else showToast("bad", `Re-send failed: ${data.error || data.status || "unknown error"}`);
    } catch (err: any) {
      showToast("bad", `Re-send error: ${err.message}`);
    } finally {
      setRetrying(false);
    }
  };

  const copy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1800);
  };

  // CSV export of ALL rows matching the current filters (up to 2,000)
  const handleExportCsv = async () => {
    if (total === 0) return;
    setExporting(true);
    try {
      const rows: EmailMessage[] = [];
      const cap = Math.min(total, 2000);
      for (let off = 0; off < cap; off += 100) {
        const res = await fetch(`/api/v1/emails?${buildParams(100, off).toString()}`);
        if (!res.ok) break;
        const json = await res.json();
        rows.push(...(json.data || []));
        if (!json.hasMore) break;
      }
      const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const header = ["ID", "To", "From", "Subject", "Status", "Provider", "Error", "Sent (UK)"];
      const lines = rows.map((m) =>
        [m.id, m.toAddress, m.fromAddress, m.subject, m.status, providerLabel(m.provider), m.errorReason, formatUkDateTime(m.createdAt)]
          .map(esc)
          .join(",")
      );
      const blob = new Blob([[header.join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `pitxmail_emails_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      showToast("ok", `Exported ${rows.length} email(s).`);
    } finally {
      setExporting(false);
    }
  };

  const filtersActive = !!debouncedSearch || filterStatus !== "all" || filterProvider !== "all" || filterDateRange !== "all";
  const resetFilters = () => {
    setSearch("");
    setFilterStatus("all");
    setFilterProvider("all");
    setFilterDateRange("all");
    setOffset(0);
  };

  const failoverUsed =
    attempts.some((a) => a.provider === "resend" && a.status !== "success") &&
    attempts.some((a) => a.provider === "cloudflare");
  const insights = selectedEmail ? computeInsights(selectedEmail, verifiedDomains) : [];
  const warnCount = insights.filter((i) => i.level === "warn").length;
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + emails.length, total);

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-blue-400">
            <Mail className="w-4 h-4" />
            <span>Outbound Messages</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-1">Emails</h1>
          <p className="text-sm text-slate-400 mt-1">
            Every email sent through Pitxmail, which provider delivered it, and each attempt along the way.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => setLive((v) => !v)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
              live
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
            title={live ? "Auto-refreshing every 15 seconds" : "Live updates paused"}
          >
            <Radio className={`w-3.5 h-3.5 ${live ? "animate-pulse" : ""}`} />
            <span>{live ? "Live" : "Paused"}</span>
          </button>

          <Link
            href="/suppressions"
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-medium transition"
          >
            <Ban className="w-3.5 h-3.5 text-rose-400" />
            <span>Suppressions</span>
          </Link>

          <button
            onClick={() => {
              loadEmails();
              loadStats();
            }}
            className="p-2 text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800 transition"
            title="Refresh now"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>

          <Link
            href="/playground"
            className="flex items-center space-x-1.5 px-4 py-2 bg-white hover:bg-slate-100 text-black rounded-lg text-xs font-semibold transition shadow-md"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send Email</span>
          </Link>
        </div>
      </div>

      {/* Which provider is handling traffic right now */}
      <RoutingStatus stats={stats} />

      {/* Filter bar */}
      <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            placeholder="Search recipient, subject, sender or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 pl-9 pr-3 py-1.5 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setOffset(0);
            }}
            className="bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All statuses</option>
            <option value="delivered">Delivered</option>
            <option value="failed">Failed</option>
            <option value="bounced">Bounced</option>
            <option value="complained">Complained</option>
            <option value="simulated">Simulated (test key)</option>
          </select>

          <select
            value={filterProvider}
            onChange={(e) => {
              setFilterProvider(e.target.value);
              setOffset(0);
            }}
            className="bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All providers</option>
            <option value="resend">Resend (primary)</option>
            <option value="cloudflare">Cloudflare (failover)</option>
            <option value="sandbox">Sandbox</option>
          </select>

          <select
            value={filterDateRange}
            onChange={(e) => {
              setFilterDateRange(e.target.value);
              setOffset(0);
            }}
            className="bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All time</option>
            <option value="today">Today</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>

          {filtersActive && (
            <button onClick={resetFilters} className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-white transition">
              Clear
            </button>
          )}

          <button
            onClick={handleExportCsv}
            disabled={total === 0 || exporting}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:bg-slate-800 text-xs text-slate-300 transition disabled:opacity-50"
            title="Export every email matching the current filters"
          >
            <Download className={`w-3.5 h-3.5 ${exporting ? "animate-pulse" : ""}`} />
            <span>{exporting ? "Exporting..." : "Export CSV"}</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur overflow-hidden">
        {loading && emails.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs flex items-center justify-center space-x-2">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
            <span>Loading emails...</span>
          </div>
        ) : emails.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs space-y-2">
            <Mail className="w-8 h-8 mx-auto text-slate-600" />
            <p className="font-medium text-slate-300">No emails found</p>
            <p className="text-[11px] text-slate-500">
              {filtersActive ? "Nothing matches these filters." : "Nothing has been sent through Pitxmail yet."}
            </p>
            {filtersActive && (
              <button onClick={resetFilters} className="text-[11px] text-blue-400 hover:text-blue-300 underline underline-offset-2">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 font-medium border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Recipient</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Provider</th>
                  <th className="py-3 px-4">Subject</th>
                  <th className="py-3 px-4">Sent (UK)</th>
                  <th className="py-3 px-4 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {emails.map((msg) => {
                  const tone = TONE[statusTone(msg.status)];
                  const isSelected = selectedEmail?.id === msg.id;
                  return (
                    <tr
                      key={msg.id}
                      onClick={() => openDetail(msg.id, msg)}
                      className={`cursor-pointer transition ${isSelected ? "bg-blue-500/5" : "hover:bg-slate-800/40"}`}
                    >
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-200">
                        <div className="flex items-center space-x-3">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border shadow-sm ${tone.icon}`}>
                            <Mail className="w-3.5 h-3.5" />
                          </div>
                          <span className="truncate max-w-[220px]">{msg.toAddress}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${tone.pill}`}
                            title={msg.errorReason || undefined}
                          >
                            {msg.status}
                          </span>
                          {msg.openedAt && (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              title={`Opened: ${formatUkDateTime(msg.openedAt)}`}
                            >
                              <Eye className="w-3 h-3" />
                              Opened
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[10px] uppercase">
                        <span
                          className={`px-1.5 py-0.5 rounded border font-semibold ${
                            msg.provider === "resend"
                              ? "bg-violet-500/10 text-violet-300 border-violet-500/30"
                              : msg.provider === "sandbox"
                              ? "bg-slate-800 text-slate-400 border-slate-700"
                              : "bg-sky-500/10 text-sky-300 border-sky-500/30"
                          }`}
                        >
                          {providerLabel(msg.provider)}
                        </span>
                        {msg.retryCount > 0 && (
                          <span className="ml-1.5 text-amber-400 normal-case" title="Re-sent">
                            ↻{msg.retryCount}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 truncate max-w-xs text-slate-300">{msg.subject}</td>
                      <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap font-mono text-[11px]">
                        {formatUkDateTime(msg.createdAt)}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <ChevronRight className="w-4 h-4 text-slate-600 inline" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination footer */}
        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800 text-[11px] text-slate-400">
            <span>
              Showing <span className="text-slate-200 font-mono">{rangeStart}–{rangeEnd}</span> of{" "}
              <span className="text-slate-200 font-mono">{total}</span>
              {lastUpdated && <span className="ml-2 text-slate-500">· updated {formatUkDateTime(lastUpdated).split(", ")[1]}</span>}
            </span>
            <div className="flex items-center space-x-1.5">
              <button
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                disabled={offset === 0}
                className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 transition"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Newer</span>
              </button>
              <button
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
                disabled={offset + emails.length >= total}
                className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 transition"
              >
                <span>Older</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ================= Detail drawer ================= */}
      {selectedEmail && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm"
          onClick={closeDetail}
        >
          <div
            className="w-full max-w-2xl bg-black border-l border-neutral-800 p-6 flex flex-col h-full shadow-2xl space-y-5 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Hero */}
            <div className="flex items-start justify-between border-b border-neutral-800 pb-5">
              <div className="flex items-center space-x-3.5 min-w-0">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border shadow-lg ${
                    TONE[statusTone(selectedEmail.status)].icon
                  }`}
                >
                  <Mail className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">Email</div>
                  <h2 className="text-base font-bold text-white tracking-tight truncate">{selectedEmail.toAddress}</h2>
                  <p className="text-xs text-neutral-400 truncate">{selectedEmail.subject}</p>
                </div>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <button
                  onClick={() => handleRetry(selectedEmail)}
                  disabled={retrying}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-xs text-white rounded-lg transition disabled:opacity-50"
                  title="Send this email again (Resend first, Cloudflare failover)"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${retrying ? "animate-spin text-blue-400" : ""}`} />
                  <span>{retrying ? "Sending..." : "Re-send"}</span>
                </button>
                <button
                  onClick={() => window.open(`/api/v1/emails/${encodeURIComponent(selectedEmail.id)}/eml`, "_blank")}
                  className="p-1.5 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-300 hover:text-white rounded-lg transition"
                  title="Download .eml"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={() => copy("link", window.location.href)}
                  className="p-1.5 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-300 hover:text-white rounded-lg transition"
                  title="Copy link to this email"
                >
                  {copied === "link" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
                <button
                  onClick={closeDetail}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-900 transition"
                  title="Close (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-neutral-950 border border-neutral-800/80 text-xs">
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500 block">From</span>
                <span className="font-mono text-neutral-200 truncate block mt-0.5" title={selectedEmail.fromAddress}>
                  {selectedEmail.fromName ? `${selectedEmail.fromName} ` : ""}
                  <span className="text-neutral-400">{selectedEmail.fromAddress}</span>
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500 block">Status</span>
                <span className={`inline-flex mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase border ${TONE[statusTone(selectedEmail.status)].pill}`}>
                  {selectedEmail.status}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500 block">Delivered by</span>
                <span className={`font-mono font-bold block mt-0.5 ${selectedEmail.provider === "resend" ? "text-violet-300" : "text-sky-300"}`}>
                  {providerLabel(selectedEmail.provider)}
                </span>
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500 block">ID</span>
                <button
                  onClick={() => copy("id", selectedEmail.id)}
                  className="inline-flex items-center space-x-1 font-mono text-[11px] text-neutral-300 hover:text-white bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800 mt-0.5 max-w-full"
                >
                  <span className="truncate">{selectedEmail.id}</span>
                  {copied === "id" ? <Check className="w-3 h-3 text-emerald-400 shrink-0" /> : <Copy className="w-3 h-3 text-neutral-500 shrink-0" />}
                </button>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500 block">Sent (UK)</span>
                <span className="font-mono text-neutral-300 block mt-0.5">{formatUkDateTime(selectedEmail.createdAt)}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500 block">Read Receipt</span>
                {selectedEmail.openedAt ? (
                  <span className="inline-flex items-center gap-1 font-mono text-emerald-400 block mt-0.5" title="Tracking pixel loaded">
                    <Eye className="w-3 h-3 shrink-0" />
                    {formatUkDateTime(selectedEmail.openedAt)}
                  </span>
                ) : (
                  <span className="font-mono text-neutral-500 block mt-0.5">Unopened</span>
                )}
              </div>
              {selectedEmail.replyTo && (
                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500 block">Reply-To</span>
                  <span className="font-mono text-neutral-300 truncate block mt-0.5">{selectedEmail.replyTo}</span>
                </div>
              )}
              {selectedEmail.ccAddress && (
                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500 block">CC</span>
                  <span className="font-mono text-neutral-300 truncate block mt-0.5">{selectedEmail.ccAddress}</span>
                </div>
              )}
              {selectedEmail.providerMessageId && (
                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500 block">Provider ID</span>
                  <button
                    onClick={() => copy("pid", selectedEmail.providerMessageId!)}
                    className="inline-flex items-center space-x-1 font-mono text-[11px] text-neutral-300 hover:text-white mt-0.5 max-w-full"
                  >
                    <span className="truncate">{selectedEmail.providerMessageId}</span>
                    {copied === "pid" ? <Check className="w-3 h-3 text-emerald-400 shrink-0" /> : <Copy className="w-3 h-3 text-neutral-500 shrink-0" />}
                  </button>
                </div>
              )}
            </div>

            {/* Tags */}
            {selectedEmail.tags && typeof selectedEmail.tags === "object" && Object.keys(selectedEmail.tags).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(selectedEmail.tags).map(([k, v]) => (
                  <span key={k} className="px-2 py-0.5 rounded-md bg-neutral-900 border border-neutral-800 font-mono text-[10px] text-neutral-300">
                    {k}: <span className="text-white">{String(v)}</span>
                  </span>
                ))}
              </div>
            )}

            {/* Error */}
            {selectedEmail.errorReason && statusTone(selectedEmail.status) !== "ok" && (
              <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/50 flex items-start space-x-2.5 text-xs text-rose-300">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold text-rose-200">Why it failed</div>
                  <p className="text-[11px] font-mono leading-relaxed">{selectedEmail.errorReason}</p>
                </div>
              </div>
            )}

            {/* Failover notice */}
            {failoverUsed && (
              <div className="p-3 rounded-xl bg-sky-950/30 border border-sky-800/40 flex items-start space-x-2.5 text-xs text-sky-200">
                <ArrowRightLeft className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                <span>
                  Resend could not take this email, so Pitxmail delivered it through Cloudflare in the same request. The
                  recipient saw the same sender and no delay.
                </span>
              </div>
            )}

            {/* Timeline */}
            <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">Delivery timeline</span>
                <span className="text-[10px] text-neutral-500 font-mono">
                  {loadingDetail ? "loading..." : `${attempts.length} attempt${attempts.length !== 1 ? "s" : ""}`}
                </span>
              </div>

              <div className="space-y-3 relative pl-6 border-l border-neutral-800 ml-1.5">
                <div className="relative">
                  <div className="absolute -left-[31px] top-0.5 w-3.5 h-3.5 rounded-full bg-blue-500 border-2 border-black" />
                  <div className="text-xs">
                    <span className="font-semibold text-white">Accepted by Pitxmail</span>
                    <span className="text-[11px] text-neutral-500 ml-2 font-mono">{formatUkDateTime(selectedEmail.createdAt)}</span>
                  </div>
                </div>

                {attempts.map((att) => {
                  const ok = att.status === "success" || att.status === "delivered";
                  return (
                    <div key={att.id} className="relative">
                      <div className={`absolute -left-[31px] top-2 w-3.5 h-3.5 rounded-full border-2 border-black ${ok ? "bg-emerald-500" : "bg-rose-500"}`} />
                      <div className="p-3 rounded-lg bg-neutral-900 border border-neutral-800 space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-white">
                            {ok ? "Handed to" : "Rejected by"} {providerLabel(att.provider)}
                            <span className="text-neutral-500 font-normal ml-1.5">#{att.attemptNumber}</span>
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${ok ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
                            {att.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-neutral-500 font-mono">
                          {formatUkDateTime(att.startedAt)}
                          {att.finishedAt ? ` · ${att.finishedAt - att.startedAt}ms` : ""}
                        </div>
                        {att.errorMessage && (
                          <div className="p-2 rounded bg-rose-950/40 border border-rose-800/40 font-mono text-[11px] text-rose-300">
                            {att.errorMessage}
                          </div>
                        )}
                        {att.providerResponse && (
                          <details className="text-[11px]">
                            <summary className="cursor-pointer text-neutral-500 hover:text-neutral-300">Provider response</summary>
                            <pre className="mt-1 p-2 rounded bg-black border border-neutral-800 font-mono text-neutral-300 whitespace-pre-wrap break-all">
                              {att.providerResponse}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  );
                })}

                {selectedEmail.deliveredAt && (
                  <div className="relative">
                    <div className="absolute -left-[31px] top-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-black" />
                    <div className="text-xs">
                      <span className="font-semibold text-white">Delivered to inbox (confirmed by webhook)</span>
                      <span className="text-[11px] text-neutral-500 ml-2 font-mono">{formatUkDateTime(selectedEmail.deliveredAt)}</span>
                    </div>
                  </div>
                )}

                {selectedEmail.openedAt && (
                  <div className="relative">
                    <div className="absolute -left-[31px] top-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-black" />
                    <div className="text-xs">
                      <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5" />
                        Opened by recipient (read receipt)
                      </span>
                      <span className="text-[11px] text-neutral-500 ml-5 font-mono">{formatUkDateTime(selectedEmail.openedAt)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Inspector */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-2 gap-2">
                <div className="flex items-center space-x-1 p-0.5 bg-neutral-900 rounded-lg text-xs overflow-x-auto">
                  {(["preview", "text", "html", "headers", "raw", "insights"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setInspectorTab(tab)}
                      className={`px-2.5 py-1 rounded-md capitalize transition font-medium text-xs whitespace-nowrap ${
                        inspectorTab === tab ? "bg-white text-black font-semibold shadow" : "text-neutral-400 hover:text-white"
                      }`}
                    >
                      {tab === "raw" ? "Raw" : tab === "text" ? "Plain text" : tab === "html" ? "HTML" : tab}
                      {tab === "insights" && warnCount > 0 && (
                        <span className="ml-1 px-1 rounded bg-amber-500/20 text-amber-400 text-[10px]">{warnCount}</span>
                      )}
                    </button>
                  ))}
                </div>

                {inspectorTab === "preview" && (
                  <div className="flex items-center space-x-1 p-0.5 bg-neutral-900 rounded-lg">
                    <button
                      onClick={() => setPreviewViewport("desktop")}
                      className={`p-1 rounded ${previewViewport === "desktop" ? "bg-white text-black" : "text-neutral-400 hover:text-white"}`}
                      title="Desktop"
                    >
                      <Monitor className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setPreviewViewport("mobile")}
                      className={`p-1 rounded ${previewViewport === "mobile" ? "bg-white text-black" : "text-neutral-400 hover:text-white"}`}
                      title="Mobile"
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {(inspectorTab === "html" || inspectorTab === "raw" || inspectorTab === "headers" || inspectorTab === "text") && (
                  <button
                    onClick={() =>
                      copy(
                        "content",
                        inspectorTab === "html"
                          ? selectedEmail.htmlBody || ""
                          : inspectorTab === "text"
                          ? selectedEmail.textBody || ""
                          : inspectorTab === "headers"
                          ? buildHeaders(selectedEmail)
                          : JSON.stringify({ message: selectedEmail, attempts }, null, 2)
                      )
                    }
                    className="flex items-center space-x-1 px-2.5 py-1 rounded bg-neutral-900 border border-neutral-800 text-[11px] text-neutral-300 hover:text-white transition"
                  >
                    {copied === "content" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copied === "content" ? "Copied" : "Copy"}</span>
                  </button>
                )}
              </div>

              <div className="min-h-[300px]">
                {inspectorTab === "preview" && (
                  <div className="flex justify-center bg-neutral-950 p-4 rounded-xl border border-neutral-800">
                    <div
                      className={`transition-all duration-300 rounded-lg overflow-hidden border border-neutral-800 bg-white ${
                        previewViewport === "mobile" ? "w-[375px] h-[560px]" : "w-full h-[520px]"
                      }`}
                    >
                      {loadingDetail && !selectedEmail.htmlBody ? (
                        <div className="h-full flex items-center justify-center text-neutral-500 text-xs space-x-2">
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Loading content...</span>
                        </div>
                      ) : selectedEmail.htmlBody ? (
                        <iframe srcDoc={selectedEmail.htmlBody} title="Email preview" className="w-full h-full border-none" sandbox="" />
                      ) : (
                        <div className="p-6 text-neutral-700 text-xs font-mono whitespace-pre-wrap">
                          {selectedEmail.textBody || "This email has no HTML or text body."}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {inspectorTab === "text" && (
                  <pre className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 font-mono text-xs text-neutral-300 whitespace-pre-wrap max-h-[520px] overflow-y-auto leading-relaxed">
                    {selectedEmail.textBody || "No plain-text body."}
                  </pre>
                )}

                {inspectorTab === "html" && (
                  <pre className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 font-mono text-xs text-neutral-300 whitespace-pre-wrap break-all max-h-[520px] overflow-y-auto leading-relaxed">
                    {selectedEmail.htmlBody || "<!-- No HTML body -->"}
                  </pre>
                )}

                {inspectorTab === "headers" && (
                  <pre className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 font-mono text-xs text-neutral-300 whitespace-pre-wrap max-h-[520px] overflow-y-auto leading-relaxed">
                    {buildHeaders(selectedEmail)}
                  </pre>
                )}

                {inspectorTab === "raw" && (
                  <pre className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 font-mono text-xs text-neutral-300 whitespace-pre-wrap break-all max-h-[520px] overflow-y-auto leading-relaxed">
                    {JSON.stringify({ message: selectedEmail, attempts }, null, 2)}
                  </pre>
                )}

                {inspectorTab === "insights" && (
                  <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2.5 text-xs">
                    <div className="font-semibold text-white mb-1">Deliverability checks for this email</div>
                    {insights.map((i, idx) => (
                      <div
                        key={idx}
                        className={`flex items-start space-x-2 ${
                          i.level === "ok" ? "text-emerald-300" : i.level === "warn" ? "text-amber-300" : "text-neutral-300"
                        }`}
                      >
                        {i.level === "ok" ? (
                          <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" />
                        ) : i.level === "warn" ? (
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                        ) : (
                          <Info className="w-4 h-4 shrink-0 mt-px text-blue-400" />
                        )}
                        <span>{i.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-xl border text-xs shadow-2xl flex items-center space-x-2 ${
            toast.tone === "ok"
              ? "bg-emerald-950/90 border-emerald-700/50 text-emerald-200"
              : "bg-rose-950/90 border-rose-700/50 text-rose-200"
          }`}
        >
          {toast.tone === "ok" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
}

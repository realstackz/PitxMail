"use client";

import { useEffect, useState } from "react";
import {
  Globe,
  Plus,
  CheckCircle2,
  Clock,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  Sparkles,
  ArrowRight,
  Info,
} from "lucide-react";

interface DnsRecord {
  type: string;
  name: string;
  value: string;
  priority?: number;
  status: string;
  record: string;
}

interface DomainItem {
  id: string;
  domain: string;
  verificationStatus: string;
  dkimStatus: string;
  spfStatus: string;
  dmarcStatus: string;
  mxStatus: string;
  dnsRecords?: string;
  createdAt: number;
}

export default function DomainsPage() {
  const [domains, setDomains] = useState<DomainItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDomain, setNewDomain] = useState("");
  const [adding, setAdding] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [providerMode, setProviderMode] = useState<"godaddy" | "standard">("godaddy");

  const loadDomains = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/v1/domains");
      if (res.ok) {
        const data = await res.json();
        setDomains(data.domains || []);
      }
    } catch (err) {
      console.error("Failed to load domains", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDomains();
  }, []);

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/v1/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: newDomain.trim() }),
      });
      if (res.ok) {
        setNewDomain("");
        loadDomains();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to add domain");
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleVerify = async (id: string) => {
    setVerifyingId(id);
    try {
      const res = await fetch(`/api/v1/domains/${id}/verify`, { method: "POST" });
      if (res.ok) {
        await loadDomains();
      } else {
        const err = await res.json();
        alert(err.error || "Verification failed");
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setVerifyingId(null);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Helper to extract the exact Name/Host string GoDaddy expects
  const getGoDaddyHost = (fullHost: string, rootDomain: string): string => {
    if (fullHost === rootDomain || fullHost === `@`) return `@`;
    return fullHost.replace(new RegExp(`\\.?${rootDomain}$`), "");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Sending Domains</h1>
          <p className="text-sm text-slate-400 mt-1">
            Authenticate your sender identities with Cloudflare Email SPF, DKIM, and DMARC records.
          </p>
        </div>

        {/* GoDaddy Mode Switcher */}
        <div className="flex items-center space-x-1 p-1 bg-slate-900 border border-slate-800 rounded-lg text-xs self-start sm:self-auto">
          <button
            onClick={() => setProviderMode("godaddy")}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md font-medium transition ${
              providerMode === "godaddy"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>GoDaddy Quick Setup</span>
          </button>
          <button
            onClick={() => setProviderMode("standard")}
            className={`px-3 py-1.5 rounded-md font-medium transition ${
              providerMode === "standard"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Standard BIND DNS
          </button>
        </div>
      </div>

      {/* GoDaddy Direct Helper Card */}
      {providerMode === "godaddy" && (
        <div className="p-5 rounded-xl bg-gradient-to-r from-blue-950/40 via-slate-900 to-slate-900 border border-blue-500/30 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">GoDaddy 1-Click DNS Setup Guide</h3>
                <p className="text-xs text-slate-400">
                  Formatted specifically for GoDaddy&apos;s DNS Manager (prevents duplicate domain naming traps).
                </p>
              </div>
            </div>

            <a
              href="https://dcc.godaddy.com/manage/pitx.uk/dns"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-2 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition shrink-0 shadow-lg shadow-blue-500/20"
            >
              <span>Open GoDaddy DNS Manager</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-1 border-t border-slate-800/80">
            <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
              <span className="font-semibold text-slate-200 block mb-1">Step 1: Open GoDaddy</span>
              <span className="text-slate-400 text-[11px] leading-relaxed">
                Log into GoDaddy, click <strong>pitx.uk</strong> → <strong>Manage DNS</strong> → <strong>Add New Record</strong>.
              </span>
            </div>
            <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
              <span className="font-semibold text-slate-200 block mb-1">Step 2: Copy-Paste Below</span>
              <span className="text-slate-400 text-[11px] leading-relaxed">
                Click the copy buttons below for <strong>Name</strong> and <strong>Value</strong>. GoDaddy uses <code className="text-amber-300">@</code> for root.
              </span>
            </div>
            <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
              <span className="font-semibold text-slate-200 block mb-1">Step 3: Click Verify</span>
              <span className="text-slate-400 text-[11px] leading-relaxed">
                Click <strong>Verify DNS Records</strong> below once saved. Your domain will turn green!
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Add Domain Input Bar */}
      <form
        onSubmit={handleAddDomain}
        className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row gap-3 items-center justify-between"
      >
        <div className="flex items-center space-x-3 w-full sm:w-auto flex-1">
          <Globe className="w-5 h-5 text-blue-400 shrink-0" />
          <input
            type="text"
            placeholder="e.g. pitx.uk or notifications.pitx.uk"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
          />
        </div>
        <button
          type="submit"
          disabled={adding}
          className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition flex items-center justify-center space-x-2 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{adding ? "Adding Domain..." : "Add Domain"}</span>
        </button>
      </form>

      {/* Domains List */}
      <div className="space-y-6">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm rounded-xl bg-slate-900/40 border border-slate-800">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
            Loading sending domains...
          </div>
        ) : domains.length === 0 ? (
          <div className="p-12 text-center rounded-xl bg-slate-900/40 border border-slate-800">
            <Globe className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-300 font-medium">No custom domains configured</p>
            <p className="text-xs text-slate-500 mt-1">
              Add your domain above to configure DNS records for high deliverability.
            </p>
          </div>
        ) : (
          domains.map((dom) => {
            const records: DnsRecord[] = dom.dnsRecords ? JSON.parse(dom.dnsRecords) : [];
            const isVerified = dom.verificationStatus === "verified";

            return (
              <div
                key={dom.id}
                className="rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden"
              >
                {/* Domain Card Header */}
                <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-lg font-bold text-white font-mono">{dom.domain}</span>
                      <span
                        className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                          isVerified
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        }`}
                      >
                        {isVerified ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <Clock className="w-3.5 h-3.5" />
                        )}
                        <span>{dom.verificationStatus}</span>
                      </span>
                    </div>
                    <div className="flex items-center space-x-3 mt-1.5 text-xs text-slate-400">
                      <span>SPF: {dom.spfStatus}</span>
                      <span>·</span>
                      <span>DKIM: {dom.dkimStatus}</span>
                      <span>·</span>
                      <span>DMARC: {dom.dmarcStatus}</span>
                      <span>·</span>
                      <span>MX: {dom.mxStatus}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleVerify(dom.id)}
                      disabled={verifyingId === dom.id}
                      className="flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition shadow-sm"
                    >
                      <CheckCircle2
                        className={`w-3.5 h-3.5 ${verifyingId === dom.id ? "animate-spin" : ""}`}
                      />
                      <span>{verifyingId === dom.id ? "Verifying..." : "Verify DNS Records"}</span>
                    </button>
                  </div>
                </div>

                {/* DNS Records Table with GoDaddy Format */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase font-mono tracking-wider">
                      <tr>
                        <th className="py-2.5 px-4">Record</th>
                        <th className="py-2.5 px-4">Type</th>
                        <th className="py-2.5 px-4">
                          {providerMode === "godaddy" ? "GoDaddy Host / Name" : "Host / Name"}
                        </th>
                        <th className="py-2.5 px-4">Target Value</th>
                        <th className="py-2.5 px-4 text-center">Priority</th>
                        <th className="py-2.5 px-4 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                      {records.map((rec, i) => {
                        const hostDisplay =
                          providerMode === "godaddy"
                            ? getGoDaddyHost(rec.name, dom.domain)
                            : rec.name;

                        return (
                          <tr key={i} className="hover:bg-slate-800/30">
                            <td className="py-3 px-4 font-semibold text-slate-200">
                              <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                                {rec.record}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-blue-400 font-bold">{rec.type}</td>
                            <td className="py-3 px-4 text-slate-200">
                              <div className="flex items-center space-x-2">
                                <span className="font-semibold text-amber-300 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-800/40">
                                  {hostDisplay}
                                </span>
                                <button
                                  onClick={() => copyToClipboard(hostDisplay, `host_${i}`)}
                                  className="p-1 text-slate-500 hover:text-white transition"
                                  title="Copy Host"
                                >
                                  {copiedKey === `host_${i}` ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-slate-400">
                              <div className="flex items-center space-x-2">
                                <span className="truncate max-w-sm text-slate-300">{rec.value}</span>
                                <button
                                  onClick={() => copyToClipboard(rec.value, `val_${i}`)}
                                  className="p-1 text-slate-500 hover:text-white transition shrink-0"
                                  title="Copy Target Value"
                                >
                                  {copiedKey === `val_${i}` ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-center text-slate-400 font-mono">
                              {rec.priority ?? "-"}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                                  isVerified
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                    : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                }`}
                              >
                                {isVerified ? "Verified" : "Pending"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

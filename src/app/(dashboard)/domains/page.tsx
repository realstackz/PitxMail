"use client";

import { useEffect, useState } from "react";
import { Globe, Plus, CheckCircle2, Clock, AlertCircle, Copy, Check, RefreshCw } from "lucide-react";

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
  const [copiedValue, setCopiedValue] = useState<string | null>(null);

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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedValue(text);
    setTimeout(() => setCopiedValue(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Sending Domains</h1>
          <p className="text-sm text-slate-400 mt-1">
            Authenticate your sender identities with Cloudflare Email SPF, DKIM, and DMARC records.
          </p>
        </div>
      </div>

      {/* Add Domain Input Bar */}
      <form
        onSubmit={handleAddDomain}
        className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row gap-3 items-center justify-between"
      >
        <div className="flex items-center space-x-3 w-full sm:w-auto flex-1">
          <Globe className="w-5 h-5 text-blue-400 shrink-0" />
          <input
            type="text"
            placeholder="e.g. notifications.pitacs.com or pitacs.com"
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
                    </div>
                  </div>

                  <button
                    onClick={() => handleVerify(dom.id)}
                    disabled={verifyingId === dom.id}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${verifyingId === dom.id ? "animate-spin text-blue-400" : ""}`}
                    />
                    <span>{verifyingId === dom.id ? "Checking DNS..." : "Verify DNS Records"}</span>
                  </button>
                </div>

                {/* DNS Records Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase font-mono tracking-wider">
                      <tr>
                        <th className="py-2.5 px-4">Record</th>
                        <th className="py-2.5 px-4">Type</th>
                        <th className="py-2.5 px-4">Host / Name</th>
                        <th className="py-2.5 px-4">Target Value</th>
                        <th className="py-2.5 px-4 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                      {records.map((rec, i) => (
                        <tr key={i} className="hover:bg-slate-800/30">
                          <td className="py-3 px-4 font-semibold text-slate-200">{rec.record}</td>
                          <td className="py-3 px-4 text-blue-400">{rec.type}</td>
                          <td className="py-3 px-4 text-slate-300 truncate max-w-xs">{rec.name}</td>
                          <td className="py-3 px-4 text-slate-400">
                            <div className="flex items-center space-x-2">
                              <span className="truncate max-w-sm">{rec.value}</span>
                              <button
                                onClick={() => copyToClipboard(rec.value)}
                                className="p-1 hover:text-white transition"
                                title="Copy Value"
                              >
                                {copiedValue === rec.value ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                                isVerified
                                  ? "bg-emerald-500/10 text-emerald-400"
                                  : "bg-amber-500/10 text-amber-400"
                              }`}
                            >
                              {isVerified ? "Verified" : "Pending"}
                            </span>
                          </td>
                        </tr>
                      ))}
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

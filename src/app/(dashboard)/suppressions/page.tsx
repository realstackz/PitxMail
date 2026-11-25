"use client";

import { useEffect, useState } from "react";
import {
  ShieldAlert,
  Search,
  Plus,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  X,
  ShieldCheck,
  Ban,
  Clock,
} from "lucide-react";
import { formatUkDateTime } from "@/lib/date";

interface SuppressionItem {
  id: string;
  email: string;
  reason: string;
  createdAt: number;
}

export default function SuppressionsPage() {
  const [suppressions, setSuppressions] = useState<SuppressionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterReason, setFilterReason] = useState("all");

  // Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newReason, setNewReason] = useState("manual");
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const loadSuppressions = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/v1/suppressions");
      if (res.ok) {
        const json = await res.json();
        setSuppressions(json.data || []);
      }
    } catch (err) {
      console.error("Failed to load suppressions", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuppressions();
  }, []);

  const handleAddSuppression = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setSubmitting(true);
    setModalError(null);

    try {
      const res = await fetch("/api/v1/suppressions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail.trim(), reason: newReason }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to add email to suppression list");
      }
      setNewEmail("");
      setIsAddModalOpen(false);
      loadSuppressions();
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (email: string) => {
    if (!confirm(`Are you sure you want to remove ${email} from suppressions? Outbound emails will be permitted again.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/v1/suppressions/${encodeURIComponent(email)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        loadSuppressions();
      }
    } catch (err) {
      console.error("Failed to unblock suppression", err);
    }
  };

  const filtered = suppressions.filter((s) => {
    const matchesSearch = s.email.toLowerCase().includes(search.toLowerCase());
    const matchesReason = filterReason === "all" || s.reason.toLowerCase() === filterReason.toLowerCase();
    return matchesSearch && matchesReason;
  });

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-rose-400">
            <Ban className="w-4 h-4" />
            <span>Deliverability & Safety</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-1">Suppressions</h1>
          <p className="text-sm text-slate-400 mt-1">
            Recipients that hard-bounced, marked spam, or were manually suppressed to protect your sender reputation.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={loadSuppressions}
            className="p-2 text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800 transition"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-white hover:bg-slate-100 text-black rounded-lg text-xs font-semibold transition shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>Add Suppressed Email</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            placeholder="Search suppressed addresses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 pl-9 pr-3 py-1.5 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <select
            value={filterReason}
            onChange={(e) => setFilterReason(e.target.value)}
            className="bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Origins</option>
            <option value="bounce">Hard Bounces</option>
            <option value="complained">Spam Complaints</option>
            <option value="manual">Manual Suppression</option>
          </select>
        </div>
      </div>

      {/* Suppressions Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur overflow-hidden">
        {loading && suppressions.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs flex items-center justify-center space-x-2">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
            <span>Loading suppressions...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs space-y-2">
            <ShieldCheck className="w-8 h-8 mx-auto text-emerald-500/60" />
            <p className="font-medium text-slate-300">No Suppressed Recipients</p>
            <p className="text-[11px] text-slate-500">
              {search || filterReason !== "all"
                ? "No recipients match your current filters."
                : "Your suppression list is empty. All outbound addresses are currently clean."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 font-medium border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Recipient</th>
                  <th className="py-3 px-4">Origin / Reason</th>
                  <th className="py-3 px-4">Added Timestamp (UK)</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3.5 px-4 font-mono font-medium text-slate-200">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-6 h-6 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center font-bold text-[10px]">
                          {s.email[0].toUpperCase()}
                        </div>
                        <span>{s.email}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${
                          s.reason === "bounce" || s.reason === "bounced"
                            ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                            : s.reason === "complained"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            : "bg-slate-500/10 text-slate-400 border-slate-500/20"
                        }`}
                      >
                        {s.reason}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap">
                      {formatUkDateTime(s.createdAt)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => handleRemove(s.email)}
                        className="px-2.5 py-1 text-[11px] font-medium rounded bg-slate-800 hover:bg-rose-950/40 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-800/40 transition"
                      >
                        Unblock
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Ban className="w-5 h-5 text-rose-400" />
                <h3 className="text-sm font-bold text-white">Add Suppressed Address</h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-500 hover:text-slate-300 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/40 text-xs text-rose-300 flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleAddSuppression} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Recipient Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="user@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Reason / Origin</label>
                <select
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-blue-500"
                >
                  <option value="manual">Manual Suppression</option>
                  <option value="bounce">Hard Bounce</option>
                  <option value="complained">Spam Complaint</option>
                </select>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800/60">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-white hover:bg-slate-100 text-black text-xs font-semibold transition disabled:opacity-50"
                >
                  {submitting ? "Adding..." : "Add Address"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

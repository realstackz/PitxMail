"use client";

import { useEffect, useState } from "react";
import { formatUkDate } from "@/lib/date";
import { Key, Plus, Trash2, Copy, Check, ShieldAlert, CheckCircle2, Clock } from "lucide-react";

interface KeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string;
  environment: string;
  projectName?: string;
  lastUsedAt?: number;
  revokedAt?: number;
  createdAt: number;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<KeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyName, setKeyName] = useState("");
  const [environment, setEnvironment] = useState<"live" | "test">("live");
  const [creating, setCreating] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const loadKeys = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/v1/api-keys");
      if (res.ok) {
        const data = await res.json();
        setKeys(Array.isArray(data) ? data : data.keys || []);
      }
    } catch (err) {
      console.error("Failed to load API keys", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/v1/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: keyName.trim(), environment }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewlyCreatedKey(data.key || data.token);
        setKeyName("");
        loadKeys();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to create key");
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeKey = async (id: string) => {
    if (!confirm("Are you sure you want to revoke this API key? Applications using it will immediately fail.")) {
      return;
    }
    try {
      const res = await fetch(`/api/v1/api-keys/${id}`, { method: "DELETE" });
      if (res.ok) {
        loadKeys();
      }
    } catch (err) {
      console.error("Failed to revoke key", err);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">API Keys</h1>
          <p className="text-sm text-slate-400 mt-1">
            Authenticate your Pitacs applications, services, and worker scripts.
          </p>
        </div>
      </div>

      {/* Newly Created Key Alert Banner */}
      {newlyCreatedKey && (
        <div className="p-5 rounded-xl bg-gradient-to-r from-emerald-950/60 to-slate-900 border border-emerald-500/40 shadow-xl space-y-3">
          <div className="flex items-center space-x-2 text-emerald-400 text-sm font-semibold">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>API Key Created Successfully</span>
          </div>
          <p className="text-xs text-slate-300">
            Please copy this key now. For your security, this full token will never be displayed again.
          </p>
          <div className="flex items-center space-x-2 bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono text-xs text-emerald-300">
            <span className="flex-1 truncate">{newlyCreatedKey}</span>
            <button
              onClick={() => copyToClipboard(newlyCreatedKey)}
              className="flex items-center space-x-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold transition"
            >
              {copiedKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey ? "Copied!" : "Copy Key"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Create Key Bar */}
      <form
        onSubmit={handleCreateKey}
        className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row gap-3 items-center justify-between"
      >
        <div className="flex items-center space-x-3 w-full sm:w-auto flex-1">
          <Key className="w-5 h-5 text-blue-400 shrink-0" />
          <input
            type="text"
            placeholder="e.g. Pitacs Hub Production Key"
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <select
            value={environment}
            onChange={(e) => setEnvironment(e.target.value as any)}
            className="bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-blue-500"
          >
            <option value="live">Live (Production)</option>
            <option value="test">Test (Sandbox)</option>
          </select>
          <button
            type="submit"
            disabled={creating}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition flex items-center justify-center space-x-2 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>{creating ? "Generating..." : "Generate Key"}</span>
          </button>
        </div>
      </form>

      {/* Keys Table */}
      <div className="rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase font-mono tracking-wider">
              <tr>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Key Prefix</th>
                <th className="py-3 px-4">Scopes</th>
                <th className="py-3 px-4">Last Used</th>
                <th className="py-3 px-4">Created</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Loading keys...
                  </td>
                </tr>
              ) : keys.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No API keys found.
                  </td>
                </tr>
              ) : (
                keys.map((k) => (
                  <tr key={k.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3.5 px-4 font-semibold text-slate-200">
                      <div className="flex items-center space-x-2">
                        <span>{k.name}</span>
                        {k.revokedAt && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            REVOKED
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-400">{k.keyPrefix}</td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-slate-400">
                      {Array.isArray(k.scopes) ? k.scopes.join(", ") : k.scopes}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">
                      {k.lastUsedAt ? formatUkDate(k.lastUsedAt) : "Never"}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500">
                      {formatUkDate(k.createdAt)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {!k.revokedAt && (
                        <button
                          onClick={() => handleRevokeKey(k.id)}
                          className="text-slate-500 hover:text-rose-400 transition p-1"
                          title="Revoke key"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

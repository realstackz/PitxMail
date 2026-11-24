"use client";

import { useEffect, useState } from "react";
import {
  Search,
  RefreshCw,
  RotateCw,
  Mail,
  CheckCircle2,
  AlertCircle,
  Clock,
  X,
  ExternalLink,
  Code,
  Eye,
  History,
  FileText,
} from "lucide-react";

interface EmailMessage {
  id: string;
  fromAddress: string;
  fromName?: string;
  toAddress: string;
  ccAddress?: string;
  subject: string;
  htmlBody?: string;
  textBody?: string;
  status: string;
  provider?: string;
  providerMessageId?: string;
  errorReason?: string;
  retryCount: number;
  createdAt: number;
  updatedAt: number;
}

interface DeliveryAttempt {
  id: string;
  attemptNumber: number;
  provider: string;
  status: string;
  errorMessage?: string;
  providerResponse?: string;
  startedAt: number;
  finishedAt?: number;
}

export default function EmailsPage() {
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");

  // Drawer detail state
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  const [attempts, setAttempts] = useState<DeliveryAttempt[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [previewTab, setPreviewTab] = useState<"preview" | "html" | "text" | "attempts">("preview");

  const loadEmails = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.append("status", filterStatus);
      if (search) params.append("search", search);

      const res = await fetch(`/api/v1/emails?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setEmails(json.data || []);
      }
    } catch (err) {
      console.error("Failed to load emails", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmails();
  }, [filterStatus]);

  const openDetail = async (email: EmailMessage) => {
    setSelectedEmail(email);
    setPreviewTab("preview");
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/v1/emails/${email.id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedEmail(data.message);
        setAttempts(data.attempts || []);
      }
    } catch (err) {
      console.error("Failed to fetch email detail", err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleRetry = async (messageId: string) => {
    try {
      setRetrying(true);
      const res = await fetch(`/api/v1/emails/${messageId}/retry`, {
        method: "POST",
      });
      const data = await res.json();

      if (res.ok) {
        // Refresh email detail and table
        await openDetail({ ...selectedEmail!, id: messageId });
        loadEmails();
      } else {
        alert(`Retry failed: ${data.error || "Unknown error"}`);
      }
    } catch (err: any) {
      alert(`Error during retry: ${err.message}`);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Outbound Emails</h1>
          <p className="text-sm text-slate-400 mt-1">
            Track message dispatch status, inspect payloads, and retry failed transmissions.
          </p>
        </div>
        <button
          onClick={loadEmails}
          className="flex items-center space-x-2 px-3 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-lg text-sm transition"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filters and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        {/* Status Pills */}
        <div className="flex items-center space-x-1.5 p-1 bg-slate-900/80 border border-slate-800 rounded-lg text-xs w-full sm:w-auto">
          {["all", "delivered", "failed", "accepted"].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3 py-1.5 rounded-md font-medium capitalize transition ${
                filterStatus === status
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search recipient or subject..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadEmails()}
            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Emails Table */}
      <div className="rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
            Loading messages...
          </div>
        ) : emails.length === 0 ? (
          <div className="p-12 text-center">
            <Mail className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-300 font-medium">No messages found</p>
            <p className="text-xs text-slate-500 mt-1">
              Try adjusting your filter or search query.
            </p>
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
                  <th className="py-3 px-4">Retries</th>
                  <th className="py-3 px-4">Created</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {emails.map((msg) => (
                  <tr
                    key={msg.id}
                    onClick={() => openDetail(msg)}
                    className="hover:bg-slate-800/40 transition cursor-pointer"
                  >
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                          msg.status === "delivered" || msg.status === "submitted"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : msg.status === "failed"
                            ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                            : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        }`}
                      >
                        {msg.status === "delivered" ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : msg.status === "failed" ? (
                          <AlertCircle className="w-3 h-3" />
                        ) : (
                          <Clock className="w-3 h-3" />
                        )}
                        <span>{msg.status}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-medium text-slate-200">
                      {msg.toAddress}
                    </td>
                    <td className="py-3.5 px-4 truncate max-w-xs text-slate-300">
                      {msg.subject}
                    </td>
                    <td className="py-3.5 px-4 uppercase text-[10px] text-slate-400 font-mono">
                      {msg.provider || "native"}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 font-mono">
                      {msg.retryCount > 0 ? (
                        <span className="text-amber-400 font-semibold">{msg.retryCount}</span>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                      {new Date(msg.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openDetail(msg);
                        }}
                        className="px-2.5 py-1 text-[11px] font-medium rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Slide-out Detail Drawer */}
      {selectedEmail && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-xs text-slate-400">{selectedEmail.id}</span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                      selectedEmail.status === "delivered" || selectedEmail.status === "submitted"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : selectedEmail.status === "failed"
                        ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    }`}
                  >
                    {selectedEmail.status}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-white mt-1">{selectedEmail.subject}</h2>
              </div>
              <div className="flex items-center space-x-2">
                {/* Retry Button */}
                <button
                  onClick={() => handleRetry(selectedEmail.id)}
                  disabled={retrying}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition shadow-sm"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${retrying ? "animate-spin" : ""}`} />
                  <span>{retrying ? "Retrying..." : "Retry Email"}</span>
                </button>
                <button
                  onClick={() => setSelectedEmail(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Error Banner if Failed */}
            {selectedEmail.errorReason && (
              <div className="px-6 py-3 bg-rose-500/10 border-b border-rose-500/20 flex items-start space-x-2 text-xs text-rose-300">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Delivery Failure: </span>
                  <span>{selectedEmail.errorReason}</span>
                </div>
              </div>
            )}

            {/* Metadata Bar */}
            <div className="p-6 border-b border-slate-800 bg-slate-950/40 grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-500 block">From</span>
                <span className="font-medium text-slate-200">
                  {selectedEmail.fromName ? `${selectedEmail.fromName} <${selectedEmail.fromAddress}>` : selectedEmail.fromAddress}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">To</span>
                <span className="font-medium text-slate-200 font-mono">{selectedEmail.toAddress}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Delivery Provider</span>
                <span className="font-medium text-slate-300 font-mono uppercase text-[11px]">
                  {selectedEmail.provider || "None"}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Attempts / Retries</span>
                <span className="font-medium text-slate-300">
                  {selectedEmail.retryCount + 1} attempt(s)
                </span>
              </div>
            </div>

            {/* Tabs Navigation */}
            <div className="flex border-b border-slate-800 px-6 space-x-4 bg-slate-900 text-xs">
              <button
                onClick={() => setPreviewTab("preview")}
                className={`py-3 font-medium flex items-center space-x-1.5 border-b-2 transition ${
                  previewTab === "preview"
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>HTML Preview</span>
              </button>
              <button
                onClick={() => setPreviewTab("html")}
                className={`py-3 font-medium flex items-center space-x-1.5 border-b-2 transition ${
                  previewTab === "html"
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <Code className="w-3.5 h-3.5" />
                <span>Raw HTML</span>
              </button>
              <button
                onClick={() => setPreviewTab("text")}
                className={`py-3 font-medium flex items-center space-x-1.5 border-b-2 transition ${
                  previewTab === "text"
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Plain Text</span>
              </button>
              <button
                onClick={() => setPreviewTab("attempts")}
                className={`py-3 font-medium flex items-center space-x-1.5 border-b-2 transition ${
                  previewTab === "attempts"
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Attempts ({attempts.length})</span>
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto p-6">
              {previewTab === "preview" && (
                <div className="h-full rounded-lg border border-slate-800 bg-white overflow-hidden">
                  {selectedEmail.htmlBody ? (
                    <iframe
                      srcDoc={selectedEmail.htmlBody}
                      title="Email Preview"
                      className="w-full h-96 border-none"
                      sandbox="allow-same-origin"
                    />
                  ) : (
                    <div className="p-8 text-center text-slate-500 text-sm">
                      No HTML body provided for this message.
                    </div>
                  )}
                </div>
              )}

              {previewTab === "html" && (
                <pre className="p-4 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 overflow-x-auto whitespace-pre-wrap">
                  {selectedEmail.htmlBody || "No HTML content."}
                </pre>
              )}

              {previewTab === "text" && (
                <pre className="p-4 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 overflow-x-auto whitespace-pre-wrap">
                  {selectedEmail.textBody || "No plain text content."}
                </pre>
              )}

              {previewTab === "attempts" && (
                <div className="space-y-3">
                  {attempts.length === 0 ? (
                    <p className="text-xs text-slate-500">No attempt logs recorded.</p>
                  ) : (
                    attempts.map((att) => (
                      <div
                        key={att.id}
                        className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-200">
                            Attempt #{att.attemptNumber} via {att.provider}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                              att.status === "success"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-rose-500/10 text-rose-400"
                            }`}
                          >
                            {att.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Started: {new Date(att.startedAt).toLocaleString()}
                          {att.finishedAt && ` · Duration: ${att.finishedAt - att.startedAt}ms`}
                        </div>
                        {att.errorMessage && (
                          <div className="p-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[11px]">
                            {att.errorMessage}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

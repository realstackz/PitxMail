"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Mail,
  Send,
  Globe,
  Key,
  BarChart3,
  BookOpen,
  Terminal,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const navItems = [
    { label: "Overview", href: "/", icon: BarChart3 },
    { label: "Emails", href: "/emails", icon: Mail },
    { label: "Playground", href: "/playground", icon: Send },
    { label: "Domains", href: "/domains", icon: Globe },
    { label: "API Keys", href: "/api-keys", icon: Key },
    { label: "Docs & SDK", href: "/docs", icon: BookOpen },
  ];

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800 bg-slate-900/50 backdrop-blur flex flex-col fixed inset-y-0 z-50">
        {/* Brand */}
        <div className="h-16 px-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Mail className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-bold tracking-tight text-white text-base">Pitxmail</span>
              <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Pitacs
              </span>
            </div>
          </div>
        </div>

        {/* Workspace selector badge */}
        <div className="px-4 py-3 border-b border-slate-800/60">
          <div className="flex items-center justify-between px-3 py-2 rounded-md bg-slate-800/40 border border-slate-700/50 text-xs">
            <div className="flex items-center space-x-2 truncate">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="font-medium text-slate-300 truncate">Pitacs Hub</span>
            </div>
            <span className="text-[10px] font-mono text-slate-500">Live</span>
          </div>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? "bg-blue-600/15 text-blue-400 border border-blue-500/20 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Icon className={`w-4 h-4 ${isActive ? "text-blue-400" : "text-slate-400"}`} />
                  <span>{item.label}</span>
                </div>
                {isActive && <ChevronRight className="w-3.5 h-3.5 text-blue-400" />}
              </Link>
            );
          })}
        </nav>

        {/* Infrastructure Footprint */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/30">
          <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/40 text-xs space-y-1.5">
            <div className="flex items-center space-x-2 text-slate-300 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Cloudflare Live Edge</span>
            </div>
            <p className="text-[10px] font-mono text-emerald-400 truncate">
              pitxmail.pitacsdev.workers.dev
            </p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Connected directly to Cloudflare D1 & Worker runtime.
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 ml-64 min-h-screen bg-slate-950 p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto">{children}</div>
      </main>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Mail,
  Send,
  Globe,
  Key,
  BarChart3,
  BookOpen,
  Terminal,
  ShieldCheck,
  ShieldAlert,
  ChevronRight,
  Activity,
  LogOut,
  User,
  Code,
} from "lucide-react";
import { ApiDrawer } from "@/components/ApiDrawer";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isApiDrawerOpen, setIsApiDrawerOpen] = useState(false);

  const navItems = [
    { label: "Overview", href: "/", icon: BarChart3 },
    { label: "Emails", href: "/emails", icon: Mail },
    { label: "Suppressions", href: "/suppressions", icon: ShieldAlert },
    { label: "Playground", href: "/playground", icon: Send },
    { label: "API Usage", href: "/usage", icon: Activity },
    { label: "Domains", href: "/domains", icon: Globe },
    { label: "API Keys", href: "/api-keys", icon: Key },
    { label: "Docs & SDK", href: "/docs", icon: BookOpen },
  ];

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (!data.authenticated) {
          router.replace("/login");
        } else if (data.user?.mustChangePassword) {
          router.replace("/login");
        } else {
          setCurrentUser(data.user);
          setCheckingAuth(false);
        }
      })
      .catch(() => {
        router.replace("/login");
      });
  }, [router]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    router.replace("/login");
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex items-center space-x-3 text-slate-400 text-xs">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <span>Authenticating session...</span>
        </div>
      </div>
    );
  }

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

          {/* Quick API Drawer trigger */}
          <div className="pt-4">
            <button
              onClick={() => setIsApiDrawerOpen(true)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-mono font-medium text-slate-400 hover:text-white bg-slate-800/30 hover:bg-slate-800/70 border border-slate-800 transition"
            >
              <div className="flex items-center space-x-2">
                <Code className="w-3.5 h-3.5 text-blue-400" />
                <span>API Code Drawer</span>
              </div>
              <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 border border-slate-700/50">&lt;/&gt;</span>
            </button>
          </div>
        </nav>

        {/* User Account & Logout */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-900/60 flex items-center justify-between">
          <div className="flex items-center space-x-2.5 truncate">
            <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center font-bold text-xs text-blue-400 shrink-0">
              {currentUser?.name?.[0] || currentUser?.email?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="truncate">
              <p className="text-xs font-semibold text-slate-200 truncate">{currentUser?.name || "Admin"}</p>
              <p className="text-[10px] text-slate-400 font-mono truncate">{currentUser?.email || "Signed In"}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800/60 transition"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 ml-64 min-h-screen bg-slate-950 p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto">{children}</div>
      </main>

      {/* Global API Drawer */}
      <ApiDrawer isOpen={isApiDrawerOpen} onClose={() => setIsApiDrawerOpen(false)} />
    </div>
  );
}

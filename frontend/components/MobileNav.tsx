"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Home, BarChart2, Briefcase, FlaskConical, Bell, Sun, Moon, Monitor, Smartphone, X } from "lucide-react";
import { useState } from "react";
import { useAppSettings } from "@/contexts/AppSettingsContext";

const TABS = [
  { href: "/",         label: "Home",     icon: Home,         match: (p: string) => p === "/" },
  { href: "/markets",  label: "Markets",  icon: BarChart2,    match: (p: string) => p.startsWith("/markets") || ["/oil","/dollar","/treasury","/macro","/country-macro","/rotation","/breadth","/volatility","/regime","/correlations","/institutional","/crowding","/smart-money","/earnings","/options","/options-analytics","/intraday","/rs","/setups","/prebreakout","/mtf","/alpha-engine","/screener","/watchlist","/ai-compute","/memory"].some(r => p.startsWith(r)) },
  { href: "/portfolio",label: "Portfolio",icon: Briefcase,    match: (p: string) => p.startsWith("/portfolio") || p.startsWith("/risk") },
  { href: "/research", label: "Research", icon: FlaskConical, match: (p: string) => p.startsWith("/research") || ["/factors","/backtest","/pairs","/quality","/expected-return","/earnings-drift","/strategy-builder","/reports","/risk-model","/mt5"].some(r => p.startsWith(r)) },
  { href: "/alerts",   label: "Alerts",   icon: Bell,         match: (p: string) => p.startsWith("/alerts") },
];

export function MobileNav() {
  const pathname = usePathname();
  const { theme, toggleTheme, setLayoutMode } = useAppSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      {/* Settings sheet */}
      {settingsOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSettingsOpen(false)} />
          <div className="relative z-10 bg-surface rounded-t-3xl border-t border-border p-6 pb-10">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[14px] font-semibold text-text-primary">Settings</span>
              <button onClick={() => setSettingsOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-text-muted">
                <X size={15} />
              </button>
            </div>

            {/* Theme */}
            <div className="mb-5">
              <div className="text-[11px] text-text-muted uppercase tracking-widest mb-2">Theme</div>
              <div className="flex gap-2">
                <button
                  onClick={() => { toggleTheme(); }}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-[13px] font-medium transition-all",
                    theme === "dark"
                      ? "bg-accent text-white border-accent"
                      : "border-border text-text-muted bg-surface-2"
                  )}
                >
                  <Moon size={14} /> Dark
                </button>
                <button
                  onClick={() => { if (theme === "dark") toggleTheme(); }}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-[13px] font-medium transition-all",
                    theme === "light"
                      ? "bg-accent text-white border-accent"
                      : "border-border text-text-muted bg-surface-2"
                  )}
                >
                  <Sun size={14} /> Light
                </button>
              </div>
            </div>

            {/* Layout */}
            <div>
              <div className="text-[11px] text-text-muted uppercase tracking-widest mb-2">Layout</div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setLayoutMode("desktop"); setSettingsOpen(false); }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-[13px] font-medium text-text-muted bg-surface-2 transition-all active:bg-surface"
                >
                  <Monitor size={14} /> Desktop
                </button>
                <button
                  onClick={() => { setLayoutMode("mobile"); setSettingsOpen(false); }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-accent text-[13px] font-medium text-accent bg-accent/10 transition-all"
                >
                  <Smartphone size={14} /> Mobile ✓
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-2xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center justify-around h-[58px] max-w-screen-sm mx-auto px-1">
          {TABS.map(({ href, label, icon: Icon, match }) => {
            const active = match(pathname);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center justify-center gap-[3px] flex-1 h-full rounded-xl transition-all duration-200",
                  active ? "text-accent" : "text-text-muted"
                )}
              >
                <div className={cn(
                  "flex items-center justify-center w-[38px] h-[26px] rounded-lg transition-all duration-200",
                  active ? "bg-accent/15" : ""
                )}>
                  <Icon size={active ? 21 : 20} strokeWidth={active ? 2.5 : 1.8} />
                </div>
                <span className="text-[9.5px] font-medium tracking-[0.04em]">{label}</span>
              </Link>
            );
          })}

          {/* Settings button */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex flex-col items-center justify-center gap-[3px] flex-1 h-full rounded-xl transition-all duration-200 text-text-muted"
          >
            <div className="flex items-center justify-center w-[38px] h-[26px] rounded-lg">
              {theme === "dark" ? <Sun size={20} strokeWidth={1.8} /> : <Moon size={20} strokeWidth={1.8} />}
            </div>
            <span className="text-[9.5px] font-medium tracking-[0.04em]">View</span>
          </button>
        </div>
      </nav>
    </>
  );
}

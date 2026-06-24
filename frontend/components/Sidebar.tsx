"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useAppSettings } from "@/contexts/AppSettingsContext";
import {
  Mountain, Building2, Swords, Coins, LayoutDashboard, ScanSearch,
  Cpu, TrendingUp, Target, FlaskConical, PieChart, ShieldAlert, Activity,
  Zap, RotateCcw, Crosshair, AlignCenter, CalendarDays, BarChart3,
  Star, Gauge, Network, Waves, Globe, Layers, Percent, GitCompare,
  MonitorDot, SigmaSquare, Radar, Landmark, Users, Milestone, LogIn,
  LogOut, UserCircle, Wand2, Sparkles, BellRing, FileDown, DollarSign,
  FlameKindling, Gem, Droplets, CircleDollarSign, Sun, Moon, Smartphone,
  Monitor, Menu, X, Search, Command,
} from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { CommandPalette, useCommandPalette } from "@/components/CommandPalette";

// ── Nav definition ────────────────────────────────────────────────────────────

const NAV_GROUPS: { label: string; items: { href: string; label: string; icon: React.ElementType }[] }[] = [
  {
    label: "Core",
    items: [
      { href: "/copilot",   label: "AI Copilot",   icon: Sparkles },
      { href: "/watchlist", label: "Watchlist",    icon: Star },
      { href: "/",          label: "Overview",     icon: LayoutDashboard },
    ],
  },
  {
    label: "Markets",
    items: [
      { href: "/setups",        label: "Setups",        icon: Zap },
      { href: "/rotation",      label: "Rotation",      icon: RotateCcw },
      { href: "/prebreakout",   label: "Pre-Breakout",  icon: Crosshair },
      { href: "/mtf",           label: "Multi-TF",      icon: AlignCenter },
      { href: "/ipo",           label: "IPO Intel",     icon: TrendingUp },
      { href: "/earnings",      label: "Earnings",      icon: CalendarDays },
      { href: "/rs",            label: "RS Rankings",   icon: BarChart3 },
      { href: "/breadth",       label: "Breadth Intel", icon: Gauge },
      { href: "/regime",        label: "Regime",        icon: Radar },
    ],
  },
  {
    label: "Flows",
    items: [
      { href: "/institutional",  label: "Inst. Flow",   icon: Landmark },
      { href: "/inst-tracker",   label: "Inst. Tracker",icon: Users },
      { href: "/crowding",       label: "Crowding",     icon: Users },
      { href: "/smart-money",    label: "Smart Money",  icon: DollarSign },
    ],
  },
  {
    label: "Macro",
    items: [
      { href: "/macro",         label: "Macro",           icon: Globe },
      { href: "/country-macro", label: "Country Macro",   icon: Globe },
      { href: "/oil",           label: "Oil Tracker",     icon: Droplets },
      { href: "/dollar",        label: "Dollar Tracker",  icon: CircleDollarSign },
      { href: "/treasury",      label: "Treasury Yields", icon: Landmark },
      { href: "/volatility",    label: "Volatility",      icon: Waves },
    ],
  },
  {
    label: "Themes",
    items: [
      { href: "/metals",        label: "Metals",          icon: Gem },
      { href: "/memory",        label: "Memory Intel",    icon: Cpu },
      { href: "/ai-compute",    label: "AI Compute",      icon: Cpu },
      { href: "/ai-capex",      label: "AI CapEx",        icon: Cpu },
      { href: "/quantum",       label: "Quantum Intel",   icon: Cpu },
      { href: "/rare-earths",   label: "Rare Earths",     icon: Mountain },
      { href: "/congressional", label: "Congress Intel",  icon: Building2 },
      { href: "/defense",       label: "Defense Intel",   icon: Swords },
      { href: "/space",         label: "Space Intel",     icon: Mountain },
      { href: "/crypto",        label: "Crypto Intel",    icon: Coins },
    ],
  },
  {
    label: "Analysis",
    items: [
      { href: "/earnings-drift",   label: "E. Drift / PEAD",  icon: Milestone },
      { href: "/quality",          label: "Quality Factor",   icon: Gem },
      { href: "/alpha-engine",     label: "Alpha Engine",     icon: FlameKindling },
      { href: "/options-analytics",label: "Options Analytics",icon: Percent },
      { href: "/correlations",     label: "Correlations",     icon: Network },
      { href: "/screener",         label: "Screener",         icon: ScanSearch },
      { href: "/factors",          label: "Factors",          icon: TrendingUp },
      { href: "/expected-return",  label: "Exp. Return",      icon: Target },
      { href: "/intraday",         label: "ST Signals",       icon: Activity },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/alerts",           label: "Alerts",           icon: BellRing },
      { href: "/reports",          label: "Reports",          icon: FileDown },
      { href: "/strategy-builder", label: "Strategy Builder", icon: Wand2 },
      { href: "/backtest",         label: "Backtester",       icon: FlaskConical },
    ],
  },
  {
    label: "Portfolio",
    items: [
      { href: "/portfolio",   label: "Portfolio",       icon: PieChart },
      { href: "/risk",        label: "Risk",            icon: ShieldAlert },
      { href: "/risk-engine", label: "Risk Engine",     icon: Layers },
      { href: "/pairs",       label: "Pair Trading",    icon: GitCompare },
      { href: "/risk-model",  label: "PCA Risk Model",  icon: SigmaSquare },
      { href: "/mt5",         label: "MT5 Terminal",    icon: MonitorDot },
    ],
  },
];

export function Sidebar() {
  const pathname  = usePathname();
  const router    = useRouter();
  const { user, loading, signOut } = useAuth();
  const { theme, toggleTheme, layoutMode, setLayoutMode } = useAppSettings();
  const [isOpen, setIsOpen] = useState(false);
  const { open: cmdOpen, setOpen: setCmdOpen } = useCommandPalette();

  useEffect(() => { setIsOpen(false); }, [pathname]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setIsOpen(false); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  async function handleSignOut() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  const sidebar = (
    <aside className={cn(
      "fixed inset-y-0 left-0 z-40 w-56 flex flex-col",
      "bg-surface border-r border-border",
      "transition-transform duration-300 ease-in-out",
      "md:relative md:shrink-0 md:translate-x-0 md:transition-none",
      isOpen ? "translate-x-0" : "-translate-x-full"
    )}>
      {/* Top highlight */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />

      {/* Header */}
      <div className="px-3 py-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-lg bg-accent/20 border border-accent/30 flex items-center justify-center">
              <Sparkles size={12} className="text-accent" />
            </div>
            <div className="flex items-center gap-0.5">
              <span className="text-[13px] font-bold tracking-[0.1em] text-accent uppercase">Quant</span>
              <span className="text-[13px] font-bold tracking-[0.1em] text-text-muted uppercase">Desk</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <NotificationBell />
            <button
              onClick={() => setIsOpen(false)}
              className="md:hidden p-1 rounded text-text-muted hover:text-text-primary transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Search / Command palette trigger */}
        <button
          onClick={() => setCmdOpen(true)}
          className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg border border-border bg-surface-2 hover:border-border-2 transition-colors text-left group"
        >
          <Search size={11} className="text-text-muted group-hover:text-text-primary transition-colors" />
          <span className="text-[11px] text-text-muted flex-1">Search pages…</span>
          <div className="flex items-center gap-0.5 text-[9px] text-text-faint">
            <Command size={9} />K
          </div>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {NAV_GROUPS.map(({ label, items }) => (
          <div key={label} className="mb-0.5">
            <div className="px-3 pt-3 pb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-text-faint">
              {label}
            </div>
            {items.map(({ href, label: itemLabel, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-2.5 mx-1.5 px-2.5 py-2 rounded-lg text-[12px] transition-all duration-150",
                    active
                      ? "bg-accent/15 text-accent border border-accent/20"
                      : "text-text-muted hover:text-text-primary hover:bg-surface-2 border border-transparent"
                  )}
                >
                  <Icon size={13} strokeWidth={active ? 2.5 : 1.8} className={active ? "text-accent" : ""} />
                  <span className={active ? "font-semibold" : "font-medium"}>{itemLabel}</span>
                  {active && <div className="ml-auto w-1 h-1 rounded-full bg-accent" />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-2 py-3 border-t border-border space-y-1.5 shrink-0">
        {!loading && (
          user ? (
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg">
                <div className="w-5 h-5 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center">
                  <UserCircle size={11} className="text-accent" />
                </div>
                <span className="text-[11px] text-text-muted truncate flex-1" title={user.email}>
                  {user.email}
                </span>
              </div>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-[11px] text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
              >
                <LogOut size={11} /> Sign out
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
            >
              <LogIn size={11} /> Sign in
            </Link>
          )
        )}

        {/* Settings row */}
        <div className="flex items-center gap-1">
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
            className="flex items-center gap-1 flex-1 px-2 py-1.5 rounded-lg text-[11px] text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
          >
            {theme === "dark" ? <Sun size={11} /> : <Moon size={11} />}
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <button
            onClick={() => setLayoutMode(layoutMode === "desktop" ? "mobile" : "desktop")}
            title={layoutMode === "desktop" ? "Mobile layout" : "Desktop layout"}
            className="flex items-center gap-1 flex-1 px-2 py-1.5 rounded-lg text-[11px] text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
          >
            {layoutMode === "desktop" ? <Smartphone size={11} /> : <Monitor size={11} />}
            {layoutMode === "desktop" ? "Mobile" : "Desktop"}
          </button>
        </div>

        <div className="px-2 text-[9px] text-text-faint flex items-center justify-between">
          <span>Data: yfinance</span>
          <span className="opacity-50">v3.0</span>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div className="fixed inset-0 z-30 bg-black/70 backdrop-blur-sm md:hidden" onClick={() => setIsOpen(false)} />
      )}

      {/* Mobile hamburger */}
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "md:hidden fixed top-3 left-3 z-50 p-2 rounded-xl",
          "bg-surface border border-border text-text-muted hover:text-text-primary hover:border-border-2 transition-all shadow-card",
          isOpen && "hidden"
        )}
      >
        <Menu size={16} />
      </button>

      {sidebar}

      {/* Command palette */}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </>
  );
}

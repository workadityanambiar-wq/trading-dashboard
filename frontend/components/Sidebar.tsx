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
  Monitor, Menu, X, Search, Command, ScanLine,
} from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { CommandPalette, useCommandPalette } from "@/components/CommandPalette";

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
      { href: "/scanner",       label: "Pattern Scanner", icon: ScanLine },
      { href: "/setups",        label: "Setups",          icon: Zap },
      { href: "/rotation",      label: "Rotation",        icon: RotateCcw },
      { href: "/prebreakout",   label: "Pre-Breakout",    icon: Crosshair },
      { href: "/mtf",           label: "Multi-TF",        icon: AlignCenter },
      { href: "/ipo",           label: "IPO Intel",       icon: TrendingUp },
      { href: "/earnings",      label: "Earnings",        icon: CalendarDays },
      { href: "/rs",            label: "RS Rankings",     icon: BarChart3 },
      { href: "/breadth",       label: "Breadth Intel",   icon: Gauge },
      { href: "/regime",        label: "Regime",          icon: Radar },
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
  const pathname = usePathname();
  const router   = useRouter();
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
      "fixed inset-y-0 left-0 z-40 w-52 flex flex-col",
      "bg-surface border-r border-border",
      "transition-transform duration-200 ease-in-out",
      "md:relative md:shrink-0 md:translate-x-0 md:transition-none",
      isOpen ? "translate-x-0" : "-translate-x-full",
    )}>

      {/* Header */}
      <div className="px-3 py-3 border-b border-border shrink-0">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold tracking-[0.08em] text-text-primary font-sans">QUANT</span>
            <span className="text-[13px] font-bold tracking-[0.08em] text-text-muted font-sans">DESK</span>
            <span className="text-[9px] font-mono text-text-faint ml-0.5">v3</span>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <button
              onClick={() => setIsOpen(false)}
              className="md:hidden p-1 rounded text-text-muted hover:text-text-primary transition-colors"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Search trigger */}
        <button
          onClick={() => setCmdOpen(true)}
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded border border-border bg-surface-2 hover:border-border-2 transition-colors text-left"
        >
          <Search size={10} className="text-text-faint" />
          <span className="text-[10px] text-text-faint flex-1 font-sans">Search…</span>
          <div className="flex items-center gap-0.5 text-[9px] text-text-faint font-mono">
            <Command size={8} />K
          </div>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-1 overflow-y-auto">
        {NAV_GROUPS.map(({ label, items }) => (
          <div key={label} className="mb-0">
            <div className="px-3 pt-3 pb-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-text-faint font-sans">
              {label}
            </div>
            {items.map(({ href, label: itemLabel, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-2 mx-1 px-2 py-1.5 text-[11px] transition-colors duration-100 relative font-sans",
                    active
                      ? "text-accent bg-accent/8 border-l-2 border-accent"
                      : "text-text-muted hover:text-text-primary hover:bg-surface-2 border-l-2 border-transparent",
                  )}
                >
                  <Icon size={11} strokeWidth={active ? 2.5 : 1.8} />
                  <span className={active ? "font-semibold" : "font-normal"}>{itemLabel}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-2 py-2 border-t border-border space-y-1 shrink-0">
        {!loading && (
          user ? (
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 px-2 py-1.5">
                <UserCircle size={10} className="text-text-faint shrink-0" />
                <span className="text-[10px] text-text-faint font-mono truncate flex-1" title={user.email}>
                  {user.email}
                </span>
              </div>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 w-full px-2 py-1 rounded text-[10px] text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors font-sans"
              >
                <LogOut size={10} /> Sign out
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-2 px-2 py-1 rounded text-[10px] text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors font-sans"
            >
              <LogIn size={10} /> Sign in
            </Link>
          )
        )}

        <div className="flex items-center gap-1">
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
            className="flex items-center gap-1 flex-1 px-2 py-1 rounded text-[10px] text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors font-sans"
          >
            {theme === "dark" ? <Sun size={10} /> : <Moon size={10} />}
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <button
            onClick={() => setLayoutMode(layoutMode === "desktop" ? "mobile" : "desktop")}
            className="flex items-center gap-1 flex-1 px-2 py-1 rounded text-[10px] text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors font-sans"
          >
            {layoutMode === "desktop" ? <Smartphone size={10} /> : <Monitor size={10} />}
            {layoutMode === "desktop" ? "Mobile" : "Desktop"}
          </button>
        </div>

        <div className="px-2 text-[9px] text-text-faint font-mono flex items-center justify-between">
          <span>yfinance</span>
          <span className="opacity-40">2026</span>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={() => setIsOpen(false)} />
      )}

      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "md:hidden fixed top-3 left-3 z-50 p-1.5 rounded",
          "bg-surface border border-border text-text-muted hover:text-text-primary transition-all",
          isOpen && "hidden",
        )}
      >
        <Menu size={14} />
      </button>

      {sidebar}

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </>
  );
}

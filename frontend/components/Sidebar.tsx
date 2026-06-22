"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useAppSettings } from "@/contexts/AppSettingsContext";
import {
  Mountain,
  Building2,
  Swords,
  Coins,
  LayoutDashboard,
  ScanSearch,
  Cpu,
  TrendingUp,
  Target,
  FlaskConical,
  PieChart,
  ShieldAlert,
  Activity,
  Zap,
  RotateCcw,
  Crosshair,
  AlignCenter,
  CalendarDays,
  BarChart3,
  Star,
  Gauge,
  Network,
  Waves,
  Globe,
  Layers,
  Percent,
  GitCompare,
  MonitorDot,
  SigmaSquare,
  Radar,
  Landmark,
  Users,
  Milestone,
  LogIn,
  LogOut,
  UserCircle,
  Wand2,
  BellRing,
  FileDown,
  DollarSign,
  FlameKindling,
  Gem,
  Droplets,
  CircleDollarSign,
  Sun,
  Moon,
  Smartphone,
  Monitor,
  Menu,
  X,
} from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";

const NAV = [
  { href: "/watchlist",   label: "Watchlist",    icon: Star },
  { href: "/",          label: "Overview",  icon: LayoutDashboard },
  { href: "/setups",    label: "Setups",    icon: Zap },
  { href: "/rotation",  label: "Rotation",  icon: RotateCcw },
  { href: "/prebreakout", label: "Pre-Breakout", icon: Crosshair },
  { href: "/mtf",         label: "Multi-TF",     icon: AlignCenter },
  { href: "/ipo",         label: "IPO Intel",    icon: TrendingUp },
  { href: "/earnings",    label: "Earnings",     icon: CalendarDays },
  { href: "/rs",          label: "RS Rankings",  icon: BarChart3 },
  { href: "/regime",        label: "Regime",       icon: Radar },
  { href: "/institutional", label: "Inst. Flow",   icon: Landmark },
  { href: "/inst-tracker",  label: "Inst. Tracker", icon: Users },
  { href: "/crowding",      label: "Crowding",      icon: Users },
  { href: "/earnings-drift", label: "E. Drift / PEAD", icon: Milestone },
  { href: "/quality",        label: "Quality Factor",  icon: Gem },
  { href: "/ai-capex",      label: "AI CapEx",     icon: Cpu },
  { href: "/macro",         label: "Macro",        icon: Globe },
  { href: "/country-macro", label: "Country Macro", icon: Globe },
  { href: "/oil",           label: "Oil Tracker",   icon: Droplets },
  { href: "/dollar",        label: "Dollar Tracker", icon: CircleDollarSign },
  { href: "/treasury",      label: "Treasury Yields", icon: Landmark },
  { href: "/metals",        label: "Metals",          icon: Gem },
  { href: "/memory",        label: "Memory Intel",    icon: Cpu },
  { href: "/ai-compute",   label: "AI Compute Infra", icon: Cpu },
  { href: "/quantum",      label: "Quantum Intel",    icon: Cpu },
  { href: "/rare-earths",   label: "Rare Earths",      icon: Mountain },
  { href: "/congressional", label: "Congress Intel",   icon: Building2 },
  { href: "/defense",       label: "Defense Intel",    icon: Swords },
  { href: "/crypto",        label: "Crypto Intel",     icon: Coins },
  { href: "/breadth",       label: "Breadth",      icon: Gauge },
  { href: "/volatility",    label: "Volatility",   icon: Waves },
  { href: "/alpha-engine",      label: "Alpha Engine",      icon: FlameKindling },
  { href: "/smart-money",       label: "Smart Money Flow",  icon: DollarSign },
  { href: "/options-analytics", label: "Options Analytics", icon: Percent },
  { href: "/correlations",  label: "Correlations", icon: Network },
  { href: "/screener",  label: "Screener",  icon: ScanSearch },
  { href: "/factors",   label: "Factors",   icon: TrendingUp },
  { href: "/expected-return", label: "Exp. Return", icon: Target },
  { href: "/intraday",  label: "ST Signals",icon: Activity },
  { href: "/alerts",        label: "Alerts",         icon: BellRing },
  { href: "/reports",       label: "Reports",        icon: FileDown },
  { href: "/strategy-builder", label: "Strategy Builder", icon: Wand2 },
  { href: "/backtest",  label: "Backtester",icon: FlaskConical },
  { href: "/portfolio",    label: "Portfolio",    icon: PieChart },
  { href: "/risk",         label: "Risk",         icon: ShieldAlert },
  { href: "/risk-engine",  label: "Risk Engine",  icon: Layers },
  { href: "/pairs",        label: "Pair Trading", icon: GitCompare },
  { href: "/risk-model",   label: "PCA Risk Model", icon: SigmaSquare },
  { href: "/mt5",          label: "MT5 Terminal", icon: MonitorDot },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const { theme, toggleTheme, layoutMode, setLayoutMode } = useAppSettings();
  const [isOpen, setIsOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Close drawer on Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Prevent body scroll while mobile drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  async function handleSignOut() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <>
      {/* Backdrop — mobile only, visible when drawer is open */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Hamburger button — mobile only, shown when drawer is closed */}
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "md:hidden fixed top-3 left-3 z-50 p-2 rounded-md",
          "bg-surface border border-border text-text-muted hover:text-text-primary transition-colors",
          isOpen && "hidden"
        )}
        aria-label="Open navigation"
      >
        <Menu size={18} />
      </button>

      {/* Sidebar — fixed overlay on mobile, static flex-child on desktop */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 flex flex-col border-r border-border bg-surface",
          "transition-transform duration-300 ease-in-out",
          "md:relative md:w-52 md:shrink-0 md:translate-x-0 md:transition-none",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="px-4 py-5 border-b border-border flex items-center justify-between shrink-0">
          <div>
            <span className="text-sm font-semibold tracking-widest text-accent uppercase">
              Quant
            </span>
            <span className="text-sm font-semibold tracking-widest text-text-muted uppercase">
              Desk
            </span>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            {/* Close button — mobile only */}
            <button
              onClick={() => setIsOpen(false)}
              className="md:hidden p-1 rounded text-text-muted hover:text-text-primary transition-colors"
              aria-label="Close navigation"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-4 space-y-0.5 px-2 overflow-y-auto">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
                  active
                    ? "bg-surface-2 text-text-primary"
                    : "text-text-muted hover:text-text-primary hover:bg-surface-2"
                )}
              >
                <Icon size={15} strokeWidth={active ? 2.5 : 1.8} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-border space-y-2 shrink-0">
          {!loading && (
            user ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <UserCircle size={14} className="text-accent shrink-0" />
                  <span
                    className="text-xs text-text-muted truncate"
                    title={user.email}
                  >
                    {user.email}
                  </span>
                </div>
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
                >
                  <LogOut size={13} />
                  Sign out
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
              >
                <LogIn size={13} />
                Sign in
              </Link>
            )
          )}
          {/* ── Settings row ── */}
          <div className="flex items-center gap-1 pt-1">
            <button
              onClick={toggleTheme}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="flex items-center gap-1.5 flex-1 px-2 py-1.5 rounded text-xs text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
            >
              {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
              {theme === "dark" ? "Light" : "Dark"}
            </button>
            <button
              onClick={() => setLayoutMode(layoutMode === "desktop" ? "mobile" : "desktop")}
              title={layoutMode === "desktop" ? "Switch to mobile layout" : "Switch to desktop layout"}
              className="flex items-center gap-1.5 flex-1 px-2 py-1.5 rounded text-xs text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
            >
              {layoutMode === "desktop" ? <Smartphone size={13} /> : <Monitor size={13} />}
              {layoutMode === "desktop" ? "Mobile" : "Desktop"}
            </button>
          </div>
          <div className="text-xs text-text-muted px-2">Data: yfinance</div>
        </div>
      </aside>
    </>
  );
}

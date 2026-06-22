"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useAppSettings } from "@/contexts/AppSettingsContext";
import {
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
  { href: "/macro",         label: "Macro",        icon: Globe },
  { href: "/country-macro", label: "Country Macro", icon: Globe },
  { href: "/oil",           label: "Oil Tracker",   icon: Droplets },
  { href: "/dollar",        label: "Dollar Tracker", icon: CircleDollarSign },
  { href: "/treasury",      label: "Treasury Yields", icon: Landmark },
  { href: "/metals",        label: "Metals",          icon: Gem },
  { href: "/memory",        label: "Memory Intel",    icon: Cpu },
  { href: "/ai-compute",   label: "AI Compute Infra", icon: Cpu },
  { href: "/quantum",      label: "Quantum Intel",    icon: Cpu },
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

  async function handleSignOut() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <aside className="w-52 shrink-0 flex flex-col border-r border-border bg-surface">
      <div className="px-4 py-5 border-b border-border flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold tracking-widest text-accent uppercase">
            Quant
          </span>
          <span className="text-sm font-semibold tracking-widest text-text-muted uppercase">
            Desk
          </span>
        </div>
        <NotificationBell />
      </div>

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

      <div className="px-3 py-3 border-t border-border space-y-2">
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
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="flex items-center gap-1.5 flex-1 px-2 py-1.5 rounded text-xs text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
          >
            {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          {/* Layout toggle */}
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
  );
}

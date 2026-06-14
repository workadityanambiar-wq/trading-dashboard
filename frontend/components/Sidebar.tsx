"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ScanSearch,
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
} from "lucide-react";

const NAV = [
  { href: "/watchlist",   label: "Watchlist",    icon: Star },
  { href: "/",          label: "Overview",  icon: LayoutDashboard },
  { href: "/setups",    label: "Setups",    icon: Zap },
  { href: "/rotation",  label: "Rotation",  icon: RotateCcw },
  { href: "/prebreakout", label: "Pre-Breakout", icon: Crosshair },
  { href: "/mtf",         label: "Multi-TF",     icon: AlignCenter },
  { href: "/earnings",    label: "Earnings",     icon: CalendarDays },
  { href: "/rs",          label: "RS Rankings",  icon: BarChart3 },
  { href: "/regime",        label: "Regime",       icon: Radar },
  { href: "/institutional", label: "Inst. Flow",   icon: Landmark },
  { href: "/crowding",      label: "Crowding",      icon: Users },
  { href: "/earnings-drift", label: "E. Drift / PEAD", icon: Milestone },
  { href: "/macro",         label: "Macro",        icon: Globe },
  { href: "/breadth",       label: "Breadth",      icon: Gauge },
  { href: "/volatility",    label: "Volatility",   icon: Waves },
  { href: "/options",       label: "Options",      icon: Percent },
  { href: "/correlations",  label: "Correlations", icon: Network },
  { href: "/screener",  label: "Screener",  icon: ScanSearch },
  { href: "/factors",   label: "Factors",   icon: TrendingUp },
  { href: "/expected-return", label: "Exp. Return", icon: Target },
  { href: "/intraday",  label: "ST Signals",icon: Activity },
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

  return (
    <aside className="w-52 shrink-0 flex flex-col border-r border-border bg-surface">
      <div className="px-4 py-5 border-b border-border">
        <span className="text-sm font-semibold tracking-widest text-accent uppercase">
          Quant
        </span>
        <span className="text-sm font-semibold tracking-widest text-text-muted uppercase">
          Desk
        </span>
      </div>

      <nav className="flex-1 py-4 space-y-0.5 px-2">
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

      <div className="px-4 py-3 border-t border-border text-xs text-text-muted">
        Data: yfinance
      </div>
    </aside>
  );
}

"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Droplets, CircleDollarSign, Landmark, Globe,
  RotateCcw, Gauge, Waves, Radar, Network,
  Users, TrendingUp, BarChart3, CalendarDays,
  Activity, DollarSign, Percent, ChevronRight,
  Milestone, Star, Zap, Crosshair, AlignCenter,
  FlameKindling,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SECTIONS = [
  {
    title: "Global Macro",
    color: "#6366f1",
    items: [
      { href: "/macro",         label: "Macro Overview",     icon: Globe,            desc: "Assets, yields, cross-market" },
      { href: "/dollar",        label: "Dollar Tracker",     icon: CircleDollarSign, desc: "DXY, Fed, real yields, liquidity" },
      { href: "/treasury",      label: "Treasury Yields",    icon: Landmark,         desc: "Yield curve, spreads, duration" },
      { href: "/oil",           label: "Oil Tracker",        icon: Droplets,         desc: "Crude, spreads, volatility regime" },
      { href: "/country-macro", label: "Country Macro",      icon: Globe,            desc: "GDP, inflation, rates by country" },
    ],
  },
  {
    title: "Equity Market",
    color: "#3b82f6",
    items: [
      { href: "/regime",      label: "Market Regime",     icon: Radar,      desc: "Risk-on/off, growth, inflation" },
      { href: "/rotation",    label: "Sector Rotation",   icon: RotateCcw,  desc: "RRG quadrant: Leading → Lagging" },
      { href: "/breadth",     label: "Market Breadth",    icon: Gauge,      desc: "% above MA, new highs/lows" },
      { href: "/rs",          label: "RS Rankings",       icon: BarChart3,  desc: "Relative strength across universe" },
      { href: "/volatility",  label: "Volatility / VIX",  icon: Waves,      desc: "VIX regime, term structure, SKEW" },
      { href: "/correlations",label: "Correlations",      icon: Network,    desc: "Cross-asset & sector heatmap" },
    ],
  },
  {
    title: "Flow & Positioning",
    color: "#10b981",
    items: [
      { href: "/institutional", label: "Institutional Flow",   icon: Landmark,      desc: "Large player positioning" },
      { href: "/smart-money",   label: "Smart Money",         icon: DollarSign,     desc: "OBV, CMF, dark pool proxy" },
      { href: "/crowding",      label: "Crowding",            icon: Users,          desc: "Crowd score, short interest" },
    ],
  },
  {
    title: "Technicals",
    color: "#f59e0b",
    items: [
      { href: "/setups",        label: "Setups",              icon: Zap,          desc: "Breakout & momentum setups" },
      { href: "/prebreakout",   label: "Pre-Breakout",        icon: Crosshair,    desc: "Tightening bases near pivot" },
      { href: "/mtf",           label: "Multi-Timeframe",     icon: AlignCenter,  desc: "Trend alignment across TFs" },
      { href: "/intraday",      label: "Short-Term Signals",  icon: Activity,     desc: "Intraday momentum & flow" },
      { href: "/alpha-engine",  label: "Alpha Engine",        icon: FlameKindling,desc: "Combined signal scoring" },
    ],
  },
  {
    title: "Events & Options",
    color: "#8b5cf6",
    items: [
      { href: "/earnings",         label: "Earnings Calendar",    icon: CalendarDays, desc: "Upcoming earnings + options" },
      { href: "/earnings-drift",   label: "Earnings Drift / PEAD",icon: Milestone,    desc: "Post-earnings drift analysis" },
      { href: "/options",          label: "Options Chain",        icon: Percent,      desc: "IV, skew, OI by strike" },
      { href: "/options-analytics",label: "Options Analytics",    icon: Percent,      desc: "Aggregate options flow" },
    ],
  },
  {
    title: "Browse",
    color: "#06b6d4",
    items: [
      { href: "/screener",   label: "Stock Screener",   icon: TrendingUp,  desc: "Filter by factor scores" },
      { href: "/watchlist",  label: "Watchlist",        icon: Star,        desc: "Your saved tickers" },
    ],
  },
];

export default function MarketsPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header
        className="sticky top-0 z-40 px-4 bg-background/95 backdrop-blur-xl border-b border-border"
        style={{ paddingTop: `calc(env(safe-area-inset-top) + 10px)` }}
      >
        <div className="h-11 flex items-center">
          <h1 className="text-[15px] font-bold text-text-primary tracking-tight">Markets</h1>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-6">
        {SECTIONS.map(({ title, color, items }) => (
          <div key={title}>
            <div
              className="text-[10px] font-semibold uppercase tracking-[0.12em] mb-2"
              style={{ color }}
            >
              {title}
            </div>
            <div className="rounded-2xl border border-border bg-surface overflow-hidden divide-y divide-surface-2">
              {items.map(({ href, label, icon: Icon, desc }) => (
                <Link key={href} href={href}>
                  <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2 transition-colors">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${color}18`, border: `1px solid ${color}25` }}
                    >
                      <Icon size={16} style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-text-primary">{label}</div>
                      <div className="text-[11px] text-text-muted truncate">{desc}</div>
                    </div>
                    <ChevronRight size={14} className="text-border shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

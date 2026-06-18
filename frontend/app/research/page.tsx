"use client";
import Link from "next/link";
import {
  TrendingUp, FlaskConical, GitCompare, SigmaSquare,
  Wand2, FileDown, MonitorDot, Gem, Target,
  ChevronRight, LayoutDashboard, PieChart, ShieldAlert, Layers,
} from "lucide-react";

const SECTIONS = [
  {
    title: "Quantitative",
    color: "#6366f1",
    items: [
      { href: "/factors",          label: "Factor Analysis",     icon: TrendingUp,   desc: "IC, ICIR, quintile returns" },
      { href: "/backtest",         label: "Backtester",          icon: FlaskConical, desc: "Factor-based L/S strategy" },
      { href: "/expected-return",  label: "Expected Return",     icon: Target,       desc: "Multi-factor return engine" },
      { href: "/quality",          label: "Quality Factor",      icon: Gem,          desc: "Profitability & balance sheet" },
    ],
  },
  {
    title: "Strategy & Models",
    color: "#10b981",
    items: [
      { href: "/pairs",            label: "Pairs / Stat Arb",   icon: GitCompare,   desc: "Cointegration z-score scanner" },
      { href: "/risk-model",       label: "PCA Risk Model",     icon: SigmaSquare,  desc: "Factor decomposition & VaR" },
      { href: "/strategy-builder", label: "Strategy Builder",   icon: Wand2,        desc: "Build & test custom strategies" },
      { href: "/earnings-drift",   label: "PEAD / E. Drift",    icon: TrendingUp,   desc: "Post-earnings drift study" },
    ],
  },
  {
    title: "Portfolio",
    color: "#3b82f6",
    items: [
      { href: "/portfolio",   label: "Portfolio",        icon: PieChart,      desc: "Holdings, weights, P&L" },
      { href: "/risk",        label: "Risk Attribution", icon: ShieldAlert,   desc: "Factor exposure & drawdown" },
      { href: "/risk-engine", label: "Risk Engine",      icon: Layers,        desc: "HRP + BL + CVaR optimizer" },
    ],
  },
  {
    title: "Tools",
    color: "#f59e0b",
    items: [
      { href: "/reports", label: "Reports",      icon: FileDown,        desc: "Export & download data" },
      { href: "/mt5",     label: "MT5 Terminal", icon: MonitorDot,      desc: "MetaTrader 5 live trading" },
      { href: "/",        label: "Overview",     icon: LayoutDashboard, desc: "Market overview dashboard" },
    ],
  },
];

export default function ResearchPage() {
  return (
    <div className="min-h-screen bg-background">
      <header
        className="sticky top-0 z-40 px-4 bg-background/95 backdrop-blur-xl border-b border-border"
        style={{ paddingTop: `calc(env(safe-area-inset-top) + 10px)` }}
      >
        <div className="h-11 flex items-center">
          <h1 className="text-[15px] font-bold text-text-primary tracking-tight">Research</h1>
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

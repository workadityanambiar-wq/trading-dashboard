"use client";
import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import Link from "next/link";
import {
  RefreshCw, TrendingUp, TrendingDown, Minus,
  ChevronRight, Droplets, CircleDollarSign, Landmark,
  Gauge, Waves, RotateCcw, Globe, Activity, Radar,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Helpers ─────────────────────────────────────────────────────────────────

function pct(v: number | null | undefined, d = 2) {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;
}
function raw(v: number | null | undefined, d = 2) {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;
}
function chgColor(v: number | null | undefined) {
  if (v == null) return "text-[#6b6b80]";
  if (v > 0) return "text-[#22c55e]";
  if (v < 0) return "text-[#ef4444]";
  return "text-[#6b6b80]";
}
function chgBg(v: number | null | undefined) {
  if (v == null) return "bg-[#1a1a24]";
  if (v > 0) return "bg-[#22c55e]/10";
  if (v < 0) return "bg-[#ef4444]/10";
  return "bg-[#1a1a24]";
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function LiveDot() {
  return (
    <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#22c55e] live-dot" />
  );
}

function MarketCard({ ticker, name, price, change }: {
  ticker: string; name: string; price: number; change: number;
}) {
  const isPos = change >= 0;
  return (
    <Link href={`/stock/${ticker}`}>
      <div className={cn(
        "flex flex-col gap-1 p-3 rounded-2xl border min-w-[110px] snap-start",
        isPos ? "border-[#22c55e]/20 bg-[#22c55e]/5" : "border-[#ef4444]/20 bg-[#ef4444]/5"
      )}>
        <span className="text-[11px] text-[#6b6b80] font-medium tracking-wider uppercase">{ticker}</span>
        <span className="text-[15px] font-semibold tabular-nums text-[#e8e8f0]">
          {price >= 1000 ? price.toLocaleString("en-US", { maximumFractionDigits: 1 }) : price.toFixed(2)}
        </span>
        <span className={cn("text-[12px] font-semibold tabular-nums", isPos ? "text-[#22c55e]" : "text-[#ef4444]")}>
          {raw(change)}
        </span>
        <span className="text-[9px] text-[#4a4a60] truncate max-w-[90px]">{name}</span>
      </div>
    </Link>
  );
}

function SectorRow({ name, chg }: { name: string; chg: number }) {
  const isPos = chg >= 0;
  const barPct = Math.min(Math.abs(chg) * 10, 100);
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-[#1a1a24] last:border-0">
      <span className="text-[12px] text-[#a0a0b8] flex-1 truncate">{name}</span>
      <div className="w-20 h-1 bg-[#1a1a24] rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full", isPos ? "bg-[#22c55e]" : "bg-[#ef4444]")}
          style={{ width: `${barPct}%` }}
        />
      </div>
      <span className={cn("text-[12px] font-semibold tabular-nums w-14 text-right", isPos ? "text-[#22c55e]" : "text-[#ef4444]")}>
        {raw(chg)}
      </span>
    </div>
  );
}

// Swipeable hero card strip data
const HERO_CARDS = [
  { id: "regime",   icon: Radar,            label: "Market Regime",  href: "/regime",   color: "#6366f1" },
  { id: "dollar",   icon: CircleDollarSign, label: "Dollar Tracker", href: "/dollar",   color: "#3b82f6" },
  { id: "treasury", icon: Landmark,         label: "Treasuries",     href: "/treasury", color: "#8b5cf6" },
  { id: "oil",      icon: Droplets,         label: "Oil Tracker",    href: "/oil",      color: "#f59e0b" },
  { id: "macro",    icon: Globe,            label: "Macro",          href: "/macro",    color: "#10b981" },
];

const QUICK_LINKS = [
  { href: "/rotation",     label: "Rotation",    icon: RotateCcw,        color: "#6366f1" },
  { href: "/breadth",      label: "Breadth",     icon: Gauge,             color: "#3b82f6" },
  { href: "/volatility",   label: "VIX",         icon: Waves,             color: "#8b5cf6" },
  { href: "/macro",        label: "Macro",       icon: Globe,             color: "#10b981" },
  { href: "/rs",           label: "RS Ranks",    icon: TrendingUp,        color: "#f59e0b" },
  { href: "/regime",       label: "Regime",      icon: Radar,             color: "#ef4444" },
  { href: "/country-macro",label: "Countries",   icon: Globe,             color: "#06b6d4" },
  { href: "/intraday",     label: "Signals",     icon: Activity,          color: "#a855f7" },
];

// ── Main component ────────────────────────────────────────────────────────────

export default function HomePage() {
  const [period, setPeriod] = useState<"change_1d" | "change_wtd" | "change_mtd">("change_1d");

  const { data: overview, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["overview"],
    queryFn: api.getOverview,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60_000,
  });

  const { data: regime } = useQuery({
    queryKey: ["market-regime"],
    queryFn: api.getMarketRegime,
    staleTime: 5 * 60_000,
  });

  const regimeLabel = regime?.regime?.label ?? "—";
  const regimeBias  = regime?.regime?.bias  ?? "—";
  const isRiskOn = regimeBias.toLowerCase().includes("risk-on") || regimeBias.toLowerCase().includes("bull");
  const isRiskOff = regimeBias.toLowerCase().includes("risk-off") || regimeBias.toLowerCase().includes("bear");

  const PERIODS = [
    { value: "change_1d"  as const, label: "1D" },
    { value: "change_wtd" as const, label: "1W" },
    { value: "change_mtd" as const, label: "1M" },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* ── Header ── */}
      <header
        className="sticky top-0 z-40 px-4 pt-safe bg-[#0a0a0f]/95 backdrop-blur-xl border-b border-[#1a1a24]"
        style={{ paddingTop: `calc(env(safe-area-inset-top) + 10px)` }}
      >
        <div className="flex items-center justify-between h-11">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold tracking-[0.12em] text-[#6366f1] uppercase">Quant</span>
            <span className="text-[15px] font-bold tracking-[0.12em] text-[#4a4a60] uppercase">Desk</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <LiveDot />
              <span className="text-[10px] text-[#4a4a60]">Live</span>
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center justify-center w-8 h-8 rounded-xl bg-[#1a1a24] text-[#6b6b80] active:bg-[#2a2a38] transition-colors"
            >
              <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-5">

        {/* ── Regime Banner ── */}
        {regime && (
          <div className={cn(
            "rounded-2xl border p-4 card-enter",
            isRiskOn  ? "border-[#22c55e]/30 bg-[#22c55e]/5" :
            isRiskOff ? "border-[#ef4444]/30 bg-[#ef4444]/5" :
                        "border-[#6366f1]/30 bg-[#6366f1]/5"
          )}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] text-[#6b6b80] uppercase tracking-widest mb-1">Market Regime</div>
                <div className="text-[18px] font-bold text-[#e8e8f0] leading-tight">{regimeLabel}</div>
                <div className={cn(
                  "inline-flex items-center gap-1 mt-2 px-2.5 py-0.5 rounded-full text-[11px] font-semibold",
                  isRiskOn  ? "bg-[#22c55e]/20 text-[#22c55e]" :
                  isRiskOff ? "bg-[#ef4444]/20 text-[#ef4444]" :
                              "bg-[#6366f1]/20 text-[#6366f1]"
                )}>
                  {isRiskOn ? <TrendingUp size={10} /> : isRiskOff ? <TrendingDown size={10} /> : <Minus size={10} />}
                  {regimeBias}
                </div>
              </div>
              <Link href="/regime" className="flex items-center gap-1 text-[11px] text-[#4a4a60] active:text-[#e8e8f0]">
                Details <ChevronRight size={12} />
              </Link>
            </div>
            {regime.recommendations && (
              <div className="mt-3 pt-3 border-t border-[#ffffff08] flex gap-3 text-[10px]">
                <div>
                  <div className="text-[#4a4a60] mb-1">Best Sectors</div>
                  <div className="text-[#22c55e]">{regime.recommendations.best_sectors?.slice(0,2).join(" · ") || "—"}</div>
                </div>
                <div>
                  <div className="text-[#4a4a60] mb-1">Avoid</div>
                  <div className="text-[#ef4444]">{regime.recommendations.avoid_sectors?.slice(0,2).join(" · ") || "—"}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Hero Swipe Cards ── */}
        <div>
          <div className="text-[10px] text-[#4a4a60] uppercase tracking-widest mb-2">Quick Access</div>
          <div className="flex gap-3 overflow-x-auto snap-x-mandatory -mx-4 px-4 pb-1">
            {HERO_CARDS.map(({ id, icon: Icon, label, href, color }) => (
              <Link key={id} href={href} className="snap-start shrink-0">
                <div className="w-[130px] rounded-2xl border border-[#2a2a38] bg-[#111118] p-4 flex flex-col gap-3 active:bg-[#1a1a24] transition-colors">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${color}20`, border: `1px solid ${color}30` }}
                  >
                    <Icon size={18} style={{ color }} />
                  </div>
                  <div>
                    <div className="text-[12px] font-medium text-[#e8e8f0] leading-snug">{label}</div>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[9px] text-[#4a4a60]">View</span>
                      <ChevronRight size={9} className="text-[#4a4a60]" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Market Indices ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] text-[#4a4a60] uppercase tracking-widest">Markets</div>
            <div className="flex items-center gap-1 bg-[#111118] rounded-full p-0.5 border border-[#2a2a38]">
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPeriod(p.value)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[10px] font-medium transition-all",
                    period === p.value ? "bg-[#6366f1] text-white" : "text-[#6b6b80]"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-24 text-[#4a4a60] text-xs gap-2">
              <RefreshCw size={13} className="animate-spin" /> Loading…
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto snap-x-mandatory -mx-4 px-4 pb-1">
              {overview?.indices.map((idx) => (
                <MarketCard
                  key={idx.ticker}
                  ticker={idx.ticker}
                  name={idx.name}
                  price={idx.price}
                  change={idx[period]}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Quick Links Grid ── */}
        <div>
          <div className="text-[10px] text-[#4a4a60] uppercase tracking-widest mb-2">Explore</div>
          <div className="grid grid-cols-4 gap-2">
            {QUICK_LINKS.map(({ href, label, icon: Icon, color }) => (
              <Link key={href} href={href}>
                <div className="flex flex-col items-center gap-2 p-3 rounded-2xl border border-[#2a2a38] bg-[#111118] active:bg-[#1a1a24] transition-colors">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${color}15` }}
                  >
                    <Icon size={15} style={{ color }} />
                  </div>
                  <span className="text-[9.5px] text-[#6b6b80] text-center leading-tight">{label}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Sector Performance ── */}
        {overview?.sectors && overview.sectors.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] text-[#4a4a60] uppercase tracking-widest">Sectors Today</div>
              <Link href="/rotation" className="text-[10px] text-[#6366f1] flex items-center gap-1">
                Rotation <ChevronRight size={10} />
              </Link>
            </div>
            <div className="rounded-2xl border border-[#2a2a38] bg-[#111118] px-4 py-1">
              {overview.sectors
                .slice()
                .sort((a, b) => b.change_1d - a.change_1d)
                .map((s) => (
                  <SectorRow key={s.ticker} name={s.sector || s.name} chg={s.change_1d} />
                ))}
            </div>
          </div>
        )}

        {/* ── Market Breadth ── */}
        {overview?.breadth && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] text-[#4a4a60] uppercase tracking-widest">Breadth</div>
              <Link href="/breadth" className="text-[10px] text-[#6366f1] flex items-center gap-1">
                Details <ChevronRight size={10} />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-[#2a2a38] bg-[#111118] p-4">
                <div className="text-[10px] text-[#6b6b80] mb-1">Above 50-MA</div>
                <div className="text-[22px] font-bold tabular-nums text-[#e8e8f0]">
                  {overview.breadth.above_50ma_pct.toFixed(0)}
                  <span className="text-[14px] text-[#6b6b80]">%</span>
                </div>
                <div className="mt-2 h-1.5 bg-[#1a1a24] rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full", overview.breadth.above_50ma_pct > 50 ? "bg-[#22c55e]" : "bg-[#ef4444]")}
                    style={{ width: `${overview.breadth.above_50ma_pct}%` }}
                  />
                </div>
              </div>
              <div className="rounded-2xl border border-[#2a2a38] bg-[#111118] p-4">
                <div className="text-[10px] text-[#6b6b80] mb-1">Above 200-MA</div>
                <div className="text-[22px] font-bold tabular-nums text-[#e8e8f0]">
                  {overview.breadth.above_200ma_pct.toFixed(0)}
                  <span className="text-[14px] text-[#6b6b80]">%</span>
                </div>
                <div className="mt-2 h-1.5 bg-[#1a1a24] rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full", overview.breadth.above_200ma_pct > 50 ? "bg-[#22c55e]" : "bg-[#ef4444]")}
                    style={{ width: `${overview.breadth.above_200ma_pct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import Link from "next/link";
import {
  RefreshCw, TrendingUp, TrendingDown, Minus,
  ChevronRight, Droplets, CircleDollarSign, Landmark,
  Gauge, Waves, RotateCcw, Globe, Activity, Radar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { HistoryDrawer, type DrawerConfig } from "@/components/HistoryDrawer";
import { PageGuide } from "@/components/PageGuide";

// ── Helpers ─────────────────────────────────────────────────────────────────

function raw(v: number | null | undefined, d = 2) {
  if (v == null) return "—";
  const pct = v * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(d)}%`;
}
function chgColor(v: number | null | undefined) {
  if (v == null) return "text-text-muted";
  if (v > 0) return "text-positive";
  if (v < 0) return "text-negative";
  return "text-text-muted";
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function LiveDot() {
  return <span className="inline-block w-1.5 h-1.5 rounded-full bg-positive live-dot" />;
}

function MarketCard({ ticker, name, price, change }: {
  ticker: string; name: string; price: number; change: number;
}) {
  const [drawer, setDrawer] = useState<DrawerConfig | null>(null);
  const isPos = change >= 0;
  return (
    <>
      <div
        onClick={() => setDrawer({ fetchUrl: `/api/chart/stock/${ticker}`, color: "#6366f1" })}
        className={cn(
          "flex flex-col gap-1 p-3 rounded-2xl border min-w-[110px] snap-start cursor-pointer",
          isPos ? "border-positive/20 bg-positive/5" : "border-negative/20 bg-negative/5"
        )}
      >
        <span className="text-[11px] text-text-muted font-medium tracking-wider uppercase">{ticker}</span>
        <span className="text-[15px] font-semibold tabular-nums text-text-primary">
          {price >= 1000 ? price.toLocaleString("en-US", { maximumFractionDigits: 1 }) : price.toFixed(2)}
        </span>
        <span className={cn("text-[12px] font-semibold tabular-nums", isPos ? "text-positive" : "text-negative")}>
          {raw(change)}
        </span>
        <span className="text-[9px] text-text-muted/60 truncate max-w-[90px]">{name}</span>
      </div>
      <HistoryDrawer open={!!drawer} onClose={() => setDrawer(null)} config={drawer} />
    </>
  );
}

function SectorRow({ name, ticker, chg, onClick }: { name: string; ticker: string; chg: number; onClick?: () => void }) {
  const isPos = chg >= 0;
  const barPct = Math.min(Math.abs(chg) * 1000, 100);
  return (
    <div onClick={onClick} className={cn("flex items-center gap-3 py-2.5 border-b border-surface-2 last:border-0", onClick && "cursor-pointer hover:bg-surface-2/30")}>
      <span className="text-[12px] text-text-muted flex-1 truncate">{name}</span>
      <div className="w-20 h-1 bg-surface-2 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full", isPos ? "bg-positive" : "bg-negative")}
          style={{ width: `${barPct}%` }}
        />
      </div>
      <span className={cn("text-[12px] font-semibold tabular-nums w-14 text-right", isPos ? "text-positive" : "text-negative")}>
        {raw(chg)}
      </span>
    </div>
  );
}

const HERO_CARDS = [
  { id: "regime",   icon: Radar,            label: "Market Regime",  href: "/regime",   color: "#6366f1" },
  { id: "dollar",   icon: CircleDollarSign, label: "Dollar Tracker", href: "/dollar",   color: "#3b82f6" },
  { id: "treasury", icon: Landmark,         label: "Treasuries",     href: "/treasury", color: "#8b5cf6" },
  { id: "oil",      icon: Droplets,         label: "Oil Tracker",    href: "/oil",      color: "#f59e0b" },
  { id: "macro",    icon: Globe,            label: "Macro",          href: "/macro",    color: "#10b981" },
];

const QUICK_LINKS = [
  { href: "/rotation",     label: "Rotation",  icon: RotateCcw,  color: "#6366f1" },
  { href: "/breadth",      label: "Breadth",   icon: Gauge,      color: "#3b82f6" },
  { href: "/volatility",   label: "VIX",       icon: Waves,      color: "#8b5cf6" },
  { href: "/macro",        label: "Macro",     icon: Globe,      color: "#10b981" },
  { href: "/rs",           label: "RS Ranks",  icon: TrendingUp, color: "#f59e0b" },
  { href: "/regime",       label: "Regime",    icon: Radar,      color: "#ef4444" },
  { href: "/country-macro",label: "Countries", icon: Globe,      color: "#06b6d4" },
  { href: "/intraday",     label: "Signals",   icon: Activity,   color: "#a855f7" },
];

// ── Main component ────────────────────────────────────────────────────────────

export default function HomePage() {
  const [period, setPeriod] = useState<"change_1d" | "change_wtd" | "change_mtd">("change_1d");
  const [drawer, setDrawer] = useState<DrawerConfig | null>(null);

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
  const isRiskOn  = regimeBias.toLowerCase().includes("risk-on")  || regimeBias.toLowerCase().includes("bull");
  const isRiskOff = regimeBias.toLowerCase().includes("risk-off") || regimeBias.toLowerCase().includes("bear");

  const PERIODS = [
    { value: "change_1d"  as const, label: "1D" },
    { value: "change_wtd" as const, label: "1W" },
    { value: "change_mtd" as const, label: "1M" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ── */}
      <header
        className="sticky top-0 z-40 px-4 bg-background/95 backdrop-blur-xl border-b border-border"
        style={{ paddingTop: `calc(env(safe-area-inset-top) + 10px)` }}
      >
        <div className="flex items-center justify-between h-11">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold tracking-[0.12em] text-accent uppercase">Quant</span>
            <span className="text-[15px] font-bold tracking-[0.12em] text-text-muted uppercase">Desk</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <LiveDot />
              <span className="text-[10px] text-text-muted">Live</span>
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center justify-center w-8 h-8 rounded-xl bg-surface-2 text-text-muted active:bg-border transition-colors"
            >
              <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-5">

        <PageGuide
          title="Home Dashboard — Guide"
          subtitle="Your real-time command center for global market conditions"
          steps={[
            { title: "Read the Market Regime Banner", detail: "The banner at the top shows the current market regime (e.g. 'Risk-On Bull' or 'Risk-Off Bear') and bias. Green = risk-on, red = risk-off. Tap 'Details' to go to the full Regime page." },
            { title: "Swipe Hero Cards for Key Trackers", detail: "Scroll horizontally through the hero cards to jump to Regime, Dollar, Treasuries, Oil, and Macro pages instantly." },
            { title: "Check Market Indices", detail: "The indices row shows live prices and % changes for SPY, QQQ, IWM, DIA, and more. Toggle 1D / 1W / 1M using the pill selector. Tap any index card to see its price history chart." },
            { title: "Browse Quick Links Grid", detail: "The 8-tile grid gives you one-tap access to Rotation, Breadth, VIX, Macro, RS Ranks, Regime, Countries, and Intraday Signals." },
            { title: "Scan Sector Performance", detail: "The sector bar chart ranks all 11 GICS sectors by today's return. Red bars = underperforming, green = outperforming. Tap any sector row to view its price history. Tap 'Rotation' to see the full RRG chart." },
            { title: "Check Market Breadth", detail: "The two breadth tiles show what % of S&P 500 stocks are trading above their 50-day and 200-day moving averages. Above 70% is strong; below 30% is a warning sign." },
          ]}
          howItWorks={[
            { title: "Live Data Pipeline", detail: "The backend fetches real-time prices from Yahoo Finance every 5 minutes. Sector ETFs (XLK, XLF, etc.) proxy for sector returns. Data is cached in DuckDB to avoid rate limits." },
            { title: "Market Regime Model", detail: "The regime is computed by a multi-factor scoring model that combines trend (SMA crossovers), breadth (% above MAs), momentum, credit spreads, and volatility. The score is mapped to one of 6 regimes." },
            { title: "Breadth Calculation", detail: "Breadth is computed nightly across S&P 500 constituents. The % above 50-MA and % above 200-MA are standard market health indicators used by professional traders." },
            { title: "Auto-Refresh", detail: "The page auto-refreshes every 5 minutes during market hours. You can force-refresh any time using the circular arrow button in the top-right corner." },
          ]}
          tips={[
            "Green regime banner + breadth above 70% = ideal environment for momentum and growth strategies.",
            "When breadth diverges from price (index up but breadth falling), expect near-term reversal.",
            "Tap any index card for a pop-up price history chart without leaving the home page.",
          ]}
        />

        {/* ── Regime Banner ── */}
        {regime && (
          <div className={cn(
            "rounded-2xl border p-4 card-enter",
            isRiskOn  ? "border-positive/30 bg-positive/5" :
            isRiskOff ? "border-negative/30 bg-negative/5" :
                        "border-accent/30 bg-accent/5"
          )}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] text-text-muted uppercase tracking-widest mb-1">Market Regime</div>
                <div className="text-[18px] font-bold text-text-primary leading-tight">{regimeLabel}</div>
                <div className={cn(
                  "inline-flex items-center gap-1 mt-2 px-2.5 py-0.5 rounded-full text-[11px] font-semibold",
                  isRiskOn  ? "bg-positive/20 text-positive" :
                  isRiskOff ? "bg-negative/20 text-negative" :
                              "bg-accent/20 text-accent"
                )}>
                  {isRiskOn ? <TrendingUp size={10} /> : isRiskOff ? <TrendingDown size={10} /> : <Minus size={10} />}
                  {regimeBias}
                </div>
              </div>
              <Link href="/regime" className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary">
                Details <ChevronRight size={12} />
              </Link>
            </div>
            {regime.recommendations && (
              <div className="mt-3 pt-3 border-t border-border/30 flex gap-3 text-[10px]">
                <div>
                  <div className="text-text-muted mb-1">Best Sectors</div>
                  <div className="text-positive">{regime.recommendations.best_sectors?.slice(0,2).join(" · ") || "—"}</div>
                </div>
                <div>
                  <div className="text-text-muted mb-1">Avoid</div>
                  <div className="text-negative">{regime.recommendations.avoid_sectors?.slice(0,2).join(" · ") || "—"}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Hero Swipe Cards ── */}
        <div>
          <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Quick Access</div>
          <div className="flex gap-3 overflow-x-auto snap-x-mandatory -mx-4 px-4 pb-1">
            {HERO_CARDS.map(({ id, icon: Icon, label, href, color }) => (
              <Link key={id} href={href} className="snap-start shrink-0">
                <div className="w-[130px] rounded-2xl border border-border bg-surface p-4 flex flex-col gap-3 hover:bg-surface-2 transition-colors">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${color}20`, border: `1px solid ${color}30` }}
                  >
                    <Icon size={18} style={{ color }} />
                  </div>
                  <div>
                    <div className="text-[12px] font-medium text-text-primary leading-snug">{label}</div>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[9px] text-text-muted">View</span>
                      <ChevronRight size={9} className="text-text-muted" />
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
            <div className="text-[10px] text-text-muted uppercase tracking-widest">Markets</div>
            <div className="flex items-center gap-1 bg-surface rounded-full p-0.5 border border-border">
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPeriod(p.value)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[10px] font-medium transition-all",
                    period === p.value ? "bg-accent text-white" : "text-text-muted"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-24 text-text-muted text-xs gap-2">
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
          <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Explore</div>
          <div className="grid grid-cols-4 gap-2">
            {QUICK_LINKS.map(({ href, label, icon: Icon, color }) => (
              <Link key={href} href={href}>
                <div className="flex flex-col items-center gap-2 p-3 rounded-2xl border border-border bg-surface hover:bg-surface-2 transition-colors">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${color}15` }}
                  >
                    <Icon size={15} style={{ color }} />
                  </div>
                  <span className="text-[9.5px] text-text-muted text-center leading-tight">{label}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Sector Performance ── */}
        {overview?.sectors && overview.sectors.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] text-text-muted uppercase tracking-widest">Sectors Today</div>
              <Link href="/rotation" className="text-[10px] text-accent flex items-center gap-1">
                Rotation <ChevronRight size={10} />
              </Link>
            </div>
            <div className="rounded-2xl border border-border bg-surface px-4 py-1">
              {overview.sectors
                .slice()
                .sort((a, b) => b.change_1d - a.change_1d)
                .map((s) => (
                  <SectorRow key={s.ticker} ticker={s.ticker} name={s.sector || s.name} chg={s.change_1d} onClick={() => setDrawer({ fetchUrl: `/api/chart/stock/${s.ticker}`, color: "#6366f1" })} />
                ))}
            </div>
          </div>
        )}

        {/* ── Market Breadth ── */}
        {overview?.breadth && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] text-text-muted uppercase tracking-widest">Breadth</div>
              <Link href="/breadth" className="text-[10px] text-accent flex items-center gap-1">
                Details <ChevronRight size={10} />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Above 50-MA",  raw: overview.breadth.above_50ma_pct },
                { label: "Above 200-MA", raw: overview.breadth.above_200ma_pct },
              ].map(({ label, raw }) => {
                const pct = Math.round(raw * 100);
                return (
                  <div key={label} className="rounded-2xl border border-border bg-surface p-4">
                    <div className="text-[10px] text-text-muted mb-1">{label}</div>
                    <div className="text-[22px] font-bold tabular-nums text-text-primary">
                      {pct}
                      <span className="text-[14px] text-text-muted">%</span>
                    </div>
                    <div className="mt-2 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", pct > 50 ? "bg-positive" : "bg-negative")}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
      <HistoryDrawer open={!!drawer} onClose={() => setDrawer(null)} config={drawer} />
    </div>
  );
}

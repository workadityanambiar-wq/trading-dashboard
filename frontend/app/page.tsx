"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import Link from "next/link";
import {
  RefreshCw, TrendingUp, TrendingDown, Minus, ChevronRight,
  Droplets, CircleDollarSign, Landmark, Gauge, Waves, RotateCcw,
  Globe, Activity, Radar, Sparkles, BarChart3, ScanSearch, Zap,
  Target, FlameKindling, Star, Command, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { HistoryDrawer, type DrawerConfig } from "@/components/HistoryDrawer";
import {
  GlassCard, MetricKPI, AIInsightBanner, SectionHeader, TrendBadge,
  SkeletonCard, PulsingDot, RegimeBadge, NumberTicker, QuickLinkCard,
} from "@/components/ui/premium";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPct(v: number | null | undefined, decimals = 2) {
  if (v == null) return "—";
  const p = v * 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(decimals)}%`;
}

function fmtPrice(v: number) {
  return v >= 1000
    ? v.toLocaleString("en-US", { maximumFractionDigits: 1 })
    : v.toFixed(2);
}

function chgColor(v: number | null | undefined) {
  if (v == null) return "#6b6b80";
  return v > 0 ? "#22c55e" : v < 0 ? "#ef4444" : "#6b6b80";
}

// ── AI insight generator (client-side from available data) ────────────────────

function buildInsight(regime: any, overview: any): { text: string; bull: string; bear: string; risk: string; sentiment: "bullish" | "bearish" | "neutral" | "warning"; confidence: number } {
  const label  = regime?.regime?.label  ?? "Unknown";
  const bias   = regime?.regime?.bias   ?? "";
  const best   = regime?.recommendations?.best_sectors?.slice(0, 2).join(" and ") ?? "";
  const avoid  = regime?.recommendations?.avoid_sectors?.slice(0, 1)[0] ?? "";
  const breadth50  = overview?.breadth?.above_50ma_pct;
  const breadth200 = overview?.breadth?.above_200ma_pct;

  const isBull = bias.toLowerCase().includes("bull") || bias.toLowerCase().includes("risk-on");
  const isBear = bias.toLowerCase().includes("bear") || bias.toLowerCase().includes("risk-off");

  let text = "";
  let bull = "";
  let bear = "";
  let risk = "";
  let confidence = 0.72;
  let sentiment: "bullish" | "bearish" | "neutral" | "warning" = "neutral";

  if (isBull) {
    sentiment = "bullish";
    confidence = 0.78;
    const b50 = breadth50 != null ? ` with ${Math.round(breadth50 * 100)}% of S&P 500 stocks above 50-MA` : "";
    text = `Current regime is ${label}${b50}. ${best ? `${best} showing relative strength — favour these sectors for new exposure.` : "Breadth supports continued upside."} Momentum and quality factors historically outperform in this environment.`;
    bull = `Continued breadth expansion and rate stability could drive further upside. ${best ? `${best} leadership intact.` : ""}`;
    bear = `Any sudden VIX spike or credit spread widening could invalidate the bull thesis rapidly.`;
    risk = avoid ? `${avoid} sector weakness is a canary — watch for broadening deterioration.` : "Monitor breadth for divergences — narrow leadership is a late-cycle warning.";
  } else if (isBear) {
    sentiment = "bearish";
    confidence = 0.74;
    const b200 = breadth200 != null ? ` Only ${Math.round(breadth200 * 100)}% of stocks hold above 200-MA.` : "";
    text = `Regime has shifted to ${label}.${b200} Defensives and cash are outperforming risk assets. ${avoid ? `Reduce ${avoid} exposure.` : "Reduce cyclical exposure."}`;
    bull = "A VIX compression or policy pivot could trigger a rapid short-squeeze rally.";
    bear = `Sustained selling pressure likely as breadth deteriorates — bear markets rarely end in one move.`;
    risk = "Liquidity risk: wide bid-ask spreads and thin orderbooks amplify drawdowns.";
  } else {
    sentiment = "neutral";
    confidence = 0.65;
    text = `Market regime is ${label} — mixed signals with no clear directional edge. Breadth is ${breadth50 != null ? `at ${Math.round(breadth50 * 100)}% above 50-MA` : "indeterminate"}. Risk management and position sizing are paramount in this environment.`;
    bull = "A break above recent range with expanding breadth would confirm the next leg higher.";
    bear = "Failure to hold key support with declining breadth signals distribution and further downside.";
    risk = "Chop risk is highest in sideways regimes — avoid overtrading and maintain asymmetric setups.";
  }

  return { text, bull, bear, risk, sentiment, confidence };
}

// ── Index Card ────────────────────────────────────────────────────────────────

function IndexCard({
  ticker, name, price, change, onClick,
}: {
  ticker: string; name: string; price: number; change: number; onClick(): void;
}) {
  const isPos = change >= 0;
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col gap-1.5 p-3 rounded-xl border text-left min-w-[110px] snap-start transition-all duration-200 hover:translate-y-[-1px]",
        "md:min-w-0 md:w-full",
        isPos
          ? "border-positive/20 bg-positive/5 hover:border-positive/40 hover:bg-positive/8"
          : "border-negative/20 bg-negative/5 hover:border-negative/40 hover:bg-negative/8"
      )}
    >
      <div className="text-[10px] font-bold tracking-widest text-text-muted uppercase">{ticker}</div>
      <div className="text-[16px] font-bold tabular-nums text-text-primary">{fmtPrice(price)}</div>
      <div className={cn("text-[12px] font-bold tabular-nums", isPos ? "text-positive" : "text-negative")}>
        {fmtPct(change)}
      </div>
      <div className="text-[9px] text-text-faint truncate max-w-[96px]">{name}</div>
    </button>
  );
}

// ── Sector Bar ────────────────────────────────────────────────────────────────

function SectorBar({ name, chg, onClick }: { name: string; chg: number; onClick?(): void }) {
  const isPos = chg >= 0;
  const w = Math.min(Math.abs(chg) * 1500, 100);
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full py-2 border-b border-surface-2 last:border-0 hover:bg-surface-2/30 px-3 -mx-3 rounded transition-colors text-left"
    >
      <span className="text-[12px] text-text-muted w-36 shrink-0 truncate">{name}</span>
      <div className="flex-1 h-1 bg-surface-2 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", isPos ? "bg-positive" : "bg-negative")}
          style={{ width: `${w}%` }}
        />
      </div>
      <span className={cn("text-[12px] font-bold tabular-nums w-14 text-right shrink-0", isPos ? "text-positive" : "text-negative")}>
        {fmtPct(chg, 1)}
      </span>
    </button>
  );
}

// ── Quick links ───────────────────────────────────────────────────────────────

const QUICK = [
  { href: "/rotation",      label: "Rotation",   icon: RotateCcw,   color: "#6366f1" },
  { href: "/breadth",       label: "Breadth",    icon: Gauge,       color: "#3b82f6" },
  { href: "/volatility",    label: "Volatility", icon: Waves,       color: "#8b5cf6" },
  { href: "/screener",      label: "Screener",   icon: ScanSearch,  color: "#10b981" },
  { href: "/rs",            label: "RS Ranks",   icon: BarChart3,   color: "#f59e0b" },
  { href: "/regime",        label: "Regime",     icon: Radar,       color: "#ef4444" },
  { href: "/alpha-engine",  label: "Alpha",      icon: FlameKindling, color: "#f97316" },
  { href: "/intraday",      label: "Signals",    icon: Activity,    color: "#a855f7" },
];

// ── Main ──────────────────────────────────────────────────────────────────────

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

  const insight = (regime || overview) ? buildInsight(regime, overview) : null;
  const b50  = overview?.breadth?.above_50ma_pct  ?? null;
  const b200 = overview?.breadth?.above_200ma_pct ?? null;

  const regimeLabel = regime?.regime?.label ?? "";
  const regimeBias  = regime?.regime?.bias  ?? "";
  const isBull = regimeBias.toLowerCase().includes("bull") || regimeBias.toLowerCase().includes("risk-on");
  const isBear = regimeBias.toLowerCase().includes("bear") || regimeBias.toLowerCase().includes("risk-off");
  const regimeColor = isBull ? "#22c55e" : isBear ? "#ef4444" : "#6366f1";

  const PERIODS = [
    { value: "change_1d"  as const, label: "1D" },
    { value: "change_wtd" as const, label: "1W" },
    { value: "change_mtd" as const, label: "1M" },
  ];

  const sortedSectors = overview?.sectors?.slice().sort((a, b) => b.change_1d - a.change_1d) ?? [];

  return (
    <div className="min-h-screen bg-background">

      {/* ── Mobile sticky header ── */}
      <header className="md:hidden sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-accent/20 border border-accent/30 flex items-center justify-center">
              <Sparkles size={11} className="text-accent" />
            </div>
            <span className="text-[13px] font-bold tracking-[0.1em] text-accent uppercase">Quant</span>
            <span className="text-[13px] font-bold tracking-[0.1em] text-text-muted uppercase">Desk</span>
          </div>
          <div className="flex items-center gap-2">
            <PulsingDot />
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="p-1.5 rounded-lg bg-surface-2 text-text-muted active:bg-border transition-colors"
            >
              <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Desktop layout ── */}
      <div className="hidden md:block">
        {/* Desktop header bar */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-text-primary">Market Overview</h1>
            <p className="text-[12px] text-text-muted mt-0.5">
              Real-time intelligence · {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-[11px] text-text-muted">
              <PulsingDot />
              <span>Live</span>
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface text-[12px] text-text-muted hover:text-text-primary hover:border-border-2 transition-all"
            >
              <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>

        {/* AI Insight Banner */}
        {insight && (
          <div className="mb-5 slide-up">
            <AIInsightBanner
              insight={insight.text}
              bullCase={insight.bull}
              bearCase={insight.bear}
              risk={insight.risk}
              sentiment={insight.sentiment}
              confidence={insight.confidence}
            />
          </div>
        )}

        {/* KPI row */}
        <div className="grid grid-cols-5 gap-3 mb-5 stagger">
          {/* Regime */}
          <GlassCard className="p-4 col-span-2 slide-up" glow={isBull ? "green" : isBear ? "red" : "accent"}>
            <div className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">Market Regime</div>
            <div className="flex items-start justify-between">
              <div>
                {regimeLabel ? (
                  <RegimeBadge label={regimeLabel} />
                ) : (
                  <div className="h-6 w-24 skeleton rounded" />
                )}
                {regimeBias && (
                  <div className="mt-2 text-[11px] text-text-muted">{regimeBias}</div>
                )}
              </div>
              <Link href="/regime" className="text-[10px] text-text-muted hover:text-accent flex items-center gap-0.5 transition-colors mt-0.5">
                Details <ChevronRight size={10} />
              </Link>
            </div>
            {regime?.recommendations && (
              <div className="mt-3 pt-3 border-t border-border flex gap-4 text-[10px]">
                <div>
                  <div className="text-text-faint mb-1">Best sectors</div>
                  <div className="text-positive font-medium">{regime.recommendations.best_sectors?.slice(0,2).join(" · ") || "—"}</div>
                </div>
                <div>
                  <div className="text-text-faint mb-1">Avoid</div>
                  <div className="text-negative font-medium">{regime.recommendations.avoid_sectors?.slice(0,1)[0] || "—"}</div>
                </div>
              </div>
            )}
          </GlassCard>

          {/* Breadth */}
          <GlassCard className="p-4 slide-up">
            <div className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">Breadth</div>
            <div className="space-y-3">
              {[
                { label: "Above 50-MA", val: b50 },
                { label: "Above 200-MA", val: b200 },
              ].map(({ label, val }) => {
                const pct = val != null ? Math.round(val * 100) : null;
                const col = pct != null ? (pct > 55 ? "#22c55e" : pct > 40 ? "#eab308" : "#ef4444") : "#6b6b80";
                return (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-text-muted">{label}</span>
                      <span className="text-[14px] font-bold tabular-nums" style={{ color: col }}>
                        {pct != null ? `${pct}%` : "—"}
                      </span>
                    </div>
                    <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: pct ? `${pct}%` : "0%", backgroundColor: col }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>

          {/* VIX proxy from indices */}
          <GlassCard className="p-4 slide-up">
            <div className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">Quick Stats</div>
            <div className="space-y-2.5">
              {[
                { label: "S&P 500",  idx: overview?.indices?.find(i => i.ticker === "SPY") },
                { label: "Nasdaq",   idx: overview?.indices?.find(i => i.ticker === "QQQ") },
                { label: "Russell",  idx: overview?.indices?.find(i => i.ticker === "IWM") },
              ].map(({ label, idx }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-[11px] text-text-muted">{label}</span>
                  <NumberTicker value={idx?.[period] != null ? idx[period] * 100 : null} suffix="%" decimals={2} />
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Sector leaders */}
          <GlassCard className="p-4 slide-up">
            <div className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">Top Sectors</div>
            <div className="space-y-2">
              {sortedSectors.slice(0, 3).map(s => (
                <div key={s.ticker} className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-text-muted truncate">{(s.sector || s.name).replace("Consumer ", "Cons. ").replace("Information ", "Info. ")}</span>
                  <span className={cn("text-[11px] font-bold tabular-nums shrink-0", s.change_1d >= 0 ? "text-positive" : "text-negative")}>
                    {fmtPct(s.change_1d, 1)}
                  </span>
                </div>
              ))}
              {sortedSectors.length > 3 && (
                <Link href="/rotation" className="text-[10px] text-text-muted hover:text-accent transition-colors flex items-center gap-0.5 mt-1">
                  All sectors <ChevronRight size={9} />
                </Link>
              )}
            </div>
          </GlassCard>
        </div>

        {/* Main grid: markets + sectors */}
        <div className="grid grid-cols-3 gap-4 mb-5">
          {/* Markets (2/3) */}
          <div className="col-span-2">
            <SectionHeader
              title="Markets"
              action={
                <div className="flex items-center gap-1 bg-surface rounded-full p-0.5 border border-border">
                  {PERIODS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => setPeriod(p.value)}
                      className={cn(
                        "px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all",
                        period === p.value ? "bg-accent text-white shadow-glow-sm" : "text-text-muted hover:text-text-primary"
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              }
            />
            {isLoading ? (
              <div className="grid grid-cols-4 gap-2">
                {Array(8).fill(0).map((_, i) => <SkeletonCard key={i} className="h-24" />)}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2 stagger">
                {overview?.indices.map(idx => (
                  <IndexCard
                    key={idx.ticker}
                    ticker={idx.ticker}
                    name={idx.name}
                    price={idx.price}
                    change={idx[period]}
                    onClick={() => setDrawer({ fetchUrl: `/api/chart/stock/${idx.ticker}`, color: "#6366f1" })}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Sectors (1/3) */}
          <div>
            <SectionHeader
              title="Sectors Today"
              action={
                <Link href="/rotation" className="text-[11px] text-accent flex items-center gap-0.5 hover:text-accent/80 transition-colors">
                  RRG <ChevronRight size={10} />
                </Link>
              }
            />
            <GlassCard className="px-3 py-1">
              {isLoading ? (
                <div className="space-y-3 py-2">
                  {Array(6).fill(0).map((_, i) => <div key={i} className="h-4 skeleton rounded" />)}
                </div>
              ) : (
                sortedSectors.map(s => (
                  <SectorBar
                    key={s.ticker}
                    name={(s.sector || s.name).replace("Consumer Discretionary","Cons. Disc.").replace("Consumer Staples","Cons. Staples").replace("Information Technology","Info. Tech.").replace("Communication Services","Comm. Services")}
                    chg={s.change_1d}
                    onClick={() => setDrawer({ fetchUrl: `/api/chart/stock/${s.ticker}`, color: "#6366f1" })}
                  />
                ))
              )}
            </GlassCard>
          </div>
        </div>

        {/* Quick links */}
        <SectionHeader title="Explore" subtitle="All intelligence modules" />
        <div className="grid grid-cols-8 gap-2 mb-2">
          {QUICK.map(({ href, label, icon, color }) => (
            <Link key={href} href={href}>
              <QuickLinkCard icon={icon} label={label} color={color} />
            </Link>
          ))}
        </div>
      </div>

      {/* ── Mobile layout ── */}
      <div className="md:hidden px-4 pt-3 space-y-5">

        {/* AI Insight (mobile) */}
        {insight && (
          <AIInsightBanner
            insight={insight.text}
            sentiment={insight.sentiment}
            confidence={insight.confidence}
          />
        )}

        {/* Regime banner (mobile) */}
        {regime && (
          <GlassCard
            className="p-4"
            glow={isBull ? "green" : isBear ? "red" : "accent"}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">Market Regime</div>
                {regimeLabel ? <RegimeBadge label={regimeLabel} /> : <div className="h-6 w-24 skeleton rounded" />}
                {regimeBias && <div className="text-[11px] text-text-muted mt-1.5">{regimeBias}</div>}
              </div>
              <Link href="/regime" className="text-[10px] text-text-muted flex items-center gap-0.5">
                Details <ChevronRight size={10} />
              </Link>
            </div>
            {regime?.recommendations && (
              <div className="mt-3 pt-3 border-t border-border flex gap-4 text-[10px]">
                <div>
                  <div className="text-text-faint mb-0.5">Best</div>
                  <div className="text-positive font-medium">{regime.recommendations.best_sectors?.slice(0,2).join(" · ") || "—"}</div>
                </div>
                <div>
                  <div className="text-text-faint mb-0.5">Avoid</div>
                  <div className="text-negative font-medium">{regime.recommendations.avoid_sectors?.slice(0,1)[0] || "—"}</div>
                </div>
              </div>
            )}
          </GlassCard>
        )}

        {/* Markets */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <SectionHeader title="Markets" className="mb-0" />
            <div className="flex items-center gap-1 bg-surface rounded-full p-0.5 border border-border">
              {PERIODS.map(p => (
                <button key={p.value} onClick={() => setPeriod(p.value)} className={cn(
                  "px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all",
                  period === p.value ? "bg-accent text-white" : "text-text-muted"
                )}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {isLoading ? (
            <div className="flex gap-3">
              {Array(4).fill(0).map((_, i) => <SkeletonCard key={i} className="min-w-[110px] h-24" />)}
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto snap-x-mandatory -mx-4 px-4 pb-1">
              {overview?.indices.map(idx => (
                <IndexCard
                  key={idx.ticker}
                  ticker={idx.ticker}
                  name={idx.name}
                  price={idx.price}
                  change={idx[period]}
                  onClick={() => setDrawer({ fetchUrl: `/api/chart/stock/${idx.ticker}`, color: "#6366f1" })}
                />
              ))}
            </div>
          )}
        </div>

        {/* Quick links (mobile) */}
        <div>
          <SectionHeader title="Explore" />
          <div className="grid grid-cols-4 gap-2">
            {QUICK.map(({ href, label, icon, color }) => (
              <Link key={href} href={href}>
                <QuickLinkCard icon={icon} label={label} color={color} />
              </Link>
            ))}
          </div>
        </div>

        {/* Sectors (mobile) */}
        {overview?.sectors && (
          <div>
            <SectionHeader
              title="Sectors Today"
              action={<Link href="/rotation" className="text-accent flex items-center gap-0.5 text-[11px]">Rotation <ChevronRight size={10} /></Link>}
            />
            <GlassCard className="px-3 py-1">
              {sortedSectors.map(s => (
                <SectorBar
                  key={s.ticker}
                  name={s.sector || s.name}
                  chg={s.change_1d}
                  onClick={() => setDrawer({ fetchUrl: `/api/chart/stock/${s.ticker}`, color: "#6366f1" })}
                />
              ))}
            </GlassCard>
          </div>
        )}

        {/* Breadth (mobile) */}
        {overview?.breadth && (
          <div>
            <SectionHeader
              title="Breadth"
              action={<Link href="/breadth" className="text-accent flex items-center gap-0.5 text-[11px]">Details <ChevronRight size={10} /></Link>}
            />
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Above 50-MA",  val: b50 },
                { label: "Above 200-MA", val: b200 },
              ].map(({ label, val }) => {
                const pct = val != null ? Math.round(val * 100) : null;
                const col = pct != null ? (pct > 55 ? "#22c55e" : pct > 40 ? "#eab308" : "#ef4444") : "#6b6b80";
                return (
                  <GlassCard key={label} className="p-4">
                    <div className="text-[10px] text-text-muted mb-1.5">{label}</div>
                    <div className="text-[24px] font-bold tabular-nums" style={{ color: col }}>
                      {pct != null ? pct : "—"}<span className="text-[14px] text-text-muted">%</span>
                    </div>
                    <div className="mt-2 h-1 bg-surface-2 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: pct ? `${pct}%` : "0%", backgroundColor: col }} />
                    </div>
                  </GlassCard>
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

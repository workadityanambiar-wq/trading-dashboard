"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type BreadthSectorRow } from "@/lib/api";
import { BreadthHistoryChart } from "@/components/charts/BreadthHistoryChart";
import { RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageGuide } from "@/components/PageGuide";

// ── Universe / lookback options ───────────────────────────────────────────────

const UNIVERSES = [
  { value: "sp500",   label: "S&P 500"  },
  { value: "sp1500",  label: "S&P 1500" },
  { value: "nifty50", label: "Nifty 50" },
  { value: "euro_top",label: "Europe"   },
];

const LOOKBACKS = [
  { value: 63,  label: "3M"  },
  { value: 126, label: "6M"  },
  { value: 252, label: "1Y"  },
  { value: 504, label: "2Y"  },
];

// ── Color helpers ─────────────────────────────────────────────────────────────

function breadthColor(pct: number): string {
  if (pct >= 0.70) return "#22c55e";
  if (pct >= 0.55) return "#84cc16";
  if (pct >= 0.40) return "#eab308";
  if (pct >= 0.25) return "#f97316";
  return "#ef4444";
}

function breadthLabel(pct: number): string {
  if (pct >= 0.70) return "Strong";
  if (pct >= 0.55) return "Healthy";
  if (pct >= 0.40) return "Neutral";
  if (pct >= 0.25) return "Weak";
  return "Bearish";
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, subtext, color, bar,
}: {
  label: string; value: string; subtext?: string; color: string; bar?: number;
}) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4 space-y-2">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="text-2xl font-semibold font-mono" style={{ color }}>
        {value}
      </div>
      {bar != null && (
        <div className="h-1.5 rounded-full bg-surface-2">
          <div
            className="h-1.5 rounded-full transition-all"
            style={{ width: `${Math.round(bar * 100)}%`, backgroundColor: color }}
          />
        </div>
      )}
      {subtext && <div className="text-xs text-text-muted">{subtext}</div>}
    </div>
  );
}

// ── Sector bar row ────────────────────────────────────────────────────────────

function SectorRow({ row }: { row: BreadthSectorRow }) {
  const pct50  = row.above_50ma;
  const pct200 = row.above_200ma;
  const col50  = breadthColor(pct50);
  const col200 = breadthColor(pct200);

  return (
    <div className="grid grid-cols-[1fr_80px_80px_60px] gap-2 items-center py-2 border-b border-border last:border-0">
      <span className="text-xs text-text-primary truncate">{row.sector}</span>
      {/* 50MA bar */}
      <div className="flex items-center gap-1.5">
        <div className="flex-1 h-1.5 rounded-full bg-surface-2">
          <div className="h-1.5 rounded-full" style={{ width: `${pct50 * 100}%`, backgroundColor: col50 }} />
        </div>
        <span className="text-xs font-mono w-8 text-right" style={{ color: col50 }}>
          {Math.round(pct50 * 100)}%
        </span>
      </div>
      {/* 200MA bar */}
      <div className="flex items-center gap-1.5">
        <div className="flex-1 h-1.5 rounded-full bg-surface-2">
          <div className="h-1.5 rounded-full" style={{ width: `${pct200 * 100}%`, backgroundColor: col200 }} />
        </div>
        <span className="text-xs font-mono w-8 text-right" style={{ color: col200 }}>
          {Math.round(pct200 * 100)}%
        </span>
      </div>
      <span className="text-xs text-text-muted text-right">{row.count}</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BreadthPage() {
  const [universe,     setUniverse]     = useState("sp500");
  const [lookbackDays, setLookbackDays] = useState(126);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey:      ["breadth", universe, lookbackDays],
    queryFn:       () => api.getBreadth({ universe, lookback_days: lookbackDays }),
    staleTime:     5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  const snap = data?.snapshot;

  const adv4w     = snap?.advancing_4w ?? 0.5;
  const advColor  = adv4w >= 0.55 ? "#22c55e" : adv4w >= 0.45 ? "#eab308" : "#ef4444";
  const AdvIcon   = adv4w >= 0.55 ? TrendingUp : adv4w >= 0.45 ? Minus : TrendingDown;

  return (
    <div className="space-y-5 max-w-screen-2xl">
      <PageGuide
        title="Market Breadth — Guide"
        subtitle="Participation analysis showing how broadly the rally or decline is distributed"
        steps={[
          { title: "Select a Universe", detail: "Choose S&P 500, S&P 1500, Nifty 50, or Europe to analyze breadth within that index. S&P 500 is the most commonly watched by institutional traders." },
          { title: "Pick a Lookback Period", detail: "The lookback (3M, 6M, 1Y, 2Y) controls how far back the history chart shows. The primary breadth readings (% above 50/200 MA) are always current-day values." },
          { title: "Read the Breadth Tiles", detail: "The metric tiles show % Above 50-MA, % Above 200-MA, and % at 52-week Highs. Above 70% = strong broad participation; below 30% = narrow or declining market." },
          { title: "View the History Chart", detail: "The line chart shows how breadth has evolved over the selected lookback period. Look for divergences where the price index makes new highs but breadth fails to confirm." },
          { title: "Check Sector Breadth Breakdown", detail: "The sector breakdown shows which sectors have the highest and lowest internal breadth. A narrow rally concentrated in 1-2 sectors is less sustainable than a broad one." },
        ]}
        howItWorks={[
          { title: "Moving Average Calculation", detail: "For each stock in the universe, the backend checks whether its current price is above its 50-day and 200-day simple moving average. The ratio of stocks above each MA is reported as a percentage." },
          { title: "52-Week High/Low Tracking", detail: "The backend scans all tickers for new 52-week highs and lows daily and computes the net new high ratio (highs minus lows, divided by total stocks)." },
          { title: "Historical Storage", detail: "Daily breadth readings are stored in DuckDB and used to populate the history chart. This allows you to see breadth trends and cycles going back 2 years." },
          { title: "Sector Breakdown", detail: "Stocks are categorized into GICS sectors. Breadth is computed independently for each sector to identify where participation is strongest and weakest within the universe." },
        ]}
        tips={[
          "Breadth divergence (price up, breadth flat or down) is one of the most reliable leading indicators of a market top.",
          "Watch for 'breadth thrusts' where % above 50-MA jumps from below 40% to above 70% in 2 weeks — historically a very bullish signal.",
          "S&P 500 breadth above 80% can't be sustained long-term and typically marks an overbought condition.",
        ]}
      />
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-base font-semibold">Market Breadth</h1>
          <p className="text-xs text-text-muted mt-0.5">
            {data ? `${data.n_stocks} stocks · as of ${data.as_of ?? "—"}` : "Loading universe…"}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Universe */}
          <div className="flex gap-1">
            {UNIVERSES.map(({ value, label }) => (
              <button key={value} onClick={() => setUniverse(value)}
                className={cn(
                  "px-2.5 py-1.5 rounded text-xs transition-colors",
                  universe === value
                    ? "bg-accent text-white"
                    : "bg-surface-2 border border-border text-text-muted hover:text-text-primary"
                )}
              >{label}</button>
            ))}
          </div>

          {/* Lookback */}
          <div className="flex gap-1">
            {LOOKBACKS.map(({ value, label }) => (
              <button key={value} onClick={() => setLookbackDays(value)}
                className={cn(
                  "px-2.5 py-1.5 rounded text-xs transition-colors w-10",
                  lookbackDays === value
                    ? "bg-accent text-white"
                    : "bg-surface-2 border border-border text-text-muted hover:text-text-primary"
                )}
              >{label}</button>
            ))}
          </div>

          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-1.5 rounded bg-surface-2 border border-border text-text-muted hover:text-text-primary disabled:opacity-50"
          >
            <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20 text-text-muted text-sm gap-2">
          <RefreshCw size={14} className="animate-spin" />
          Computing breadth…
        </div>
      )}

      {data && snap && (
        <>
          {/* Snapshot cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard
              label="Above 20-day MA"
              value={`${Math.round(snap.pct_above_20ma * 100)}%`}
              subtext={breadthLabel(snap.pct_above_20ma)}
              color={breadthColor(snap.pct_above_20ma)}
              bar={snap.pct_above_20ma}
            />
            <StatCard
              label="Above 50-day MA"
              value={`${Math.round(snap.pct_above_50ma * 100)}%`}
              subtext={breadthLabel(snap.pct_above_50ma)}
              color={breadthColor(snap.pct_above_50ma)}
              bar={snap.pct_above_50ma}
            />
            <StatCard
              label="Above 200-day MA"
              value={`${Math.round(snap.pct_above_200ma * 100)}%`}
              subtext={breadthLabel(snap.pct_above_200ma)}
              color={breadthColor(snap.pct_above_200ma)}
              bar={snap.pct_above_200ma}
            />
            <StatCard
              label="Near 52W High"
              value={`${Math.round(snap.pct_52w_high * 100)}%`}
              subtext="Within 2% of high"
              color={breadthColor(snap.pct_52w_high * 2.5)}
              bar={snap.pct_52w_high}
            />
            <StatCard
              label="Near 52W Low"
              value={`${Math.round(snap.pct_52w_low * 100)}%`}
              subtext="Within 2% of low"
              color={snap.pct_52w_low > 0.10 ? "#ef4444" : snap.pct_52w_low > 0.05 ? "#f97316" : "#22c55e"}
            />
            <div className="bg-surface border border-border rounded-lg p-4 space-y-2">
              <div className="text-xs text-text-muted">Advancing (4W)</div>
              <div className="text-2xl font-semibold font-mono flex items-center gap-2" style={{ color: advColor }}>
                <AdvIcon size={18} strokeWidth={2} />
                {Math.round(adv4w * 100)}%
              </div>
              <div className="text-xs text-text-muted">
                Net new highs: {snap.net_new_highs > 0 ? "+" : ""}{snap.net_new_highs}
              </div>
            </div>
          </div>

          {/* History chart */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="text-sm font-medium mb-1">Breadth History</div>
            <div className="text-xs text-text-muted mb-4">
              % of stocks trading above their moving averages
            </div>
            {data.history.length > 0 ? (
              <BreadthHistoryChart data={data.history} height={260} />
            ) : (
              <div className="flex items-center justify-center h-40 text-text-muted text-xs">
                Insufficient price history cached for this universe
              </div>
            )}
          </div>

          {/* Sector breadth */}
          {data.sector_breadth.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="text-sm font-medium mb-1">Sector Breadth</div>
              <div className="text-xs text-text-muted mb-4">
                Per-sector % above 50-day and 200-day MA
              </div>
              <div className="grid grid-cols-[1fr_80px_80px_60px] gap-2 pb-2 mb-1 border-b border-border text-xs text-text-muted">
                <span>Sector</span>
                <span className="text-right">Above 50MA</span>
                <span className="text-right">Above 200MA</span>
                <span className="text-right">N</span>
              </div>
              {data.sector_breadth
                .slice()
                .sort((a, b) => b.above_50ma - a.above_50ma)
                .map((row) => (
                  <SectorRow key={row.sector} row={row} />
                ))}
            </div>
          )}

          {/* No sector data note */}
          {data.sector_breadth.length === 0 && (
            <div className="text-xs text-text-muted text-center py-4">
              Sector breakdown not available for this universe
            </div>
          )}
        </>
      )}
    </div>
  );
}

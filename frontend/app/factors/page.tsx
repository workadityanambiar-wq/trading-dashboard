"use client";
import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, FACTOR_OPTIONS, type ICStats } from "@/lib/api";
import { FactorICChart } from "@/components/charts/FactorICChart";
import { QuintileReturns } from "@/components/charts/QuintileReturns";
import { RefreshCw, Plus, X, ChevronDown, Clock, Database } from "lucide-react";
import { cn, formatPct } from "@/lib/utils";

// ── Universe selector ─────────────────────────────────────────────────────────

type UniversePreset = "sp500" | "sp1500" | "all_cached" | "custom";

const UNIVERSE_OPTIONS = [
  { value: "sp500"      as UniversePreset, label: "S&P 500",    description: "503 large-cap US stocks" },
  { value: "sp1500"     as UniversePreset, label: "S&P 1500",   description: "500 + 400 mid + 600 small" },
  { value: "all_cached" as UniversePreset, label: "All Cached", description: "Every ticker with price history" },
  { value: "custom"     as UniversePreset, label: "Custom",     description: "Pick your own tickers" },
];

const PRICE_FACTORS  = FACTOR_OPTIONS.filter((f) => f.icHistory);
const FUND_FACTORS   = FACTOR_OPTIONS.filter((f) => !f.icHistory);

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, description }: { label: string; value: string | null; description: string }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <div className="text-xs text-text-muted mb-1">{label}</div>
      <div className="text-lg font-semibold text-text-primary">
        {value ?? <span className="text-text-muted text-sm">—</span>}
      </div>
      <div className="text-xs text-text-muted mt-1">{description}</div>
    </div>
  );
}

function UniverseDropdown({ value, onChange }: { value: UniversePreset; onChange: (v: UniversePreset) => void }) {
  const [open, setOpen] = useState(false);
  const selected = UNIVERSE_OPTIONS.find((o) => o.value === value)!;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded border border-border bg-surface text-xs text-text-primary hover:border-accent transition-colors"
      >
        {selected.label}
        <ChevronDown size={11} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-56 rounded-lg border border-border bg-surface shadow-xl">
          {UNIVERSE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={cn(
                "w-full text-left px-3 py-2.5 text-xs hover:bg-surface-2 transition-colors first:rounded-t-lg last:rounded-b-lg",
                opt.value === value ? "text-accent" : "text-text-primary"
              )}
            >
              <div className="font-medium">{opt.label}</div>
              <div className="text-text-muted mt-0.5">{opt.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomTickerInput({ tickers, onChange }: { tickers: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  function add() {
    const tokens = input.toUpperCase().trim().split(/[\s,;]+/).filter(Boolean);
    onChange(Array.from(new Set([...tickers, ...tokens])));
    setInput("");
    ref.current?.focus();
  }
  return (
    <div className="rounded-lg border border-border bg-surface p-3 space-y-2">
      <div className="text-xs text-text-muted font-medium">Custom Tickers</div>
      <div className="flex gap-2">
        <input
          ref={ref}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="AAPL MSFT GOOGL…"
          className="flex-1 bg-background border border-border rounded px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
        <button
          onClick={add}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-border bg-surface-2 text-xs text-text-muted hover:text-accent hover:border-accent transition-colors"
        >
          <Plus size={11} /> Add
        </button>
      </div>
      {tickers.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
          {tickers.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-2 border border-border text-xs font-mono text-text-primary">
              {t}
              <button onClick={() => onChange(tickers.filter((x) => x !== t))} className="text-text-muted hover:text-red-400">
                <X size={9} />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <div className="text-xs text-text-muted/50 italic">No tickers added yet</div>
      )}
    </div>
  );
}

function NoHistoryCard({ factor }: { factor: string }) {
  const label = FACTOR_OPTIONS.find((f) => f.value === factor)?.label ?? factor;
  return (
    <div className="rounded-lg border border-border bg-surface p-8 flex flex-col items-center gap-3 text-center">
      <Database size={28} strokeWidth={1} className="text-text-muted/50" />
      <div className="text-sm font-medium text-text-primary">{label}</div>
      <div className="text-xs text-text-muted max-w-sm">
        IC history requires time-series fundamental snapshots. This factor shows current
        cross-sectional scores in the Screener. Fetch fundamentals via the Screener page
        to populate value, quality, profitability, and sentiment scores.
      </div>
      <div className="flex items-center gap-1.5 text-xs text-yellow-500/80 mt-1">
        <Clock size={11} />
        Screener → "Fundamentals" button fetches latest data
      </div>
    </div>
  );
}

// ── Factor tab groups ─────────────────────────────────────────────────────────

function FactorTabs({ selected, onChange }: { selected: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      {/* Price-based group */}
      <div>
        <div className="text-[10px] text-text-muted/60 font-medium uppercase tracking-wider px-1 mb-1">
          Price-based · full IC history
        </div>
        <div className="flex flex-wrap gap-1">
          {PRICE_FACTORS.map((f) => (
            <button
              key={f.value}
              onClick={() => onChange(f.value)}
              className={cn(
                "px-2.5 py-1.5 rounded text-xs transition-colors",
                selected === f.value
                  ? "bg-accent text-white"
                  : "bg-surface border border-border text-text-muted hover:text-text-primary"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {/* Fundamental group */}
      <div>
        <div className="text-[10px] text-text-muted/60 font-medium uppercase tracking-wider px-1 mb-1">
          Fundamental · latest scores only
        </div>
        <div className="flex flex-wrap gap-1">
          {FUND_FACTORS.map((f) => (
            <button
              key={f.value}
              onClick={() => onChange(f.value)}
              className={cn(
                "px-2.5 py-1.5 rounded text-xs transition-colors",
                selected === f.value
                  ? "bg-accent/80 text-white"
                  : "bg-surface border border-border border-dashed text-text-muted hover:text-text-primary"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FactorsPage() {
  const [factor, setFactor]           = useState("momentum_12_1");
  const [universePreset, setUniverse] = useState<UniversePreset>("sp500");
  const [customTickers, setCustom]    = useState<string[]>([]);

  const universeParam = useMemo(() => {
    return universePreset === "custom" ? customTickers.join(",") : universePreset;
  }, [universePreset, customTickers]);

  const ready = universePreset !== "custom" || customTickers.length >= 10;
  const selectedMeta = FACTOR_OPTIONS.find((f) => f.value === factor)!;
  const hasPriceHistory = selectedMeta?.icHistory ?? false;

  const { data: icData, isLoading: icLoading } = useQuery({
    queryKey: ["ic", factor, universeParam],
    queryFn: () => api.getIC(factor, 21, universeParam),
    staleTime: 5 * 60 * 1000,
    enabled: ready && hasPriceHistory,
  });

  const { data: qData, isLoading: qLoading } = useQuery({
    queryKey: ["quintiles", factor, universeParam],
    queryFn: () => api.getQuintiles(factor, universeParam),
    staleTime: 5 * 60 * 1000,
    enabled: ready && hasPriceHistory,
  });

  const stats: ICStats | undefined = icData?.stats;

  return (
    <div className="space-y-5 max-w-screen-xl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-base font-semibold">Factor Explorer</h1>
          <p className="text-xs text-text-muted mt-0.5">
            IC, quintile spreads, and signal quality across 11 factors
          </p>
        </div>
        <UniverseDropdown value={universePreset} onChange={setUniverse} />
      </div>

      {/* Factor tabs */}
      <FactorTabs selected={factor} onChange={setFactor} />

      {/* Custom ticker input */}
      {universePreset === "custom" && (
        <CustomTickerInput tickers={customTickers} onChange={setCustom} />
      )}
      {universePreset === "custom" && customTickers.length < 10 && (
        <div className="text-xs text-yellow-500/80 flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-500" />
          Add at least 10 tickers for meaningful z-scores ({customTickers.length}/10)
        </div>
      )}

      {/* Stats row — only for price-based factors */}
      {hasPriceHistory && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Mean IC"
            value={stats?.mean_ic != null ? `${stats.mean_ic >= 0 ? "+" : ""}${stats.mean_ic.toFixed(3)}` : null}
            description="Avg monthly Spearman(score, fwd return)"
          />
          <StatCard
            label="ICIR"
            value={stats?.icir != null ? stats.icir.toFixed(2) : null}
            description="IC / std(IC) — signal-to-noise"
          />
          <StatCard
            label="% Positive IC"
            value={stats?.pct_positive != null ? formatPct(stats.pct_positive, 1) : null}
            description="Fraction of months with positive IC"
          />
          <StatCard
            label="Observations"
            value={stats?.n_obs != null ? String(stats.n_obs) : null}
            description="Monthly IC measurements"
          />
        </div>
      )}

      {/* Content area */}
      {!hasPriceHistory ? (
        <NoHistoryCard factor={factor} />
      ) : !ready ? (
        <div className="rounded-lg border border-border bg-surface p-12 text-center text-sm text-text-muted">
          Add 10+ tickers to compute IC
        </div>
      ) : (
        <>
          {/* IC chart */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-medium">Information Coefficient</div>
                <div className="text-xs text-text-muted mt-0.5">
                  Monthly Spearman(score, 21-day fwd return) · 3M rolling avg
                </div>
              </div>
              {icLoading && <RefreshCw size={13} className="animate-spin text-text-muted" />}
            </div>
            {icData?.series?.length ? (
              <FactorICChart data={icData.series} height={260} />
            ) : (
              <div className="h-64 flex items-center justify-center text-text-muted text-sm">
                {icLoading ? "Computing IC…" : "No data — price history may still be loading"}
              </div>
            )}
          </div>

          {/* Quintile chart */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-medium">Quintile Cumulative Returns</div>
                <div className="text-xs text-text-muted mt-0.5">
                  Equal-weight, monthly rebalanced · Q5 = top 20% by factor score
                </div>
              </div>
              {qLoading && <RefreshCw size={13} className="animate-spin text-text-muted" />}
            </div>
            {qData?.series?.length ? (
              <QuintileReturns data={qData.series} height={300} />
            ) : (
              <div className="h-72 flex items-center justify-center text-text-muted text-sm">
                {qLoading ? "Computing quintile returns…" : "No data"}
              </div>
            )}
            {qData?.series?.length ? (
              <div className="mt-3 flex gap-4 text-xs text-text-muted">
                <span><span className="text-green-400">Q5</span> = highest factor score (long)</span>
                <span><span className="text-red-400">Q1</span> = lowest factor score (short)</span>
                <span>No transaction costs applied</span>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

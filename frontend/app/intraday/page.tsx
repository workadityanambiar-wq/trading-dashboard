"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  api,
  type TechnicalSignal,
  type TechnicalSignalsParams,
} from "@/lib/api";
import { ThemeSelector } from "@/components/ThemeSelector";
import {
  RefreshCw,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Plus,
  X,
  Search,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmt(v: unknown, dec = 2): string {
  if (typeof v !== "number" || isNaN(v)) return "—";
  return v.toFixed(dec);
}
function fmtPct(v: unknown): string {
  if (typeof v !== "number" || isNaN(v)) return "—";
  return (v >= 0 ? "+" : "") + (v * 100).toFixed(2) + "%";
}
function fmtPrice(v: unknown): string {
  if (typeof v !== "number" || isNaN(v)) return "—";
  return `$${v.toFixed(2)}`;
}
function fmtMult(v: unknown): string {
  if (typeof v !== "number" || isNaN(v)) return "—";
  return v.toFixed(1) + "×";
}
function fmtPivotLevel(v: unknown): string {
  if (v == null || String(v) === "null" || String(v) === "undefined") return "—";
  return String(v).toUpperCase();
}

// ── Color helpers (all accept unknown for type safety) ────────────────────────

function clrPct(v: unknown): string {
  if (typeof v !== "number" || isNaN(v)) return "text-text-muted";
  if (v > 0.03)  return "text-green-400";
  if (v > 0)     return "text-green-300/70";
  if (v < -0.03) return "text-red-400";
  return "text-red-300/70";
}
function clrRsi(v: unknown): string {
  if (typeof v !== "number" || isNaN(v)) return "text-text-muted";
  if (v >= 70) return "text-red-400";
  if (v >= 58) return "text-yellow-400/80";
  if (v <= 30) return "text-blue-400";
  if (v <= 42) return "text-green-400/80";
  return "text-text-muted";
}
function clrMacd(v: unknown): string {
  if (typeof v !== "number" || isNaN(v)) return "text-text-muted";
  return v > 0 ? "text-green-400" : "text-red-400";
}
function clrScore(v: unknown): string {
  if (typeof v !== "number" || isNaN(v)) return "text-text-muted";
  if (v >= 1.0)  return "text-green-400 font-semibold";
  if (v >= 0.4)  return "text-green-300/80";
  if (v <= -1.0) return "text-red-400 font-semibold";
  if (v <= -0.4) return "text-red-300/80";
  return "text-text-muted";
}
function clrVol(v: unknown): string {
  if (typeof v !== "number" || isNaN(v)) return "text-text-muted";
  if (v >= 3)   return "text-yellow-400";
  if (v >= 1.5) return "text-yellow-300/60";
  return "text-text-muted";
}
function clrPivotDist(v: unknown): string {
  if (typeof v !== "number" || isNaN(v)) return "text-text-muted";
  const a = Math.abs(v);
  // Highlight stocks in the 1-3% pivot zone
  if (a >= 0.01 && a <= 0.03) return "text-yellow-400 font-semibold";
  return clrPct(v);
}
function clrPivotLevel(v: unknown): string {
  const s = String(v ?? "").toLowerCase();
  if (s.startsWith("r"))  return "text-red-400/80 font-mono";
  if (s.startsWith("s"))  return "text-green-400/80 font-mono";
  if (s === "pp")         return "text-yellow-400/80 font-mono";
  return "text-text-muted font-mono";
}

// ── Column definitions ────────────────────────────────────────────────────────

interface ColDef {
  key: string;
  label: string;
  title: string;
  fmtFn: (v: unknown) => string;
  clrFn: (v: unknown) => string;
}

const COLUMNS: ColDef[] = [
  { key: "ticker",         label: "Ticker",   title: "Ticker symbol",                                                                fmtFn: String,       clrFn: () => "text-text-primary font-mono font-medium" },
  { key: "price",          label: "Price",    title: "Last close price",                                                             fmtFn: fmtPrice,     clrFn: () => "text-text-primary" },
  { key: "chg_1d",         label: "1D%",      title: "1-day return",                                                                 fmtFn: fmtPct,       clrFn: clrPct },
  { key: "rsi",            label: "RSI",      title: "14-day RSI. >70 overbought, <30 oversold",                                    fmtFn: (v) => fmt(v, 1),  clrFn: clrRsi },
  { key: "macd_hist",      label: "MACD",     title: "MACD histogram (MACD line − signal). Positive = bullish",                     fmtFn: (v) => fmt(v, 3),  clrFn: clrMacd },
  { key: "bb_pct_b",       label: "BB%B",     title: "%B = (price − lower band) / bandwidth. >1 above upper band, <0 below lower",  fmtFn: (v) => fmt(v, 2),  clrFn: clrPct },
  { key: "ma50_dist",      label: "MA50%",    title: "(price / 50-day MA) − 1. Positive = above moving average",                    fmtFn: fmtPct,       clrFn: clrPct },
  { key: "ma200_dist",     label: "MA200%",   title: "(price / 200-day MA) − 1",                                                    fmtFn: fmtPct,       clrFn: clrPct },
  { key: "rs_spy_20d",     label: "RS 20d",   title: "Excess return vs SPY over 20 trading days. Positive = outperforming market",  fmtFn: fmtPct,       clrFn: clrPct },
  { key: "rs_spy_5d",      label: "RS 5d",    title: "Excess return vs SPY over 5 trading days",                                    fmtFn: fmtPct,       clrFn: clrPct },
  { key: "vol_surge",      label: "Vol×",     title: "Today's volume / 20-day average volume. >1 = above-average",                 fmtFn: fmtMult,      clrFn: clrVol },
  { key: "atr_ratio",      label: "ATR%",     title: "Average True Range / price — normalized daily range (volatility proxy)",      fmtFn: fmtPct,       clrFn: () => "text-text-muted" },
  { key: "overnight_gap",  label: "Gap",      title: "Open[t] / Close[t-1] − 1: overnight price gap",                               fmtFn: fmtPct,       clrFn: clrPct },
  { key: "rev_5d",         label: "Rev5d",    title: "Negative of 5-day return — contrarian mean-reversion signal",                fmtFn: fmtPct,       clrFn: clrPct },
  { key: "nearest_pivot",  label: "Pivot",    title: "Nearest monthly pivot level (PP = pivot point, R1-R3 = resistance, S1-S3 = support)", fmtFn: fmtPivotLevel, clrFn: clrPivotLevel },
  { key: "pivot_dist",     label: "Pvt Dist", title: "Distance from nearest monthly pivot: (price/level)−1. Highlighted yellow when 1–3% away (actionable zone)", fmtFn: fmtPct, clrFn: clrPivotDist },
  { key: "momentum_score", label: "Score",    title: "Composite momentum z-score: RS vs SPY, MA position, MACD histogram, volume surge (higher = stronger bullish momentum)", fmtFn: (v) => fmt(v, 2), clrFn: clrScore },
];

// ── Custom ticker input ───────────────────────────────────────────────────────

function CustomTickerInput({
  tickers,
  onChange,
}: {
  tickers: string[];
  onChange: (t: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  function add() {
    const tokens = input.toUpperCase().trim().split(/[\s,;]+/).filter(Boolean);
    onChange(Array.from(new Set<string>([...tickers, ...tokens])));
    setInput("");
    ref.current?.focus();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          ref={ref}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="AAPL MSFT GOOGL…"
          className="flex-1 max-w-xs bg-surface border border-border rounded px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
        <button
          onClick={add}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-border bg-surface-2 text-xs text-text-muted hover:text-accent hover:border-accent transition-colors"
        >
          <Plus size={11} /> Add
        </button>
      </div>
      {tickers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
          {tickers.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-2 border border-border text-xs font-mono text-text-primary"
            >
              {t}
              <button
                onClick={() => onChange(tickers.filter((x) => x !== t))}
                className="text-text-muted hover:text-red-400"
              >
                <X size={9} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sortable column header ────────────────────────────────────────────────────

function SortTh({
  col,
  sortBy,
  desc,
  onSort,
}: {
  col: ColDef;
  sortBy: string;
  desc: boolean;
  onSort: (key: string) => void;
}) {
  const active = sortBy === col.key;
  return (
    <th
      className="px-2 py-2 text-left text-[10px] font-medium uppercase tracking-wider cursor-pointer select-none whitespace-nowrap group"
      onClick={() => onSort(col.key)}
      title={col.title}
    >
      <div className="flex items-center gap-1">
        <span className={cn(active ? "text-accent" : "text-text-muted group-hover:text-text-primary transition-colors")}>
          {col.label}
        </span>
        {active ? (
          desc ? <ArrowDown size={10} className="text-accent" /> : <ArrowUp size={10} className="text-accent" />
        ) : (
          <ArrowUpDown size={9} className="text-text-muted/30 group-hover:text-text-muted transition-colors" />
        )}
      </div>
    </th>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Mode = "sp500" | "sp1500" | "themes" | "custom";

const MODE_LABELS: Record<Mode, string> = {
  sp500: "S&P 500",
  sp1500: "S&P 1500",
  themes: "Themes",
  custom: "Custom",
};

export default function IntradayPage() {
  const [mode, setMode]                       = useState<Mode>("sp500");
  const [selectedTheme, setSelectedTheme]     = useState("ai_infra");
  const [selectedSegment, setSelectedSegment] = useState("");
  const [customTickers, setCustomTickers]     = useState<string[]>([]);
  const [search, setSearch]                   = useState("");
  const [dSearch, setDSearch]                 = useState("");
  const [sortBy, setSortBy]                   = useState("momentum_score");
  const [desc, setDesc]                       = useState(true);
  const [page, setPage]                       = useState(1);
  const [nearPivot, setNearPivot]             = useState(false);
  const [pivotMin, setPivotMin]               = useState(0.01);
  const [pivotMax, setPivotMax]               = useState(0.03);
  const PAGE_SIZE = 100;

  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    clearTimeout((handleSearch as unknown as { _t?: ReturnType<typeof setTimeout> })._t);
    (handleSearch as unknown as { _t?: ReturnType<typeof setTimeout> })._t = setTimeout(() => {
      setDSearch(val);
      setPage(1);
    }, 350);
  }, []);

  function handleSort(key: string) {
    if (sortBy === key) setDesc((d) => !d);
    else { setSortBy(key); setDesc(true); }
    setPage(1);
  }

  function changeMode(m: Mode) {
    setMode(m);
    setPage(1);
  }

  const { data: themesData } = useQuery({
    queryKey: ["themes"],
    queryFn: () => api.getThemes(),
    staleTime: Infinity,
  });
  const themes = themesData?.themes ?? [];

  const params = useMemo((): TechnicalSignalsParams => {
    const base: TechnicalSignalsParams = {
      sort_by: sortBy,
      desc,
      page,
      page_size: PAGE_SIZE,
    };
    if (dSearch)    base.search     = dSearch;
    if (nearPivot)  { base.near_pivot = true; base.pivot_min = pivotMin; base.pivot_max = pivotMax; }
    if (mode === "themes") {
      base.theme = selectedTheme;
      if (selectedSegment) base.segment = selectedSegment;
      return base;
    }
    if (mode === "custom") {
      base.universe = customTickers.length > 0 ? customTickers.join(",") : "sp500";
      return base;
    }
    base.universe = mode;
    return base;
  }, [mode, selectedTheme, selectedSegment, customTickers, sortBy, desc, page, dSearch, nearPivot, pivotMin, pivotMax]);

  const ready = mode !== "custom" || customTickers.length > 0;

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["technical-signals", params],
    queryFn: () => api.getTechnicalSignals(params),
    staleTime: 3 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    enabled: ready,
  });

  const total      = data?.total ?? 0;
  const totalPages = data?.pages ?? 1;

  return (
    <div className="space-y-4 max-w-screen-2xl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">Short-Term Signals</h1>
          <p className="text-xs text-text-muted mt-0.5">
            RSI · MACD · Bollinger %B · RS vs SPY · Volume surge · Monthly pivots · Composite score
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data?.as_of && (
            <span className="text-xs text-text-muted">As of {data.as_of}</span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Mode pills */}
          <div className="flex rounded-lg border border-border overflow-hidden text-xs">
            {(Object.keys(MODE_LABELS) as Mode[]).map((m, i) => (
              <button
                key={m}
                onClick={() => changeMode(m)}
                className={cn(
                  "px-3 py-1.5 transition-colors",
                  i > 0 && "border-l border-border",
                  mode === m
                    ? "bg-accent text-white"
                    : "bg-surface text-text-muted hover:text-text-primary"
                )}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>

          {/* Near Pivot filter */}
          <button
            onClick={() => { setNearPivot((v) => !v); setPage(1); }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs transition-colors",
              nearPivot
                ? "bg-yellow-500/15 border-yellow-500/50 text-yellow-400"
                : "bg-surface border-border text-text-muted hover:text-text-primary"
            )}
            title="Show only stocks within 1–3% of their nearest monthly pivot point"
          >
            <Target size={11} />
            Near Pivot
            {nearPivot && (
              <span className="text-[10px] opacity-70 ml-0.5">
                {Math.round(pivotMin * 100)}–{Math.round(pivotMax * 100)}%
              </span>
            )}
          </button>

          {/* Pivot range inputs — shown only when filter is active */}
          {nearPivot && (
            <div className="flex items-center gap-1.5 text-xs text-text-muted">
              <span>Range:</span>
              <input
                type="number"
                value={Math.round(pivotMin * 100)}
                min={0}
                max={10}
                onChange={(e) => { setPivotMin(Number(e.target.value) / 100); setPage(1); }}
                className="w-10 bg-surface border border-border rounded px-1.5 py-1 text-center text-text-primary focus:outline-none focus:border-accent"
              />
              <span>–</span>
              <input
                type="number"
                value={Math.round(pivotMax * 100)}
                min={0}
                max={20}
                onChange={(e) => { setPivotMax(Number(e.target.value) / 100); setPage(1); }}
                className="w-10 bg-surface border border-border rounded px-1.5 py-1 text-center text-text-primary focus:outline-none focus:border-accent"
              />
              <span>%</span>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Filter ticker…"
              className="bg-surface border border-border rounded pl-7 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent w-36"
            />
          </div>

          {total > 0 && (
            <span className="text-xs text-text-muted ml-auto">
              {total} ticker{total !== 1 ? "s" : ""}
              {nearPivot && <span className="text-yellow-400/80 ml-1">· near pivot</span>}
            </span>
          )}
        </div>

        {/* Theme selector */}
        {mode === "themes" && themes.length > 0 && (
          <ThemeSelector
            themes={themes}
            selectedTheme={selectedTheme}
            selectedSegment={selectedSegment}
            onSelectTheme={(id) => { setSelectedTheme(id); setPage(1); }}
            onSelectSegment={(id) => { setSelectedSegment(id); setPage(1); }}
          />
        )}

        {/* Custom input */}
        {mode === "custom" && (
          <div className="rounded-lg border border-border bg-surface p-3 space-y-2">
            <div className="text-xs text-text-muted font-medium">Custom Tickers</div>
            <CustomTickerInput
              tickers={customTickers}
              onChange={(t) => { setCustomTickers(t); setPage(1); }}
            />
            {customTickers.length > 0 && customTickers.length < 3 && (
              <div className="text-xs text-yellow-500/80">
                Add at least 3 tickers for a composite score
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-text-muted border border-border bg-surface rounded px-3 py-2">
        <span>
          <span className="text-red-400">RSI&gt;70</span> overbought ·{" "}
          <span className="text-blue-400">RSI&lt;30</span> oversold
        </span>
        <span>
          <span className="text-green-400">+Score</span> bullish ·{" "}
          <span className="text-red-400">−Score</span> bearish
        </span>
        <span>
          Pivot: <span className="text-red-400/80 font-mono">R1-R3</span> resistance ·{" "}
          <span className="text-green-400/80 font-mono">S1-S3</span> support ·{" "}
          <span className="text-yellow-400/80 font-mono">PP</span> pivot ·{" "}
          <span className="text-yellow-400">yellow dist</span> = 1–3% zone
        </span>
        <span className="ml-auto opacity-60">Hover headers for definitions</span>
      </div>

      {/* ── Loading ── */}
      {isLoading && (
        <div className="flex items-center gap-2 text-text-muted text-sm py-12 justify-center">
          <RefreshCw size={14} className="animate-spin" />
          Computing signals…
        </div>
      )}

      {/* ── API message ── */}
      {!isLoading && data?.message && (
        <div className="rounded border border-border bg-surface p-4 text-xs text-text-muted text-center">
          {data.message}
        </div>
      )}

      {/* ── Near pivot empty state ── */}
      {nearPivot && !isLoading && data?.results?.length === 0 && (
        <div className="py-10 text-center space-y-1">
          <div className="text-sm text-text-muted">No stocks within {Math.round(pivotMin * 100)}–{Math.round(pivotMax * 100)}% of a monthly pivot</div>
          <div className="text-xs text-text-muted/60">Try widening the range or switching to S&P 1500</div>
        </div>
      )}

      {/* ── Signals table ── */}
      {data?.results && data.results.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="border-b border-border bg-surface-2 sticky top-0">
              <tr>
                {COLUMNS.map((col) => (
                  <SortTh key={col.key} col={col} sortBy={sortBy} desc={desc} onSort={handleSort} />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {data.results.map((row: TechnicalSignal, i: number) => {
                const isPivotZone =
                  row.pivot_dist != null &&
                  Math.abs(row.pivot_dist) >= pivotMin &&
                  Math.abs(row.pivot_dist) <= pivotMax;
                return (
                  <tr
                    key={row.ticker}
                    className={cn(
                      "hover:bg-surface-2/60 transition-colors",
                      isPivotZone && "bg-yellow-500/5",
                      i % 2 !== 0 && !isPivotZone && "bg-surface/20"
                    )}
                  >
                    {COLUMNS.map((col) => {
                      const val = (row as unknown as Record<string, unknown>)[col.key];
                      return (
                        <td key={col.key} className={cn("px-2 py-1.5", col.clrFn(val))}>
                          {col.fmtFn(val)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Empty state (non-pivot) ── */}
      {!nearPivot && !isLoading && data?.results?.length === 0 && (
        <div className="py-16 text-center text-text-muted text-sm">
          No tickers — price data may still be loading
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-text-muted pt-1">
          <span>Page {page} of {totalPages} · {total} results</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || isFetching}
              className="px-2.5 py-1 rounded border border-border hover:border-accent disabled:opacity-40 transition-colors"
            >
              Prev
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pg: number;
              if (totalPages <= 5) pg = i + 1;
              else if (page <= 3) pg = i + 1;
              else if (page >= totalPages - 2) pg = totalPages - 4 + i;
              else pg = page - 2 + i;
              return (
                <button
                  key={pg}
                  onClick={() => setPage(pg)}
                  className={cn(
                    "w-7 h-7 rounded border text-xs transition-colors",
                    pg === page
                      ? "border-accent bg-accent text-white"
                      : "border-border hover:border-accent text-text-muted"
                  )}
                >
                  {pg}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || isFetching}
              className="px-2.5 py-1 rounded border border-border hover:border-accent disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

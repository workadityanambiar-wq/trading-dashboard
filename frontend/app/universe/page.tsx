"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Search, SlidersHorizontal, TrendingUp, TrendingDown, Minus,
  ChevronUp, ChevronDown, Building2, Globe, BarChart3,
  RefreshCw, X, Star, GitCompare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWatchlist } from "@/hooks/useWatchlist";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

interface UniverseRow {
  ticker: string;
  name: string | null;
  exchange: string | null;
  is_etf: boolean;
  sector: string | null;
  industry: string | null;
  asset_class: string | null;
  market_cap: number | null;
  currency: string | null;
  current_price: number | null;
  pe_ratio: number | null;
  forward_pe: number | null;
  ev_ebitda: number | null;
  price_sales: number | null;
  revenue_growth: number | null;
  earnings_growth: number | null;
  gross_margin: number | null;
  operating_margin: number | null;
  net_margin: number | null;
  roe: number | null;
  beta: number | null;
  price_change_1y: number | null;
  price_change_3m: number | null;
  high_52w: number | null;
  low_52w: number | null;
  dividend_yield: number | null;
  recommendation: string | null;
  analyst_count: number | null;
}

interface SearchResponse {
  total: number;
  page: number;
  pages: number;
  results: UniverseRow[];
}

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtMktCap = (v: number | null): string => {
  if (v == null) return "—";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(0)}`;
};

const fmtPrice = (v: number | null): string =>
  v == null ? "—" : `$${v.toFixed(2)}`;

const fmtMult = (v: number | null): string =>
  v == null ? "—" : `${v.toFixed(1)}x`;

const fmtPct = (v: number | null, asFraction = true): string => {
  if (v == null) return "—";
  const pct = asFraction ? v * 100 : v;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
};

const fmtNum = (v: number | null, dec = 2): string =>
  v == null ? "—" : v.toFixed(dec);

// ── Colour helpers ────────────────────────────────────────────────────────────

const chgColor = (v: number | null, fraction = true): string => {
  if (v == null) return "text-text-muted";
  const val = fraction ? v : v / 100;
  if (val > 0.002) return "text-emerald-400";
  if (val < -0.002) return "text-red-400";
  return "text-text-muted";
};

const recColor = (r: string | null): string => {
  if (!r) return "text-text-muted";
  const u = r.toUpperCase();
  if (u.includes("STRONG BUY")) return "text-emerald-400";
  if (u === "BUY") return "text-emerald-400";
  if (u === "HOLD") return "text-amber-400";
  if (u === "SELL" || u.includes("STRONG SELL")) return "text-red-400";
  return "text-text-muted";
};

// ── Constants ─────────────────────────────────────────────────────────────────

const SECTORS = [
  "Technology", "Healthcare", "Financials", "Consumer Discretionary",
  "Communication Services", "Industrials", "Consumer Staples", "Energy",
  "Utilities", "Real Estate", "Materials",
];

const ASSET_CLASSES = [
  { label: "All", value: "" },
  { label: "Equities", value: "EQUITY" },
  { label: "ETFs", value: "ETF" },
  { label: "REITs", value: "REIT" },
];

const MKTCAP_RANGES = [
  { label: "All", min: undefined, max: undefined },
  { label: "Mega (>$200B)", min: 200e9, max: undefined },
  { label: "Large ($10B–$200B)", min: 10e9, max: 200e9 },
  { label: "Mid ($2B–$10B)", min: 2e9, max: 10e9 },
  { label: "Small (<$2B)", min: undefined, max: 2e9 },
];

const SORT_OPTIONS = [
  { value: "market_cap", label: "Market Cap" },
  { value: "pe_ratio", label: "P/E Ratio" },
  { value: "ev_ebitda", label: "EV/EBITDA" },
  { value: "revenue_growth", label: "Revenue Growth" },
  { value: "net_margin", label: "Net Margin" },
  { value: "price_change_1y", label: "1Y Return" },
  { value: "beta", label: "Beta" },
  { value: "roe", label: "ROE" },
];

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchUniverse(params: Record<string, string | number>): Promise<SearchResponse> {
  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== "" && v !== undefined && v !== null)
      .map(([k, v]) => [k, String(v)])
  ).toString();
  const res = await fetch(`/api/universe/search?${qs}`);
  if (!res.ok) throw new Error("Failed to fetch universe");
  return res.json();
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SortIcon({ col, active, dir }: { col: string; active: string; dir: string }) {
  if (col !== active) return <ChevronUp size={10} className="text-text-faint" />;
  return dir === "asc"
    ? <ChevronUp size={10} className="text-accent" />
    : <ChevronDown size={10} className="text-accent" />;
}

function RecBadge({ rec }: { rec: string | null }) {
  if (!rec) return <span className="text-text-muted">—</span>;
  const u = rec.toUpperCase();
  const cls =
    u.includes("STRONG BUY") ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
    u === "BUY"               ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
    u === "HOLD"              ? "bg-amber-500/10   text-amber-400   border-amber-500/20"   :
    "bg-red-500/10 text-red-400 border-red-500/20";
  return (
    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium border", cls)}>
      {rec}
    </span>
  );
}

function RangeBar({ price, low, high }: { price: number | null; low: number | null; high: number | null }) {
  if (price == null || low == null || high == null || high === low) return <span className="text-text-muted">—</span>;
  const pct = Math.max(0, Math.min(100, ((price - low) / (high - low)) * 100));
  return (
    <div className="flex items-center gap-1.5 w-24">
      <span className="text-[10px] text-text-muted font-mono w-7 text-right">{Math.round(pct)}%</span>
      <div className="flex-1 h-1 rounded-full bg-surface-2 relative">
        <div
          className="absolute top-0 h-1 rounded-full bg-accent/60"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function UniversePage() {
  const router = useRouter();
  const { has: wlHas, add: wlAdd, remove: wlRemove } = useWatchlist();

  const [q, setQ]               = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [sector, setSector]     = useState("");
  const [assetClass, setAssetClass] = useState("");
  const [mcapIdx, setMcapIdx]   = useState(0);
  const [sortBy, setSortBy]     = useState("market_cap");
  const [sortDir, setSortDir]   = useState<"asc" | "desc">("desc");
  const [page, setPage]         = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [compareList, setCompareList] = useState<string[]>([]);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const mcap = MKTCAP_RANGES[mcapIdx];

  const queryParams = {
    q: debouncedQ,
    sector,
    asset_class: assetClass,
    sort_by: sortBy,
    sort_dir: sortDir,
    page,
    page_size: 50,
    ...(mcap.min !== undefined && { market_cap_min: mcap.min }),
    ...(mcap.max !== undefined && { market_cap_max: mcap.max }),
  };

  const { data, isLoading, isFetching } = useQuery<SearchResponse>({
    queryKey: ["universe-search", queryParams],
    queryFn: () => fetchUniverse(queryParams as Record<string, string | number>),
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });

  const handleSort = (col: string) => {
    if (col === sortBy) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortBy(col);
      setSortDir("desc");
    }
    setPage(1);
  };

  const toggleCompare = useCallback((ticker: string) => {
    setCompareList(prev =>
      prev.includes(ticker)
        ? prev.filter(t => t !== ticker)
        : prev.length < 6 ? [...prev, ticker] : prev
    );
  }, []);

  const results = data?.results ?? [];
  const total   = data?.total ?? 0;
  const pages   = data?.pages ?? 1;

  const ColHeader = ({ col, label, className }: { col: string; label: string; className?: string }) => (
    <th
      className={cn("px-3 py-2.5 text-left cursor-pointer select-none hover:text-text-primary transition-colors group whitespace-nowrap", className)}
      onClick={() => handleSort(col)}
    >
      <span className="flex items-center gap-1 text-[11px] font-medium text-text-muted">
        {label}
        <SortIcon col={col} active={sortBy} dir={sortDir} />
      </span>
    </th>
  );

  return (
    <div className="space-y-4 max-w-[1600px]">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-text-primary tracking-tight">Investment Universe</h1>
          <p className="text-xs text-text-muted mt-0.5">
            Security master database · {total.toLocaleString()} securities
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isFetching && <RefreshCw size={12} className="animate-spin text-text-muted" />}
          <button
            onClick={() => setShowFilters(f => !f)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs transition-colors",
              showFilters
                ? "bg-accent/10 border-accent/30 text-accent"
                : "border-border text-text-muted hover:text-text-primary"
            )}
          >
            <SlidersHorizontal size={12} />
            Filters
          </button>
        </div>
      </div>

      {/* ── Search ─────────────────────────────────────────────────────────── */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setPage(1); }}
          placeholder="Search by ticker, company name, sector, industry…"
          className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-border bg-surface text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 transition-colors"
        />
        {q && (
          <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary">
            <X size={13} />
          </button>
        )}
      </div>

      {/* ── Asset class tabs ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1">
        {ASSET_CLASSES.map(ac => (
          <button
            key={ac.value}
            onClick={() => { setAssetClass(ac.value); setPage(1); }}
            className={cn(
              "px-3 py-1 rounded text-xs font-medium transition-colors",
              assetClass === ac.value
                ? "bg-accent text-white"
                : "text-text-muted hover:text-text-primary bg-surface border border-border"
            )}
          >
            {ac.label}
          </button>
        ))}
      </div>

      {/* ── Expanded filters ────────────────────────────────────────────────── */}
      {showFilters && (
        <div className="rounded-lg border border-border bg-surface p-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Sector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-text-muted uppercase tracking-wide">Sector</label>
            <select
              value={sector}
              onChange={e => { setSector(e.target.value); setPage(1); }}
              className="w-full rounded border border-border bg-surface-2 text-xs text-text-primary px-2 py-1.5 focus:outline-none focus:border-accent/50"
            >
              <option value="">All Sectors</option>
              {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Market Cap */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-text-muted uppercase tracking-wide">Market Cap</label>
            <select
              value={mcapIdx}
              onChange={e => { setMcapIdx(Number(e.target.value)); setPage(1); }}
              className="w-full rounded border border-border bg-surface-2 text-xs text-text-primary px-2 py-1.5 focus:outline-none focus:border-accent/50"
            >
              {MKTCAP_RANGES.map((r, i) => <option key={i} value={i}>{r.label}</option>)}
            </select>
          </div>

          {/* Sort by */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-text-muted uppercase tracking-wide">Sort By</label>
            <select
              value={sortBy}
              onChange={e => { setSortBy(e.target.value); setPage(1); }}
              className="w-full rounded border border-border bg-surface-2 text-xs text-text-primary px-2 py-1.5 focus:outline-none focus:border-accent/50"
            >
              {SORT_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          {/* Reset */}
          <div className="flex items-end">
            <button
              onClick={() => { setSector(""); setMcapIdx(0); setAssetClass(""); setQ(""); setPage(1); }}
              className="px-3 py-1.5 rounded border border-border text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              Reset Filters
            </button>
          </div>
        </div>
      )}

      {/* ── Compare bar ────────────────────────────────────────────────────── */}
      {compareList.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-accent/30 bg-accent/5">
          <GitCompare size={13} className="text-accent" />
          <span className="text-xs text-accent font-medium">Comparing:</span>
          <div className="flex items-center gap-1.5">
            {compareList.map(t => (
              <span key={t} className="flex items-center gap-1 px-2 py-0.5 rounded bg-accent/10 text-accent text-xs font-mono">
                {t}
                <button onClick={() => toggleCompare(t)}><X size={10} /></button>
              </span>
            ))}
          </div>
          <Link
            href={`/universe/compare?tickers=${compareList.join(",")}`}
            className="ml-auto px-3 py-1 rounded bg-accent text-white text-xs font-medium hover:bg-accent/90"
          >
            Compare →
          </Link>
          <button onClick={() => setCompareList([])} className="text-text-muted hover:text-text-primary">
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-surface overflow-x-auto">
        <table className="w-full min-w-[1100px]">
          <thead className="border-b border-border">
            <tr className="bg-surface-2">
              <th className="w-8 px-3 py-2.5" />
              <th className="px-3 py-2.5 text-left">
                <span className="text-[11px] font-medium text-text-muted">Ticker / Company</span>
              </th>
              <th className="px-3 py-2.5 text-left">
                <span className="text-[11px] font-medium text-text-muted">Sector</span>
              </th>
              <ColHeader col="market_cap"       label="Mkt Cap"    />
              <ColHeader col="pe_ratio"         label="P/E"        />
              <ColHeader col="ev_ebitda"        label="EV/EBITDA"  />
              <ColHeader col="revenue_growth"   label="Rev Growth" />
              <ColHeader col="net_margin"       label="Net Margin" />
              <ColHeader col="roe"              label="ROE"        />
              <ColHeader col="price_change_1y"  label="1Y Return"  />
              <th className="px-3 py-2.5 text-left">
                <span className="text-[11px] font-medium text-text-muted">52W Range</span>
              </th>
              <ColHeader col="beta"             label="Beta"       />
              <th className="px-3 py-2.5 text-left">
                <span className="text-[11px] font-medium text-text-muted">Rating</span>
              </th>
              <th className="px-3 py-2.5 text-right">
                <span className="text-[11px] font-medium text-text-muted">Price</span>
              </th>
              <th className="w-8 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={15} className="text-center py-16 text-text-muted text-sm">
                  <RefreshCw size={16} className="animate-spin mx-auto mb-2" />
                  Loading universe…
                </td>
              </tr>
            ) : results.length === 0 ? (
              <tr>
                <td colSpan={15} className="text-center py-16 text-text-muted text-sm">
                  No results found. Try adjusting your filters.
                </td>
              </tr>
            ) : (
              results.map((row, i) => {
                const inCompare = compareList.includes(row.ticker);
                const inWl = wlHas(row.ticker);
                return (
                  <tr
                    key={row.ticker}
                    className={cn(
                      "border-b border-border/40 hover:bg-surface-2 transition-colors cursor-pointer",
                      i % 2 === 0 ? "" : "bg-surface/50"
                    )}
                    onClick={() => router.push(`/universe/${row.ticker}`)}
                  >
                    {/* Compare checkbox */}
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={inCompare}
                        onChange={() => toggleCompare(row.ticker)}
                        className="accent-accent"
                      />
                    </td>

                    {/* Ticker / Name */}
                    <td className="px-3 py-2 min-w-[180px]">
                      <div className="flex flex-col">
                        <span className="font-mono text-xs font-semibold text-text-primary">{row.ticker}</span>
                        <span className="text-[11px] text-text-muted truncate max-w-[160px]">{row.name || "—"}</span>
                      </div>
                    </td>

                    {/* Sector */}
                    <td className="px-3 py-2 min-w-[140px]">
                      <span className="text-xs text-text-muted truncate block max-w-[140px]">{row.sector || "—"}</span>
                      {row.asset_class && row.asset_class !== "EQUITY" && (
                        <span className="text-[10px] text-accent/70">{row.asset_class}</span>
                      )}
                    </td>

                    {/* Mkt Cap */}
                    <td className="px-3 py-2">
                      <span className="text-xs font-mono text-text-primary">{fmtMktCap(row.market_cap)}</span>
                    </td>

                    {/* P/E */}
                    <td className="px-3 py-2">
                      <span className="text-xs font-mono text-text-primary">{fmtMult(row.pe_ratio)}</span>
                    </td>

                    {/* EV/EBITDA */}
                    <td className="px-3 py-2">
                      <span className="text-xs font-mono text-text-primary">{fmtMult(row.ev_ebitda)}</span>
                    </td>

                    {/* Rev Growth */}
                    <td className="px-3 py-2">
                      <span className={cn("text-xs font-mono", chgColor(row.revenue_growth))}>
                        {fmtPct(row.revenue_growth)}
                      </span>
                    </td>

                    {/* Net Margin */}
                    <td className="px-3 py-2">
                      <span className={cn("text-xs font-mono", row.net_margin != null && row.net_margin > 0 ? "text-emerald-400" : "text-red-400")}>
                        {fmtPct(row.net_margin)}
                      </span>
                    </td>

                    {/* ROE */}
                    <td className="px-3 py-2">
                      <span className={cn("text-xs font-mono", chgColor(row.roe))}>
                        {fmtPct(row.roe)}
                      </span>
                    </td>

                    {/* 1Y Return */}
                    <td className="px-3 py-2">
                      <span className={cn("text-xs font-mono", chgColor(row.price_change_1y))}>
                        {fmtPct(row.price_change_1y)}
                      </span>
                    </td>

                    {/* 52W Range */}
                    <td className="px-3 py-2">
                      <RangeBar price={row.current_price} low={row.low_52w} high={row.high_52w} />
                    </td>

                    {/* Beta */}
                    <td className="px-3 py-2">
                      <span className={cn("text-xs font-mono", row.beta != null && row.beta > 1.5 ? "text-amber-400" : "text-text-primary")}>
                        {fmtNum(row.beta)}
                      </span>
                    </td>

                    {/* Rating */}
                    <td className="px-3 py-2">
                      <RecBadge rec={row.recommendation} />
                    </td>

                    {/* Price */}
                    <td className="px-3 py-2 text-right">
                      <span className="text-xs font-mono font-medium text-text-primary">{fmtPrice(row.current_price)}</span>
                    </td>

                    {/* Watchlist star */}
                    <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => inWl ? wlRemove(row.ticker) : wlAdd(row.ticker)}
                        className="transition-colors"
                      >
                        <Star
                          size={12}
                          className={inWl ? "fill-amber-400 text-amber-400" : "text-text-faint hover:text-amber-400"}
                          strokeWidth={1.5}
                        />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ─────────────────────────────────────────────────────── */}
      {pages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">
            Showing {((page - 1) * 50) + 1}–{Math.min(page * 50, total)} of {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 rounded border border-border text-xs text-text-muted hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Prev
            </button>
            {Array.from({ length: Math.min(7, pages) }, (_, i) => {
              const p = page <= 4 ? i + 1 : page - 3 + i;
              if (p < 1 || p > pages) return null;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={cn(
                    "px-2.5 py-1 rounded border text-xs transition-colors",
                    p === page
                      ? "bg-accent border-accent text-white"
                      : "border-border text-text-muted hover:text-text-primary"
                  )}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setPage(p => Math.min(pages, p + 1))}
              disabled={page === pages}
              className="px-3 py-1 rounded border border-border text-xs text-text-muted hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

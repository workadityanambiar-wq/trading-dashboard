"use client";
import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type ScoresParams } from "@/lib/api";
import { ScreenerTable } from "@/components/tables/ScreenerTable";
import { ThemeSelector } from "@/components/ThemeSelector";
import { cn } from "@/lib/utils";
import {
  RefreshCw, Database, Download, ChevronLeft, ChevronRight,
  Globe, TrendingUp, Layers,
} from "lucide-react";

// ── Exchange filter options ───────────────────────────────────────────────────

const EXCHANGES = [
  { code: "",  label: "All" },
  { code: "Q", label: "NASDAQ" },
  { code: "N", label: "NYSE" },
  { code: "P", label: "Arca" },
  { code: "Z", label: "CBOE" },
  { code: "A", label: "NYSE Am." },
];

const ASSET_TYPES = [
  { value: undefined,  label: "All" },
  { value: false,      label: "Stocks" },
  { value: true,       label: "ETFs" },
] as const;

// ── Main page ─────────────────────────────────────────────────────────────────

type UniverseMode = "sp500" | "all_us" | "themes";

export default function ScreenerPage() {
  const [universeMode, setUniverseMode]     = useState<UniverseMode>("sp500");
  const [selectedTheme, setSelectedTheme]   = useState("ai_infra");
  const [selectedSegment, setSelectedSegment] = useState("");
  const [exchange, setExchange]             = useState("");
  const [isEtf, setIsEtf]                   = useState<boolean | undefined>(undefined);
  const [search, setSearch]                 = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage]                     = useState(1);
  const [prefetching, setPrefetching]       = useState(false);
  const PAGE_SIZE = 100;

  // Theme hierarchy for the selector
  const { data: themesData } = useQuery({
    queryKey: ["themes"],
    queryFn: () => api.getThemes(),
    staleTime: Infinity,
    enabled: universeMode === "themes",
  });
  const themes = themesData?.themes ?? [];

  // Debounce search input
  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    clearTimeout((handleSearch as { _t?: ReturnType<typeof setTimeout> })._t);
    (handleSearch as { _t?: ReturnType<typeof setTimeout> })._t = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 350);
  }, []);

  const universeParam = useMemo(() => {
    if (universeMode === "themes") {
      return selectedSegment
        ? `theme:${selectedTheme}:${selectedSegment}`
        : `theme:${selectedTheme}`;
    }
    return universeMode;
  }, [universeMode, selectedTheme, selectedSegment]);

  const params: ScoresParams = {
    universe: universeParam,
    page,
    page_size: PAGE_SIZE,
    search: debouncedSearch,
    exchange: universeMode === "all_us" ? exchange : "",
    is_etf:   universeMode === "all_us" ? isEtf   : undefined,
  };

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["factor-scores", params],
    queryFn: () => api.getFactorScores(params),
    refetchInterval: universeMode === "sp500" ? 5 * 60 * 1000 : false,
    staleTime: 2 * 60 * 1000,
  });

  const totalPages = data?.pages ?? 1;
  const total = data?.total ?? 0;

  async function handlePrefetch() {
    setPrefetching(true);
    try {
      await api.prefetchUniverse(exchange, 500);
      setTimeout(() => { refetch(); setPrefetching(false); }, 3000);
    } catch {
      setPrefetching(false);
    }
  }

  function changeUniverse(mode: UniverseMode) {
    setUniverseMode(mode);
    setPage(1);
    setExchange("");
    setIsEtf(undefined);
    setDebouncedSearch("");
    setSearch("");
  }

  return (
    <div className="space-y-4 max-w-screen-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">Universe Screener</h1>
          <p className="text-xs text-text-muted mt-0.5">
            {universeMode === "sp500"  && "S&P 500 — sorted by composite factor score"}
            {universeMode === "all_us" && `All US Listed — ${total.toLocaleString()} securities`}
            {universeMode === "themes" && `Thematic — ${total} tickers`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data?.as_of && (
            <span className="text-xs text-text-muted">As of {data.as_of}</span>
          )}
          {universeMode === "all_us" && (
            <button
              onClick={handlePrefetch}
              disabled={prefetching}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-accent transition-colors"
              title="Fetch price history for stocks without data"
            >
              {prefetching ? (
                <RefreshCw size={12} className="animate-spin" />
              ) : (
                <Download size={12} />
              )}
              {prefetching ? "Fetching..." : "Fetch prices"}
            </button>
          )}
          <button
            onClick={() => api.triggerFundamentals(100).then(() => setTimeout(refetch, 5000))}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            <Database size={12} />
            Fundamentals
          </button>
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

      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Universe toggle */}
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          <button
            onClick={() => changeUniverse("sp500")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 transition-colors",
              universeMode === "sp500"
                ? "bg-accent text-white"
                : "bg-surface text-text-muted hover:text-text-primary"
            )}
          >
            <TrendingUp size={11} />
            S&P 500
          </button>
          <button
            onClick={() => changeUniverse("all_us")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 transition-colors border-l border-border",
              universeMode === "all_us"
                ? "bg-accent text-white"
                : "bg-surface text-text-muted hover:text-text-primary"
            )}
          >
            <Globe size={11} />
            All US Listed
          </button>
          <button
            onClick={() => changeUniverse("themes")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 transition-colors border-l border-border",
              universeMode === "themes"
                ? "bg-accent text-white"
                : "bg-surface text-text-muted hover:text-text-primary"
            )}
          >
            <Layers size={11} />
            Themes
          </button>
        </div>

        {/* Exchange filter — only shown in all_us mode */}
        {universeMode === "all_us" && (
          <div className="flex gap-1">
            {EXCHANGES.map((ex) => (
              <button
                key={ex.code}
                onClick={() => { setExchange(ex.code); setPage(1); }}
                className={cn(
                  "px-2.5 py-1.5 rounded text-xs transition-colors",
                  exchange === ex.code
                    ? "bg-surface border border-accent text-accent"
                    : "bg-surface border border-border text-text-muted hover:text-text-primary"
                )}
              >
                {ex.label}
              </button>
            ))}
          </div>
        )}

        {/* Asset type filter */}
        {universeMode === "all_us" && (
          <div className="flex gap-1">
            {ASSET_TYPES.map((t) => (
              <button
                key={String(t.value)}
                onClick={() => { setIsEtf(t.value as boolean | undefined); setPage(1); }}
                className={cn(
                  "px-2.5 py-1.5 rounded text-xs transition-colors",
                  isEtf === t.value
                    ? "bg-surface border border-accent text-accent"
                    : "bg-surface border border-border text-text-muted hover:text-text-primary"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search ticker or name..."
          className="bg-surface border border-border rounded px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent w-52"
        />

        {/* Result count */}
        {total > 0 && (
          <span className="text-xs text-text-muted ml-auto">
            {total.toLocaleString()} results
          </span>
        )}
      </div>

      {/* Theme selector — shown when themes mode is active */}
      {universeMode === "themes" && themes.length > 0 && (
        <ThemeSelector
          themes={themes}
          selectedTheme={selectedTheme}
          selectedSegment={selectedSegment}
          onSelectTheme={(id) => { setSelectedTheme(id); setSelectedSegment(""); setPage(1); }}
          onSelectSegment={(id) => { setSelectedSegment(id); setPage(1); }}
        />
      )}

      {/* Factor score legend */}
      <div className="flex items-center gap-6 text-xs text-text-muted border border-border bg-surface rounded p-3">
        <div>
          <span className="font-medium text-text-primary">Z-score columns</span> = cross-sectional
          rank within universe (mean=0, std=1, winsorized ±3)
        </div>
        <div className="flex gap-3">
          <span className="text-green-400">+1σ top</span>
          <span className="text-red-400">−1σ bottom</span>
        </div>
        {universeMode === "all_us" && (
          <div className="ml-auto text-text-muted/70">
            Factor scores shown only for stocks with cached price history.
            Click <strong className="text-text-muted">Fetch prices</strong> to load more.
          </div>
        )}
        {universeMode === "themes" && (
          <div className="ml-auto text-text-muted/70">
            Z-scores are relative within the selected theme segment — not vs the full S&P 500.
          </div>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center gap-2 text-text-muted text-sm py-12 justify-center">
          <RefreshCw size={14} className="animate-spin" />
          {universeMode === "all_us" ? "Loading universe..." : "Loading factor scores..."}
        </div>
      )}

      {/* Themes: no cached prices yet */}
      {universeMode === "themes" && data?.status === "loading" && !isLoading && (
        <div className="rounded-lg border border-border bg-surface p-6 text-center">
          <RefreshCw size={16} className="animate-spin text-accent mx-auto mb-2" />
          <div className="text-sm text-text-primary mb-1">Fetching price history for theme tickers</div>
          <div className="text-xs text-text-muted">{data.message}</div>
        </div>
      )}

      {/* Initial fetch progress (sp500) */}
      {data?.status === "loading" && (
        <div className="rounded-lg border border-border bg-surface p-6 text-center">
          <RefreshCw size={20} className="animate-spin text-accent mx-auto mb-3" />
          <div className="text-sm text-text-primary mb-1">Fetching S&P 500 price history</div>
          <div className="text-xs text-text-muted">{data.message}</div>
          <div className="mt-3 h-1.5 rounded-full bg-surface-2 max-w-xs mx-auto">
            <div
              className="h-1.5 rounded-full bg-accent transition-all"
              style={{ width: `${(data.cached_pct ?? 0) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Partial data warning */}
      {data?.status === "partial" && (
        <div className="text-xs text-yellow-500/80 flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-500" />
          Partial data — {Math.round((data.cached_pct ?? 0) * 100)}% of S&P 500 cached. Full
          fetch running in background.
        </div>
      )}

      {/* Table */}
      {data?.scores && data.scores.length > 0 && (
        <ScreenerTable data={data.scores} showExchange={universeMode === "all_us"} />
      )}

      {/* Empty state */}
      {data?.scores?.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-text-muted gap-2">
          <Globe size={28} strokeWidth={1} />
          <div className="text-sm">No results</div>
          {universeMode === "all_us" && total === 0 && (
            <div className="text-xs">
              Universe data loading — refresh in a moment
            </div>
          )}
        </div>
      )}

      {/* Pagination — only in all_us or when sp500 has pages */}
      {(universeMode === "all_us" || (data?.pages ?? 1) > 1) && totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-text-muted pt-1">
          <span>
            Page {page} of {totalPages} · {total.toLocaleString()} total
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || isFetching}
              className="p-1.5 rounded border border-border hover:border-accent disabled:opacity-40 transition-colors"
            >
              <ChevronLeft size={13} />
            </button>
            {/* Page number pills */}
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              let pg: number;
              if (totalPages <= 7) pg = i + 1;
              else if (page <= 4) pg = i + 1;
              else if (page >= totalPages - 3) pg = totalPages - 6 + i;
              else pg = page - 3 + i;
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
              className="p-1.5 rounded border border-border hover:border-accent disabled:opacity-40 transition-colors"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

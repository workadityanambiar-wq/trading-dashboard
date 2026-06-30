"use client";
import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ScannerResult, ScannerAlert } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Zap, RefreshCw, BellRing, Star, ChevronUp, ChevronDown,
  TrendingUp, TrendingDown, X, AlertTriangle, CheckCircle,
  XCircle, Clock, Eye, Activity, BarChart3, Search,
  Check, ChevronRight, LayoutGrid,
} from "lucide-react";

// ── Constants ──────────────────────────────────────────────────────────────────

const PATTERN_GROUPS: Record<string, string[]> = {
  "Chart Patterns": [
    "Head & Shoulders", "Inv Head & Shoulders", "Double Top", "Double Bottom",
    "Cup & Handle", "Falling Wedge", "Rising Wedge", "Symmetrical Triangle",
    "Ascending Triangle", "Descending Triangle",
  ],
  Candlestick: [
    "Evening Star", "Morning Star", "Doji", "Engulf", "Hammer", "Shooting Star", "Dark Cloud",
  ],
  Indicator: [
    "Strong ADX", "BB Squeeze", "Golden Cross", "Death Cross", "RSI", "MACD",
  ],
  Breakout: [
    "Momentum Burst", "Volume Breakout", "Support Breakdown",
    "Resistance Breakout", "52-Week High", "52-Week Low",
  ],
};

const TF_ORDER = ["15m", "1H", "4H", "1D", "1W"];

const ASSET_LABELS: Record<string, string> = {
  EQUITY: "Equities", FOREX: "Forex", CRYPTO: "Crypto",
  METALS: "Metals", ENERGY: "Commodities", INDEX: "Indices", OTHER: "Other",
};

const CONVICTION_OPTS = [
  { v: "HIGH_CONVICTION", l: "High" },
  { v: "MODERATE",        l: "Medium" },
  { v: "LOW_PROBABILITY", l: "Low" },
];

const RR_OPTS = [
  { label: "Any", value: 0 },
  { label: "1.5x+", value: 1.5 },
  { label: "2x+",   value: 2 },
  { label: "2.5x+", value: 2.5 },
  { label: "3x+",   value: 3 },
  { label: "4x+",   value: 4 },
];

const QUICK_CHIPS = [
  { id: "all",            label: "All Signals" },
  { id: "high_conviction",label: "High Conviction" },
  { id: "long",           label: "Long Only" },
  { id: "short",          label: "Short Only" },
  { id: "breakouts",      label: "Breakouts" },
  { id: "reversals",      label: "Reversals" },
  { id: "candlestick",    label: "Candlestick" },
  { id: "chart",          label: "Chart Patterns" },
  { id: "indicator",      label: "Indicators" },
  { id: "today",          label: "Today" },
  { id: "starred",        label: "Favorites" },
];

// ── Filter state ──────────────────────────────────────────────────────────────

interface Filters {
  search: string;
  patterns: string[];
  tfLabels: string[];
  assetClasses: string[];
  direction: "ALL" | "LONG" | "SHORT";
  conviction: string[];
  minScore: number;
  minRR: number;
  quickFilter: string;
}

const DEFAULT_FILTERS: Filters = {
  search: "", patterns: [], tfLabels: [], assetClasses: [],
  direction: "ALL", conviction: [], minScore: 60, minRR: 0, quickFilter: "all",
};

const STORAGE_KEY = "ae-scanner-v3";

function loadFilters(): Filters {
  try {
    const s = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (s) return { ...DEFAULT_FILTERS, ...JSON.parse(s) };
  } catch {}
  return DEFAULT_FILTERS;
}

function isDefault(f: Filters) {
  return (
    !f.search && !f.patterns.length && !f.tfLabels.length && !f.assetClasses.length &&
    f.direction === "ALL" && !f.conviction.length &&
    f.minScore === DEFAULT_FILTERS.minScore && f.minRR === 0 && f.quickFilter === "all"
  );
}

// ── Filtering logic ───────────────────────────────────────────────────────────

type SortKey = "pattern_score" | "rr_ratio" | "symbol" | "detected_at";

function filterResults(
  results: ScannerResult[],
  f: Filters,
  sortBy: SortKey,
  sortDir: "asc" | "desc",
): ScannerResult[] {
  let out = results.filter(r => {
    if (f.search) {
      const q = f.search.toLowerCase();
      if (!r.symbol.toLowerCase().includes(q) && !r.pattern.toLowerCase().includes(q)) return false;
    }
    if (f.direction !== "ALL" && r.direction !== f.direction) return false;
    if (f.patterns.length && !f.patterns.some(p => r.pattern.toLowerCase().includes(p.toLowerCase()))) return false;
    if (f.tfLabels.length && !f.tfLabels.includes(r.tf_label)) return false;
    if (f.assetClasses.length && !f.assetClasses.includes(r.asset_class)) return false;
    if (f.conviction.length && !f.conviction.includes(r.classification)) return false;
    if (r.pattern_score < f.minScore) return false;
    if (f.minRR > 0 && r.rr_ratio < f.minRR) return false;
    // Quick filter
    switch (f.quickFilter) {
      case "high_conviction": if (r.classification !== "HIGH_CONVICTION") return false; break;
      case "long":  if (r.direction !== "LONG")  return false; break;
      case "short": if (r.direction !== "SHORT") return false; break;
      case "breakouts":   if (r.category !== "BREAKOUT")    return false; break;
      case "reversals":   if (!["CANDLESTICK","CHART"].includes(r.category)) return false; break;
      case "candlestick": if (r.category !== "CANDLESTICK") return false; break;
      case "chart":       if (r.category !== "CHART")       return false; break;
      case "indicator":   if (r.category !== "INDICATOR")   return false; break;
      case "starred":     if (!r.is_starred)                return false; break;
      case "today": {
        const today = new Date().toISOString().split("T")[0];
        if (!r.detected_at?.startsWith(today))              return false; break;
      }
    }
    return true;
  });
  const rev = sortDir === "desc";
  out.sort((a, b) => {
    const av = a[sortBy] ?? 0, bv = b[sortBy] ?? 0;
    return rev ? (bv > av ? 1 : -1) : (av > bv ? 1 : -1);
  });
  return out;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined, d = 2) =>
  n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

const DIRECTION_COLOR: Record<string, string> = {
  LONG:  "text-emerald-400 bg-emerald-900/30",
  SHORT: "text-red-400 bg-red-900/30",
};
const CLASS_COLOR: Record<string, string> = {
  HIGH_CONVICTION: "text-amber-300 bg-amber-900/30 border border-amber-800/50",
  MODERATE:        "text-blue-300 bg-blue-900/30 border border-blue-800/50",
  LOW_PROBABILITY: "text-text-muted bg-surface-3 border border-border",
};
const STATUS_COLOR: Record<string, string> = {
  WATCH:"text-text-muted",TRIGGERED:"text-amber-400",CONFIRMED:"text-emerald-400",
  FAILED:"text-red-400",EXPIRED:"text-text-faint",
};
const STATUS_ICON: Record<string, React.ElementType> = {
  WATCH:Eye,TRIGGERED:AlertTriangle,CONFIRMED:CheckCircle,FAILED:XCircle,EXPIRED:Clock,
};
const CAT_ICON: Record<string, React.ElementType> = {
  CANDLESTICK:Activity,CHART:BarChart3,INDICATOR:TrendingUp,BREAKOUT:Zap,
};

// ── MultiSelect dropdown ──────────────────────────────────────────────────────

function MultiSelect({
  label, selected, onChange, groups, flat,
}: {
  label: string;
  selected: string[];
  onChange: (v: string[]) => void;
  groups?: Record<string, string[]>;
  flat?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (v: string) => {
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  };

  const allOptions = groups
    ? Object.values(groups).flat()
    : (flat ?? []);

  const filtered = allOptions.filter(o => o.toLowerCase().includes(search.toLowerCase()));

  const filteredGroups = groups
    ? Object.fromEntries(
        Object.entries(groups).map(([g, opts]) => [
          g, opts.filter(o => o.toLowerCase().includes(search.toLowerCase())),
        ]).filter(([, opts]) => (opts as string[]).length > 0)
      )
    : null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] border transition-colors whitespace-nowrap",
          selected.length
            ? "bg-accent/10 border-accent/50 text-accent"
            : "bg-surface-2 border-border text-text-muted hover:text-text-primary hover:border-border-2",
        )}
      >
        {label}
        {selected.length > 0 && (
          <span className="bg-accent text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {selected.length}
          </span>
        )}
        <ChevronDown size={9} className={cn("transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-56 bg-surface border border-border rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="flex items-center gap-1.5 bg-surface-2 border border-border rounded px-2 py-1">
              <Search size={10} className="text-text-faint shrink-0" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search…"
                className="bg-transparent text-[11px] text-text-primary outline-none w-full placeholder:text-text-faint"
              />
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto py-1">
            {filteredGroups
              ? Object.entries(filteredGroups).map(([group, opts]) => (
                  <div key={group}>
                    <div className="px-3 py-1 text-[9px] uppercase tracking-widest text-text-faint font-semibold">
                      {group}
                    </div>
                    {(opts as string[]).map(o => (
                      <button
                        key={o}
                        onClick={() => toggle(o)}
                        className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-text-muted hover:bg-surface-2 hover:text-text-primary transition-colors"
                      >
                        <div className={cn(
                          "w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0",
                          selected.includes(o) ? "bg-accent border-accent" : "border-border"
                        )}>
                          {selected.includes(o) && <Check size={9} className="text-white" />}
                        </div>
                        {o}
                      </button>
                    ))}
                  </div>
                ))
              : filtered.map(o => (
                  <button
                    key={o}
                    onClick={() => toggle(o)}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-text-muted hover:bg-surface-2 hover:text-text-primary transition-colors"
                  >
                    <div className={cn(
                      "w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0",
                      selected.includes(o) ? "bg-accent border-accent" : "border-border"
                    )}>
                      {selected.includes(o) && <Check size={9} className="text-white" />}
                    </div>
                    {o}
                  </button>
                ))
            }
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-[10px] text-text-faint">No results</div>
            )}
          </div>

          {selected.length > 0 && (
            <div className="px-3 py-2 border-t border-border">
              <button
                onClick={() => onChange([])}
                className="text-[10px] text-text-faint hover:text-text-muted transition-colors"
              >
                Clear {selected.length} selected
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Pattern Matrix ─────────────────────────────────────────────────────────────

function PatternMatrix({
  results,
  onFilter,
}: {
  results: ScannerResult[];
  onFilter: (pattern: string, tf: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const { patterns, tfs, matrix } = useMemo(() => {
    const counts: Record<string, Record<string, number>> = {};
    const tfSet = new Set<string>();

    for (const r of results) {
      if (!counts[r.pattern]) counts[r.pattern] = {};
      counts[r.pattern][r.tf_label] = (counts[r.pattern][r.tf_label] ?? 0) + 1;
      tfSet.add(r.tf_label);
    }

    const tfs = TF_ORDER.filter(t => tfSet.has(t));
    const patterns = Object.entries(counts)
      .map(([p, tfc]) => ({ p, total: Object.values(tfc).reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12)
      .map(x => x.p);

    return { patterns, tfs, matrix: counts };
  }, [results]);

  if (patterns.length === 0) return null;

  return (
    <div className="shrink-0 border-b border-border bg-surface">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="flex items-center gap-2 w-full px-4 py-2 text-[9px] uppercase tracking-widest text-text-faint hover:text-text-muted transition-colors font-semibold"
      >
        <LayoutGrid size={10} />
        Pattern Matrix
        <ChevronRight size={9} className={cn("ml-auto transition-transform", !collapsed && "rotate-90")} />
      </button>

      {!collapsed && (
        <div className="px-4 pb-3 overflow-x-auto">
          <table className="text-[10px] border-collapse">
            <thead>
              <tr>
                <th className="text-left pr-4 py-1 text-text-faint font-normal w-40 min-w-[160px]">Pattern</th>
                {tfs.map(tf => (
                  <th key={tf} className="text-center px-3 py-1 text-text-faint font-semibold w-12">{tf}</th>
                ))}
                <th className="text-center px-3 py-1 text-text-faint font-semibold w-12">Total</th>
              </tr>
            </thead>
            <tbody>
              {patterns.map(p => {
                const total = Object.values(matrix[p] ?? {}).reduce((a, b) => a + b, 0);
                return (
                  <tr key={p} className="group">
                    <td className="pr-4 py-0.5 text-text-muted font-mono truncate max-w-[160px]" title={p}>
                      {p.length > 22 ? p.slice(0, 21) + "…" : p}
                    </td>
                    {tfs.map(tf => {
                      const count = matrix[p]?.[tf] ?? 0;
                      return (
                        <td key={tf} className="text-center px-3 py-0.5">
                          {count > 0 ? (
                            <button
                              onClick={() => onFilter(p, tf)}
                              className="text-[10px] font-mono font-bold text-accent hover:bg-accent/10 rounded px-1.5 py-0.5 transition-colors"
                            >
                              {count}
                            </button>
                          ) : (
                            <span className="text-text-faint/30 font-mono">–</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="text-center px-3 py-0.5 font-mono font-bold text-text-primary">{total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Score pill & badge (kept from original) ────────────────────────────────────

function ScorePill({ value, label }: { value: number; label: string }) {
  const color = value >= 75 ? "bg-emerald-500" : value >= 50 ? "bg-blue-500" : "bg-red-500/70";
  return (
    <div className="flex-1">
      <div className="flex justify-between text-[9px] text-text-muted mb-0.5">
        <span>{label}</span>
        <span className="font-mono text-text-primary">{Math.round(value)}</span>
      </div>
      <div className="h-1 bg-surface-3 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function OverallScoreBadge({ score }: { score: number }) {
  const color = score >= 75
    ? "text-amber-300 border-amber-700 bg-amber-900/20"
    : score >= 50
    ? "text-blue-300 border-blue-700 bg-blue-900/20"
    : "text-text-muted border-border bg-surface-3";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-bold font-mono", color)}>
      {Math.round(score)}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ScannerPage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sortBy, setSortBy] = useState<SortKey>("pattern_score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<ScannerResult | null>(null);
  const [showAlerts, setShowAlerts] = useState(false);
  const [scanSym, setScanSym] = useState("");

  // Load from localStorage on mount
  useEffect(() => { setFilters(loadFilters()); }, []);

  // Save to localStorage on change
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(filters)); } catch {}
  }, [filters]);

  const set = (patch: Partial<Filters>) => setFilters(f => ({ ...f, ...patch }));

  // Fetch ALL results — filtering is done client-side
  const { data: allResults = [], isLoading } = useQuery({
    queryKey: ["scanner-results-all"],
    queryFn: () => api.getScannerResults({ limit: 1000, sort_by: "pattern_score", sort_dir: "desc" }),
    refetchInterval: 60_000,
  });

  const { data: alertsData } = useQuery({
    queryKey: ["scanner-alerts"],
    queryFn: () => api.getScannerAlerts(),
    refetchInterval: 30_000,
  });

  const { data: scanStatus } = useQuery({
    queryKey: ["scanner-status"],
    queryFn: () => api.getScannerStatus(),
    refetchInterval: 10_000,
  });

  const { mutate: triggerScan, isPending: scanning } = useMutation({
    mutationFn: () => api.triggerScan({}),
    onSuccess: () => setTimeout(() => qc.invalidateQueries({ queryKey: ["scanner-results-all"] }), 5000),
  });

  const { mutate: scanOne, isPending: scanningOne } = useMutation({
    mutationFn: (sym: string) => api.scanSymbol(sym),
    onSuccess: () => { setScanSym(""); qc.invalidateQueries({ queryKey: ["scanner-results-all"] }); },
  });

  const { mutate: updateResult } = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.updateScannerResult>[1] }) =>
      api.updateScannerResult(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scanner-results-all"] }),
  });

  // Client-side filtering
  const filtered = useMemo(
    () => filterResults(allResults, filters, sortBy, sortDir),
    [allResults, filters, sortBy, sortDir],
  );

  // Unique asset classes from results for the filter dropdown
  const availableAssetClasses = useMemo(
    () => [...new Set(allResults.map(r => r.asset_class))].sort(),
    [allResults],
  );

  const unread = alertsData?.unread_count ?? 0;
  const hasFilters = !isDefault(filters);

  function toggleSort(key: SortKey) {
    setSortBy(key);
    setSortDir(s => s === "desc" && sortBy === key ? "asc" : "desc");
  }

  function handleMatrixFilter(pattern: string, tf: string) {
    set({ patterns: [pattern], tfLabels: [tf], quickFilter: "all" });
  }

  const stats = useMemo(() => ({
    long:  filtered.filter(r => r.direction === "LONG").length,
    short: filtered.filter(r => r.direction === "SHORT").length,
    high:  filtered.filter(r => r.classification === "HIGH_CONVICTION").length,
  }), [filtered]);

  return (
    <div className="flex flex-col h-full bg-bg text-text-primary overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border px-4 py-2.5 flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Zap size={13} className="text-amber-400 shrink-0" />
          <span className="text-[12px] font-bold tracking-wider text-text-primary">PATTERN SCANNER</span>
          <span className="text-[9px] font-mono text-text-faint hidden sm:block">37 patterns · Yahoo Finance</span>
          {(scanStatus?.is_scanning || scanning) && (
            <span className="flex items-center gap-1 text-[9px] text-amber-400 font-mono animate-pulse">
              <RefreshCw size={8} className="animate-spin" />scanning…
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center gap-1 bg-surface-2 border border-border rounded px-2 h-7">
            <input
              value={scanSym}
              onChange={e => setScanSym(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && scanSym && scanOne(scanSym)}
              placeholder="Scan ticker…"
              className="bg-transparent text-[11px] font-mono w-20 outline-none text-text-primary placeholder:text-text-faint"
            />
            <button onClick={() => scanSym && scanOne(scanSym)} disabled={!scanSym || scanningOne}
              className="text-[10px] text-accent hover:text-accent/80 disabled:opacity-40">
              {scanningOne ? "…" : "GO"}
            </button>
          </div>
          <button onClick={() => setShowAlerts(a => !a)}
            className="relative flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] border bg-surface-2 border-border text-text-muted hover:text-text-primary transition-colors">
            <BellRing size={10} />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 bg-amber-500 text-black text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">
                {unread}
              </span>
            )}
          </button>
          <button onClick={() => triggerScan()} disabled={scanning}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-semibold border bg-accent/10 border-accent/40 text-accent hover:bg-accent/20 disabled:opacity-50 transition-colors">
            <RefreshCw size={9} className={scanning ? "animate-spin" : ""} />
            {scanning ? "Scanning…" : "Full Scan"}
          </button>
        </div>
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border bg-surface px-4 py-2 space-y-2">
        {/* Row 1: search + direction + score + RR */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="flex items-center gap-1.5 bg-surface-2 border border-border rounded px-2.5 py-1.5 min-w-[160px]">
            <Search size={10} className="text-text-faint shrink-0" />
            <input
              value={filters.search}
              onChange={e => set({ search: e.target.value })}
              placeholder="Search symbol or pattern…"
              className="bg-transparent text-[11px] text-text-primary outline-none w-full placeholder:text-text-faint"
            />
            {filters.search && (
              <button onClick={() => set({ search: "" })}><X size={9} className="text-text-faint hover:text-text-muted" /></button>
            )}
          </div>

          {/* Direction toggle */}
          <div className="flex items-center rounded border border-border overflow-hidden">
            {(["ALL", "LONG", "SHORT"] as const).map(d => (
              <button
                key={d}
                onClick={() => set({ direction: d })}
                className={cn(
                  "px-2.5 py-1.5 text-[10px] font-semibold transition-colors",
                  filters.direction === d
                    ? d === "LONG" ? "bg-emerald-600 text-white"
                      : d === "SHORT" ? "bg-red-700 text-white"
                      : "bg-accent text-white"
                    : "bg-surface-2 text-text-muted hover:text-text-primary",
                )}
              >
                {d === "ALL" ? "Both" : d}
              </button>
            ))}
          </div>

          {/* Score slider */}
          <div className="flex items-center gap-2 bg-surface-2 border border-border rounded px-2.5 py-1.5">
            <span className="text-[9px] text-text-faint uppercase tracking-wider whitespace-nowrap">Score</span>
            <input
              type="range" min={0} max={100} step={5}
              value={filters.minScore}
              onChange={e => set({ minScore: Number(e.target.value) })}
              className="w-20 h-1 accent-blue-500 cursor-pointer"
            />
            <span className="text-[11px] font-mono font-bold text-accent w-8 text-right">{filters.minScore}+</span>
          </div>

          {/* R:R minimum */}
          <div className="flex items-center rounded border border-border overflow-hidden">
            {RR_OPTS.map(o => (
              <button
                key={o.value}
                onClick={() => set({ minRR: o.value })}
                className={cn(
                  "px-2 py-1.5 text-[10px] transition-colors whitespace-nowrap",
                  filters.minRR === o.value
                    ? "bg-accent text-white font-semibold"
                    : "bg-surface-2 text-text-muted hover:text-text-primary",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: multi-select dropdowns + clear */}
        <div className="flex flex-wrap items-center gap-2">
          <MultiSelect
            label="Pattern"
            selected={filters.patterns}
            onChange={v => set({ patterns: v })}
            groups={PATTERN_GROUPS}
          />
          <MultiSelect
            label="Timeframe"
            selected={filters.tfLabels}
            onChange={v => set({ tfLabels: v })}
            flat={TF_ORDER}
          />
          <MultiSelect
            label="Asset Class"
            selected={filters.assetClasses}
            onChange={v => set({ assetClasses: v })}
            flat={availableAssetClasses.map(a => a)}
          />
          <MultiSelect
            label="Conviction"
            selected={filters.conviction}
            onChange={v => set({ conviction: v })}
            flat={CONVICTION_OPTS.map(o => o.v)}
          />

          {hasFilters && (
            <button
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="flex items-center gap-1 text-[10px] text-text-faint hover:text-red-400 transition-colors ml-auto"
            >
              <X size={9} />
              Clear All
            </button>
          )}
        </div>

        {/* Quick chips */}
        <div className="flex flex-wrap gap-1.5">
          {QUICK_CHIPS.map(chip => (
            <button
              key={chip.id}
              onClick={() => set({ quickFilter: chip.id })}
              className={cn(
                "px-2.5 py-0.5 rounded-full text-[10px] font-medium border transition-colors",
                filters.quickFilter === chip.id
                  ? "bg-accent/15 border-accent/50 text-accent"
                  : "bg-transparent border-border text-text-muted hover:text-text-primary hover:border-border-2",
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Stats strip ────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border px-4 py-1.5 flex items-center gap-4">
        <span className="text-[10px] font-mono">
          <span className="text-text-faint">Showing </span>
          <span className="text-text-primary font-bold">{filtered.length}</span>
          <span className="text-text-faint"> of </span>
          <span className="text-text-primary font-bold">{allResults.length}</span>
          <span className="text-text-faint"> signals</span>
        </span>
        <span className="text-text-faint text-[9px]">·</span>
        <span className="text-[10px] text-emerald-400 font-mono">{stats.long}L</span>
        <span className="text-[10px] text-red-400 font-mono">{stats.short}S</span>
        <span className="text-[10px] text-amber-400 font-mono">{stats.high} High Conv</span>
        {isLoading && <span className="ml-auto text-[9px] text-text-faint animate-pulse">loading…</span>}
        {!isLoading && scanStatus?.last_scan_time && (
          <span className="ml-auto text-[9px] text-text-faint font-mono">
            last scan {new Date(scanStatus.last_scan_time).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* ── Pattern Matrix ─────────────────────────────────────────── */}
      <PatternMatrix results={allResults} onFilter={handleMatrixFilter} />

      {/* ── Main area ──────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead className="sticky top-0 z-10 bg-surface border-b border-border">
              <tr>
                {([
                  { label: "Symbol",  key: "symbol"        as SortKey },
                  { label: "Pattern", key: null },
                  { label: "Cat",     key: null },
                  { label: "TF",      key: null },
                  { label: "Dir",     key: null },
                  { label: "Score",   key: "pattern_score" as SortKey },
                  { label: "R:R",     key: "rr_ratio"      as SortKey },
                  { label: "Class",   key: null },
                  { label: "Entry",   key: null },
                  { label: "Stop",    key: null },
                  { label: "T2",      key: null },
                  { label: "RSI",     key: null },
                  { label: "",        key: null },
                ] as { label: string; key: SortKey | null }[]).map(({ label, key }) => (
                  <th
                    key={label}
                    onClick={() => key && toggleSort(key)}
                    className={cn(
                      "px-3 py-2 text-left text-[9px] uppercase tracking-widest text-text-faint font-semibold select-none",
                      key && "cursor-pointer hover:text-text-muted",
                    )}
                  >
                    {key ? (
                      <span className="flex items-center gap-1">
                        {label}
                        {sortBy === key
                          ? sortDir === "desc"
                            ? <ChevronDown size={8} className="text-accent" />
                            : <ChevronUp size={8} className="text-accent" />
                          : <ChevronDown size={8} className="opacity-20" />}
                      </span>
                    ) : label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const CatIcon   = CAT_ICON[r.category]  ?? Activity;
                const StatusIcon = STATUS_ICON[r.status] ?? Eye;
                const isActive  = selected?.id === r.id;
                return (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(isActive ? null : r)}
                    className={cn(
                      "border-b border-border/50 cursor-pointer transition-colors",
                      isActive ? "bg-accent/5 border-l-2 border-l-accent" : "hover:bg-surface-2",
                    )}
                  >
                    <td className="px-3 py-2 font-mono font-bold text-text-primary whitespace-nowrap">
                      <div>{r.symbol}</div>
                      <div className="text-[9px] text-text-faint font-normal">
                        {ASSET_LABELS[r.asset_class] ?? r.asset_class}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-text-primary max-w-[180px] truncate">{r.pattern}</td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1 text-text-muted">
                        <CatIcon size={10} />
                        <span className="text-[9px] uppercase tracking-wide">{r.category.slice(0, 4)}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-text-muted">{r.tf_label}</td>
                    <td className="px-3 py-2">
                      <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold uppercase", DIRECTION_COLOR[r.direction])}>
                        {r.direction === "LONG"
                          ? <span className="flex items-center gap-0.5"><TrendingUp size={8} />L</span>
                          : <span className="flex items-center gap-0.5"><TrendingDown size={8} />S</span>}
                      </span>
                    </td>
                    <td className="px-3 py-2"><OverallScoreBadge score={r.pattern_score} /></td>
                    <td className="px-3 py-2 font-mono text-text-primary">{fmt(r.rr_ratio, 1)}x</td>
                    <td className="px-3 py-2">
                      <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-semibold", CLASS_COLOR[r.classification])}>
                        {r.classification === "HIGH_CONVICTION" ? "HIGH" : r.classification === "MODERATE" ? "MOD" : "LOW"}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-text-muted">{fmt(r.entry, 4)}</td>
                    <td className="px-3 py-2 font-mono text-red-400/80">{fmt(r.stop, 4)}</td>
                    <td className="px-3 py-2 font-mono text-emerald-400/80">{fmt(r.target2, 4)}</td>
                    <td className="px-3 py-2 font-mono text-text-muted">
                      {r.rsi != null ? (
                        <span className={r.rsi < 30 ? "text-emerald-400" : r.rsi > 70 ? "text-red-400" : ""}>
                          {fmt(r.rsi, 1)}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => updateResult({ id: r.id, data: { is_starred: !r.is_starred } })}
                        className={cn("transition-colors", r.is_starred ? "text-amber-400" : "text-text-faint hover:text-amber-400")}
                      >
                        <Star size={10} fill={r.is_starred ? "currentColor" : "none"} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-4 py-16 text-center text-[11px]">
                    {scanStatus?.is_scanning
                      ? <span className="text-amber-400 animate-pulse">Scanning markets for patterns… results will appear shortly.</span>
                      : allResults.length === 0
                      ? <span className="text-text-faint">No patterns yet. Click <strong className="text-text-primary">Full Scan</strong> or scan a single ticker above.</span>
                      : <span className="text-text-faint">No signals match the current filters. <button onClick={() => setFilters(DEFAULT_FILTERS)} className="text-accent hover:underline">Clear filters</button></span>
                    }
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Detail drawer */}
        {selected && (
          <div className="w-80 shrink-0 border-l border-border overflow-y-auto bg-surface">
            <DetailDrawer
              result={selected}
              onClose={() => setSelected(null)}
              onUpdate={data => updateResult({ id: selected.id, data })}
            />
          </div>
        )}

        {/* Alerts panel */}
        {showAlerts && (
          <div className="w-72 shrink-0 border-l border-border overflow-y-auto bg-surface">
            <AlertsPanel
              alerts={alertsData?.alerts ?? []}
              unread={unread}
              onClose={() => setShowAlerts(false)}
              onMarkRead={ids => api.markAlertsRead(ids).then(() => qc.invalidateQueries({ queryKey: ["scanner-alerts"] }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────

function DetailDrawer({
  result: r, onClose, onUpdate,
}: {
  result: ScannerResult;
  onClose: () => void;
  onUpdate: (data: { status?: string; is_starred?: boolean; commentary?: string }) => void;
}) {
  const [commentary, setCommentary] = useState(r.commentary ?? "");
  const risk = Math.abs(r.entry - r.stop);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[13px] font-bold text-text-primary">{r.symbol}</div>
          <div className="text-[11px] text-text-muted">{r.pattern}</div>
          <div className="text-[9px] text-text-faint mt-0.5 font-mono">{r.tf_label} · {r.asset_class}</div>
        </div>
        <button onClick={onClose} className="text-text-faint hover:text-text-primary"><X size={12} /></button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn("px-2 py-1 rounded text-[10px] font-bold uppercase", DIRECTION_COLOR[r.direction])}>
          {r.direction}
        </span>
        <span className={cn("px-2 py-1 rounded text-[10px] font-semibold", CLASS_COLOR[r.classification])}>
          {r.classification.replace("_", " ")}
        </span>
        <span className="px-2 py-1 rounded text-[10px] text-text-muted bg-surface-2 border border-border font-mono">
          {r.category}
        </span>
      </div>

      <div className="bg-surface-2 border border-border rounded-lg p-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] text-text-faint uppercase tracking-widest">Confidence</span>
          <span className="text-2xl font-bold font-mono text-text-primary">{Math.round(r.pattern_score)}</span>
        </div>
        <div className="space-y-2">
          <ScorePill value={r.pattern_quality} label="Pattern Quality" />
          <ScorePill value={r.trend_quality}   label="Trend Quality" />
          <ScorePill value={r.volume_conf}     label="Volume Confirmation" />
          <ScorePill value={r.breakout_prob}   label="Breakout Probability" />
          <ScorePill value={r.rr_score}        label="R:R Score" />
        </div>
      </div>

      <div className="bg-surface-2 border border-border rounded-lg p-3 space-y-1.5">
        <div className="text-[9px] text-text-faint uppercase tracking-widest mb-2">Trade Parameters</div>
        {[
          { label: "Entry",    value: fmt(r.entry, 5),    color: "text-text-primary" },
          { label: "Stop",     value: fmt(r.stop, 5),     color: "text-red-400" },
          { label: "Risk",     value: fmt(risk, 5),       color: "text-red-400/70" },
          { label: "Target 1", value: fmt(r.target1, 5),  color: "text-emerald-400/70" },
          { label: "Target 2", value: fmt(r.target2, 5),  color: "text-emerald-400" },
          { label: "Target 3", value: fmt(r.target3, 5),  color: "text-emerald-400" },
          { label: "R:R",      value: `${fmt(r.rr_ratio, 1)}x`, color: "text-blue-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex justify-between items-center">
            <span className="text-[10px] text-text-muted">{label}</span>
            <span className={cn("text-[11px] font-mono font-semibold", color)}>{value}</span>
          </div>
        ))}
      </div>

      <div className="bg-surface-2 border border-border rounded-lg p-3 space-y-1.5">
        <div className="text-[9px] text-text-faint uppercase tracking-widest mb-2">Indicators</div>
        {[
          { label: "RSI (14)", value: r.rsi != null ? fmt(r.rsi, 1) : "—",
            color: r.rsi != null && r.rsi < 30 ? "text-emerald-400" : r.rsi != null && r.rsi > 70 ? "text-red-400" : "text-text-primary" },
          { label: "ADX (14)", value: r.adx != null ? fmt(r.adx, 1) : "—",
            color: r.adx != null && r.adx > 25 ? "text-amber-400" : "text-text-muted" },
          { label: "ATR (14)", value: r.atr != null ? fmt(r.atr, 5) : "—", color: "text-text-muted" },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex justify-between items-center">
            <span className="text-[10px] text-text-muted">{label}</span>
            <span className={cn("text-[11px] font-mono font-semibold", color)}>{value}</span>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <div className="text-[9px] text-text-faint uppercase tracking-widest">Status</div>
        <div className="flex flex-wrap gap-1.5">
          {(["WATCH", "TRIGGERED", "CONFIRMED", "FAILED", "EXPIRED"] as const).map(s => (
            <button
              key={s}
              onClick={() => onUpdate({ status: s })}
              className={cn(
                "px-2 py-1 rounded text-[9px] uppercase tracking-wide border transition-colors",
                r.status === s
                  ? `${STATUS_COLOR[s]} bg-surface-3 border-border`
                  : "text-text-faint border-border/50 hover:border-border hover:text-text-muted",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="text-[9px] text-text-faint uppercase tracking-widest">Commentary</div>
        <textarea
          rows={3}
          value={commentary}
          onChange={e => setCommentary(e.target.value)}
          placeholder="Add commentary…"
          className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-[11px] text-text-primary resize-none outline-none focus:border-accent/50 placeholder:text-text-faint font-mono"
        />
        <button onClick={() => onUpdate({ commentary })}
          className="text-[10px] text-accent hover:text-accent/80 transition-colors">
          Save note
        </button>
      </div>

      <div className="text-[9px] text-text-faint font-mono pt-1">
        Detected: {new Date(r.detected_at).toLocaleString()}
      </div>
    </div>
  );
}

// ── Alerts panel ──────────────────────────────────────────────────────────────

function AlertsPanel({
  alerts, unread, onClose, onMarkRead,
}: {
  alerts: ScannerAlert[];
  unread: number;
  onClose: () => void;
  onMarkRead: (ids: string[]) => void;
}) {
  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BellRing size={11} className="text-amber-400" />
          <span className="text-[11px] font-semibold text-text-primary">Alerts</span>
          {unread > 0 && (
            <span className="bg-amber-500 text-black text-[8px] font-bold rounded-full px-1.5 py-0.5">{unread}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unread > 0 && (
            <button onClick={() => onMarkRead(alerts.filter(a => !a.is_read).map(a => a.id))}
              className="text-[9px] text-text-faint hover:text-text-muted">Mark all read</button>
          )}
          <button onClick={onClose} className="text-text-faint hover:text-text-primary"><X size={11} /></button>
        </div>
      </div>

      {alerts.length === 0 && (
        <div className="text-center py-8 text-text-faint text-[11px]">No alerts</div>
      )}

      <div className="space-y-1.5">
        {alerts.map(a => (
          <div
            key={a.id}
            className={cn(
              "rounded px-3 py-2.5 border text-[10px]",
              a.is_read ? "bg-surface border-border/50 text-text-muted" : "bg-surface-2 border-border text-text-primary",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="flex-1">{a.message}</span>
              {!a.is_read && (
                <button onClick={() => onMarkRead([a.id])} className="text-text-faint hover:text-text-muted shrink-0">
                  <CheckCircle size={10} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 text-[9px] text-text-faint">
              <span className="font-mono">{a.alert_type}</span>
              {a.pattern_score != null && <span>{Math.round(a.pattern_score)} pts</span>}
              <span className="ml-auto">{new Date(a.created_at).toLocaleTimeString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

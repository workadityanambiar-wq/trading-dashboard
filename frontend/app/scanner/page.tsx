"use client";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ScannerResult, ScannerAlert } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Zap, RefreshCw, BellRing, Star, ChevronUp, ChevronDown,
  TrendingUp, TrendingDown, Filter, X, AlertTriangle, CheckCircle,
  XCircle, Clock, Eye, Activity, Crosshair, BarChart3,
} from "lucide-react";

// ── helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined, d = 2) =>
  n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

const fmtScore = (s: number) => Math.round(s);

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
  WATCH:     "text-text-muted",
  TRIGGERED: "text-amber-400",
  CONFIRMED: "text-emerald-400",
  FAILED:    "text-red-400",
  EXPIRED:   "text-text-faint",
};

const STATUS_ICON: Record<string, React.ElementType> = {
  WATCH:     Eye,
  TRIGGERED: AlertTriangle,
  CONFIRMED: CheckCircle,
  FAILED:    XCircle,
  EXPIRED:   Clock,
};

const CAT_ICON: Record<string, React.ElementType> = {
  CANDLESTICK: Activity,
  CHART:       BarChart3,
  INDICATOR:   TrendingUp,
  BREAKOUT:    Zap,
};

function ScorePill({ value, label }: { value: number; label: string }) {
  const color = value >= 75 ? "bg-emerald-500" : value >= 50 ? "bg-blue-500" : "bg-red-500/70";
  return (
    <div className="flex-1">
      <div className="flex justify-between text-[9px] text-text-muted mb-0.5">
        <span>{label}</span>
        <span className="font-mono text-text-primary">{fmtScore(value)}</span>
      </div>
      <div className="h-1 bg-surface-3 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function OverallScoreBadge({ score }: { score: number }) {
  const color = score >= 75 ? "text-amber-300 border-amber-700 bg-amber-900/20"
              : score >= 50 ? "text-blue-300 border-blue-700 bg-blue-900/20"
              : "text-text-muted border-border bg-surface-3";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-bold font-mono", color)}>
      {fmtScore(score)}
    </span>
  );
}

type SortKey = "pattern_score" | "rr_ratio" | "detected_at" | "symbol";

// ── main page ─────────────────────────────────────────────────────────────────

export default function ScannerPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<ScannerResult | null>(null);
  const [showAlerts, setShowAlerts] = useState(false);
  const [filters, setFilters] = useState({
    direction: "", category: "", timeframe: "", asset_class: "", status: "",
    min_score: 40, sort_by: "pattern_score" as SortKey, sort_dir: "desc",
  });
  const [showFilters, setShowFilters] = useState(false);
  const [scanSym, setScanSym] = useState("");

  const { data: results = [], isLoading, refetch } = useQuery({
    queryKey: ["scanner-results", filters],
    queryFn: () => api.getScannerResults({
      direction:   filters.direction   || undefined,
      category:    filters.category    || undefined,
      timeframe:   filters.timeframe   || undefined,
      asset_class: filters.asset_class || undefined,
      status:      filters.status      || undefined,
      min_score:   filters.min_score,
      sort_by:     filters.sort_by,
      sort_dir:    filters.sort_dir,
      limit: 500,
    }),
    refetchInterval: 60_000,
  });

  const { data: alertsData } = useQuery({
    queryKey: ["scanner-alerts"],
    queryFn: () => api.getScannerAlerts(),
    refetchInterval: 30_000,
  });

  const { mutate: triggerScan, isPending: scanning } = useMutation({
    mutationFn: () => api.triggerScan({ min_score: filters.min_score }),
    onSuccess: () => setTimeout(() => qc.invalidateQueries({ queryKey: ["scanner-results"] }), 3000),
  });

  const { mutate: scanOne, isPending: scanningOne } = useMutation({
    mutationFn: (sym: string) => api.scanSymbol(sym),
    onSuccess: () => {
      setScanSym("");
      qc.invalidateQueries({ queryKey: ["scanner-results"] });
    },
  });

  const { mutate: updateResult } = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.updateScannerResult>[1] }) =>
      api.updateScannerResult(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scanner-results"] }),
  });

  function toggleSort(key: SortKey) {
    setFilters(f => ({
      ...f,
      sort_by: key,
      sort_dir: f.sort_by === key ? (f.sort_dir === "desc" ? "asc" : "desc") : "desc",
    }));
  }

  const stats = useMemo(() => ({
    total:  results.length,
    long:   results.filter(r => r.direction === "LONG").length,
    short:  results.filter(r => r.direction === "SHORT").length,
    high:   results.filter(r => r.classification === "HIGH_CONVICTION").length,
    avgScore: results.length ? (results.reduce((s, r) => s + r.pattern_score, 0) / results.length) : 0,
  }), [results]);

  const unread = alertsData?.unread_count ?? 0;

  return (
    <div className="flex flex-col h-full bg-bg text-text-primary overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Zap size={14} className="text-amber-400 shrink-0" />
          <span className="text-[13px] font-bold tracking-wider text-text-primary">PATTERN SCANNER</span>
          <span className="text-[9px] font-mono text-text-faint uppercase tracking-widest mt-0.5">37 patterns · MT5</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Single-symbol scan */}
          <div className="flex items-center gap-1 bg-surface-2 border border-border rounded px-2 h-7">
            <input
              value={scanSym}
              onChange={e => setScanSym(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && scanSym && scanOne(scanSym)}
              placeholder="EURUSD…"
              className="bg-transparent text-[11px] font-mono w-20 outline-none text-text-primary placeholder:text-text-faint"
            />
            <button
              onClick={() => scanSym && scanOne(scanSym)}
              disabled={!scanSym || scanningOne}
              className="text-[10px] text-accent hover:text-accent/80 disabled:opacity-40"
            >
              {scanningOne ? "…" : "GO"}
            </button>
          </div>

          <button
            onClick={() => setShowFilters(f => !f)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] border transition-colors",
              showFilters
                ? "bg-accent/10 border-accent/40 text-accent"
                : "bg-surface-2 border-border text-text-muted hover:text-text-primary"
            )}
          >
            <Filter size={10} />
            Filters
          </button>

          <button
            onClick={() => setShowAlerts(a => !a)}
            className={cn(
              "relative flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] border transition-colors",
              "bg-surface-2 border-border text-text-muted hover:text-text-primary"
            )}
          >
            <BellRing size={10} />
            Alerts
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 bg-amber-500 text-black text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">
                {unread}
              </span>
            )}
          </button>

          <button
            onClick={() => triggerScan()}
            disabled={scanning}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-semibold border transition-colors",
              "bg-accent/10 border-accent/40 text-accent hover:bg-accent/20 disabled:opacity-50"
            )}
          >
            <RefreshCw size={10} className={scanning ? "animate-spin" : ""} />
            {scanning ? "Scanning…" : "Full Scan"}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="shrink-0 border-b border-border px-4 py-2 flex items-center gap-6">
        {[
          { label: "TOTAL", value: stats.total, color: "text-text-primary" },
          { label: "LONG",  value: stats.long,  color: "text-emerald-400" },
          { label: "SHORT", value: stats.short, color: "text-red-400" },
          { label: "HIGH CONVICTION", value: stats.high, color: "text-amber-400" },
          { label: "AVG SCORE", value: fmt(stats.avgScore, 1), color: "text-blue-400" },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-widest text-text-faint">{s.label}</span>
            <span className={cn("text-[13px] font-bold font-mono", s.color)}>{s.value}</span>
          </div>
        ))}
        {isLoading && <span className="text-[10px] text-text-faint font-mono ml-auto animate-pulse">loading…</span>}
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="shrink-0 border-b border-border bg-surface px-4 py-3 flex flex-wrap gap-3 items-end">
          {[
            { label: "Direction", key: "direction", opts: ["", "LONG", "SHORT"] },
            { label: "Category", key: "category", opts: ["", "CANDLESTICK", "CHART", "INDICATOR", "BREAKOUT"] },
            { label: "Timeframe", key: "timeframe", opts: ["", "M15", "H1", "H4", "D1"] },
            { label: "Asset Class", key: "asset_class", opts: ["", "FOREX", "METALS", "ENERGY", "INDEX", "CRYPTO", "EQUITY"] },
            { label: "Status", key: "status", opts: ["", "WATCH", "TRIGGERED", "CONFIRMED", "FAILED", "EXPIRED"] },
          ].map(({ label, key, opts }) => (
            <div key={key} className="flex flex-col gap-1">
              <span className="text-[9px] text-text-faint uppercase tracking-wider">{label}</span>
              <select
                value={(filters as Record<string, string>)[key]}
                onChange={e => setFilters(f => ({ ...f, [key]: e.target.value }))}
                className="bg-surface-2 border border-border rounded px-2 py-1 text-[11px] text-text-primary font-mono outline-none"
              >
                {opts.map(o => <option key={o} value={o}>{o || "All"}</option>)}
              </select>
            </div>
          ))}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-text-faint uppercase tracking-wider">Min Score</span>
            <select
              value={filters.min_score}
              onChange={e => setFilters(f => ({ ...f, min_score: Number(e.target.value) }))}
              className="bg-surface-2 border border-border rounded px-2 py-1 text-[11px] text-text-primary font-mono outline-none"
            >
              {[0, 40, 50, 60, 70, 80].map(v => <option key={v} value={v}>{v}+</option>)}
            </select>
          </div>
          <button
            onClick={() => setFilters(f => ({ ...f, direction: "", category: "", timeframe: "", asset_class: "", status: "", min_score: 40 }))}
            className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-primary"
          >
            <X size={10} /> Reset
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Main grid */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead className="sticky top-0 z-10 bg-surface border-b border-border">
              <tr>
                {[
                  { label: "Symbol",  key: "symbol" as SortKey },
                  { label: "Pattern", key: null },
                  { label: "Cat",     key: null },
                  { label: "TF",      key: null },
                  { label: "Dir",     key: null },
                  { label: "Score",   key: "pattern_score" as SortKey },
                  { label: "R:R",     key: "rr_ratio" as SortKey },
                  { label: "Class",   key: null },
                  { label: "Entry",   key: null },
                  { label: "Stop",    key: null },
                  { label: "T2",      key: null },
                  { label: "Status",  key: null },
                  { label: "",        key: null },
                ].map(({ label, key }) => (
                  <th
                    key={label}
                    onClick={() => key && toggleSort(key)}
                    className={cn(
                      "px-3 py-2 text-left text-[9px] uppercase tracking-widest text-text-faint font-semibold select-none",
                      key && "cursor-pointer hover:text-text-muted"
                    )}
                  >
                    {key ? (
                      <span className="flex items-center gap-1">
                        {label}
                        {filters.sort_by === key
                          ? filters.sort_dir === "desc" ? <ChevronDown size={8} className="text-accent" /> : <ChevronUp size={8} className="text-accent" />
                          : <ChevronDown size={8} className="opacity-20" />}
                      </span>
                    ) : label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map(r => {
                const CatIcon = CAT_ICON[r.category] ?? Activity;
                const StatusIcon = STATUS_ICON[r.status] ?? Eye;
                const isActive = selected?.id === r.id;
                return (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(isActive ? null : r)}
                    className={cn(
                      "border-b border-border/50 cursor-pointer transition-colors",
                      isActive ? "bg-accent/5 border-l-2 border-l-accent" : "hover:bg-surface-2"
                    )}
                  >
                    <td className="px-3 py-2 font-mono font-bold text-text-primary whitespace-nowrap">
                      <div>{r.symbol}</div>
                      <div className="text-[9px] text-text-faint font-normal">{r.asset_class}</div>
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
                        {r.direction === "LONG" ? <span className="flex items-center gap-0.5"><TrendingUp size={8} />L</span> : <span className="flex items-center gap-0.5"><TrendingDown size={8} />S</span>}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <OverallScoreBadge score={r.pattern_score} />
                    </td>
                    <td className="px-3 py-2 font-mono text-text-primary">{fmt(r.rr_ratio, 1)}x</td>
                    <td className="px-3 py-2">
                      <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-semibold", CLASS_COLOR[r.classification])}>
                        {r.classification === "HIGH_CONVICTION" ? "HIGH" : r.classification === "MODERATE" ? "MOD" : "LOW"}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-text-muted">{fmt(r.entry, 4)}</td>
                    <td className="px-3 py-2 font-mono text-red-400/80">{fmt(r.stop, 4)}</td>
                    <td className="px-3 py-2 font-mono text-emerald-400/80">{fmt(r.target2, 4)}</td>
                    <td className="px-3 py-2">
                      <span className={cn("flex items-center gap-1", STATUS_COLOR[r.status])}>
                        <StatusIcon size={9} />
                        <span className="text-[9px] uppercase">{r.status}</span>
                      </span>
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
              {!isLoading && results.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-4 py-16 text-center text-text-faint text-[11px]">
                    No patterns detected. Click "Full Scan" to run MT5 scan, or scan a specific symbol above.
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
              onUpdate={(data) => updateResult({ id: selected.id, data })}
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
              onMarkRead={(ids) => {
                api.markAlertsRead(ids).then(() => qc.invalidateQueries({ queryKey: ["scanner-alerts"] }));
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────

function DetailDrawer({
  result: r,
  onClose,
  onUpdate,
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

      {/* Direction + Class badges */}
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

      {/* Score ring */}
      <div className="bg-surface-2 border border-border rounded-lg p-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] text-text-faint uppercase tracking-widest">Confidence</span>
          <span className="text-2xl font-bold font-mono text-text-primary">{fmtScore(r.pattern_score)}</span>
        </div>
        <div className="space-y-2">
          <ScorePill value={r.pattern_quality} label="Pattern Quality" />
          <ScorePill value={r.trend_quality}   label="Trend Quality" />
          <ScorePill value={r.volume_conf}     label="Volume Confirmation" />
          <ScorePill value={r.breakout_prob}   label="Breakout Probability" />
          <ScorePill value={r.rr_score}        label="R:R Score" />
        </div>
      </div>

      {/* Trade params */}
      <div className="bg-surface-2 border border-border rounded-lg p-3 space-y-1.5">
        <div className="text-[9px] text-text-faint uppercase tracking-widest mb-2">Trade Parameters</div>
        {[
          { label: "Entry",    value: fmt(r.entry, 5), color: "text-text-primary" },
          { label: "Stop",     value: fmt(r.stop, 5),  color: "text-red-400" },
          { label: "Risk",     value: fmt(risk, 5),    color: "text-red-400/70" },
          { label: "Target 1", value: fmt(r.target1, 5), color: "text-emerald-400/70" },
          { label: "Target 2", value: fmt(r.target2, 5), color: "text-emerald-400" },
          { label: "Target 3", value: fmt(r.target3, 5), color: "text-emerald-400" },
          { label: "R:R",      value: `${fmt(r.rr_ratio, 1)}x`, color: "text-blue-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex justify-between items-center">
            <span className="text-[10px] text-text-muted">{label}</span>
            <span className={cn("text-[11px] font-mono font-semibold", color)}>{value}</span>
          </div>
        ))}
      </div>

      {/* Indicators */}
      <div className="bg-surface-2 border border-border rounded-lg p-3 space-y-1.5">
        <div className="text-[9px] text-text-faint uppercase tracking-widest mb-2">Indicators</div>
        {[
          { label: "RSI (14)",  value: r.rsi != null ? fmt(r.rsi, 1) : "—", color: r.rsi != null && r.rsi < 30 ? "text-emerald-400" : r.rsi != null && r.rsi > 70 ? "text-red-400" : "text-text-primary" },
          { label: "ADX (14)",  value: r.adx != null ? fmt(r.adx, 1) : "—", color: r.adx != null && r.adx > 25 ? "text-amber-400" : "text-text-muted" },
          { label: "ATR (14)",  value: r.atr != null ? fmt(r.atr, 5) : "—", color: "text-text-muted" },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex justify-between items-center">
            <span className="text-[10px] text-text-muted">{label}</span>
            <span className={cn("text-[11px] font-mono font-semibold", color)}>{value}</span>
          </div>
        ))}
      </div>

      {/* Status control */}
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
                  : "text-text-faint border-border/50 hover:border-border hover:text-text-muted"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Commentary */}
      <div className="space-y-1.5">
        <div className="text-[9px] text-text-faint uppercase tracking-widest">Commentary</div>
        <textarea
          rows={3}
          value={commentary}
          onChange={e => setCommentary(e.target.value)}
          placeholder="Add commentary…"
          className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-[11px] text-text-primary resize-none outline-none focus:border-accent/50 placeholder:text-text-faint font-mono"
        />
        <button
          onClick={() => onUpdate({ commentary })}
          className="text-[10px] text-accent hover:text-accent/80 transition-colors"
        >
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
  alerts,
  unread,
  onClose,
  onMarkRead,
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
            <button
              onClick={() => onMarkRead(alerts.filter(a => !a.is_read).map(a => a.id))}
              className="text-[9px] text-text-faint hover:text-text-muted"
            >
              Mark all read
            </button>
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
              a.is_read
                ? "bg-surface border-border/50 text-text-muted"
                : "bg-surface-2 border-border text-text-primary"
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

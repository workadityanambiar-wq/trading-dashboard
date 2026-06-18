"use client";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  api,
  type EarningsCalendarStock,
  type OptionsFlowItem,
  type EarningsIntelligenceItem,
  type EarningsHistoryPoint,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  RefreshCw, Calendar, AlertTriangle, ChevronDown, ChevronUp,
  TrendingUp, Activity, Brain,
} from "lucide-react";
import { HistoryDrawer, type DrawerConfig } from "@/components/HistoryDrawer";

// ── Shared helpers ────────────────────────────────────────────────────────────

function pct(v: number | null, dec = 1): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(dec)}%`;
}
function num(v: number | null, dec = 1): string {
  if (v == null) return "—";
  return v.toFixed(dec);
}
function clr(v: number | null, invert = false): string {
  if (v == null) return "text-text-muted";
  const pos = invert ? v < 0 : v > 0;
  return pos ? "text-emerald-400" : "text-red-400";
}
function formatDate(dateStr: string, daysFromToday: number): string {
  if (daysFromToday === 0) return "Today";
  if (daysFromToday === 1) return "Tomorrow";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const SETUP_COLOR: Record<string, string> = {
  "Early Breakout":             "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  "Volatility Squeeze":         "text-amber-400 bg-amber-500/10 border-amber-500/30",
  "Momentum Continuation":      "text-blue-400 bg-blue-500/10 border-blue-500/30",
  "Institutional Accumulation": "text-purple-400 bg-purple-500/10 border-purple-500/30",
  "Mean Reversion Bounce":      "text-teal-400 bg-teal-500/10 border-teal-500/30",
  "Failed Breakdown Reversal":  "text-orange-400 bg-orange-500/10 border-orange-500/30",
  "No Setup":                   "text-text-muted bg-surface border-border",
};

function SetupBadge({ setup }: { setup: string }) {
  const cls = SETUP_COLOR[setup] ?? "text-text-muted bg-surface border-border";
  const short: Record<string, string> = {
    "Early Breakout": "EB", "Volatility Squeeze": "VS",
    "Momentum Continuation": "MC", "Institutional Accumulation": "IA",
    "Mean Reversion Bounce": "MR", "Failed Breakdown Reversal": "FB", "No Setup": "—",
  };
  return (
    <span className={cn("px-1.5 py-0.5 rounded border text-[10px] font-semibold leading-none", cls)} title={setup}>
      {short[setup] ?? setup.slice(0, 2)}
    </span>
  );
}

function ScoreMini({ score }: { score: number | null }) {
  if (score == null) return <span className="text-text-muted">—</span>;
  const w = Math.round(Math.max(0, Math.min(100, score)));
  const color = w >= 75 ? "bg-emerald-500" : w >= 60 ? "bg-amber-500" : "bg-slate-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-10 h-1 rounded-full bg-surface-2 overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${w}%` }} />
      </div>
      <span className="text-xs tabular-nums">{w}</span>
    </div>
  );
}

// ── Options Flow Cells ────────────────────────────────────────────────────────

function ExpMoveBadge({ pct: p, loading }: { pct: number | null; loading: boolean }) {
  if (loading) return <span className="text-text-muted/40 text-[10px]">…</span>;
  if (p == null) return <span className="text-text-muted">—</span>;
  const color = p >= 10 ? "text-red-400 bg-red-500/10 border-red-500/30"
              : p >= 5  ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
              :            "text-green-400 bg-green-500/10 border-green-500/30";
  return (
    <span className={cn("px-1.5 py-0.5 rounded border text-[10px] font-semibold tabular-nums", color)}>
      ±{p.toFixed(1)}%
    </span>
  );
}

// ── Intelligence Components ───────────────────────────────────────────────────

// Mini bar chart of last N earnings reactions
function EarningsBars({ history }: { history: EarningsHistoryPoint[] }) {
  if (!history.length) return <span className="text-text-muted text-[10px]">no data</span>;
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date)); // oldest→newest
  const maxAbs = Math.max(...sorted.map(h => Math.abs(h.day_ret)), 1);

  return (
    <div className="flex items-end gap-0.5 h-7">
      {sorted.map((h, i) => {
        const heightPct = Math.max(10, (Math.abs(h.day_ret) / maxAbs) * 100);
        return (
          <div
            key={i}
            title={`${h.date}: ${h.day_ret > 0 ? "+" : ""}${h.day_ret.toFixed(1)}% | ${h.beat == null ? "?" : h.beat ? "Beat" : "Miss"}`}
            style={{ height: `${heightPct}%` }}
            className={cn(
              "w-3 rounded-sm flex-shrink-0",
              h.day_ret >= 0 ? "bg-emerald-500" : "bg-red-500",
              h.beat === false && "opacity-50",
            )}
          />
        );
      })}
    </div>
  );
}

// Signal badge: composite intelligence rating
function computeSignal(intel: EarningsIntelligenceItem | undefined): { label: string; cls: string } {
  if (!intel || intel.n_quarters < 3) return { label: "Thin Data", cls: "text-text-muted bg-surface border-border" };

  let score = 0;
  if ((intel.beat_rate ?? 0) >= 0.65)                              score++;
  if ((intel.pre_drift_5d ?? 0) > 0.5)                            score++;
  if (intel.revisions_up_30d > intel.revisions_down_30d)           score++;
  if ((intel.gap_persistence_5d ?? 50) >= 60)                      score++;

  if (score >= 4) return { label: "Strong Setup",  cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" };
  if (score === 3) return { label: "Bullish",       cls: "text-green-400 bg-green-500/10 border-green-500/30" };
  if (score === 2) return { label: "Neutral",       cls: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30" };
  if (score === 1) return { label: "Weak",          cls: "text-orange-400 bg-orange-500/10 border-orange-500/30" };
  return            { label: "Avoid",           cls: "text-red-400 bg-red-500/10 border-red-500/30" };
}

function SignalBadge({ intel }: { intel: EarningsIntelligenceItem | undefined }) {
  const { label, cls } = computeSignal(intel);
  return (
    <span className={cn("px-1.5 py-0.5 rounded border text-[10px] font-semibold", cls)}>
      {label}
    </span>
  );
}

// Drift arrow
function Drift({ v, dec = 1 }: { v: number | null; dec?: number }) {
  if (v == null) return <span className="text-text-muted">—</span>;
  const arrow = v > 0 ? "▲" : "▼";
  return (
    <span className={cn("tabular-nums text-[11px]", v > 0 ? "text-emerald-400" : "text-red-400")}>
      {arrow}{Math.abs(v).toFixed(dec)}%
    </span>
  );
}

// Gap persistence pill
function GapPct({ v }: { v: number | null }) {
  if (v == null) return <span className="text-text-muted">—</span>;
  const color = v >= 70 ? "text-emerald-400" : v >= 55 ? "text-yellow-400" : "text-red-400";
  return <span className={cn("tabular-nums font-mono text-xs", color)}>{v.toFixed(0)}%</span>;
}

// Beat rate
function BeatRate({ v }: { v: number | null }) {
  if (v == null) return <span className="text-text-muted">—</span>;
  const pct = Math.round(v * 100);
  const color = pct >= 70 ? "text-emerald-400" : pct >= 50 ? "text-yellow-400" : "text-red-400";
  return <span className={cn("tabular-nums font-mono text-xs", color)}>{pct}%</span>;
}

// Revision trend
function Revisions({ up, down }: { up: number; down: number }) {
  if (up === 0 && down === 0) return <span className="text-text-muted text-xs">—</span>;
  return (
    <div className="flex items-center gap-1 text-[11px]">
      {up > 0  && <span className="text-emerald-400 font-mono">▲{up}</span>}
      {down > 0 && <span className="text-red-400 font-mono">▼{down}</span>}
    </div>
  );
}

// Expanded intelligence detail for one ticker
function IntelDetail({ intel }: { intel: EarningsIntelligenceItem }) {
  const { history } = intel;

  return (
    <div className="px-6 py-4 bg-surface-2 border-t border-border">
      <div className="flex gap-10 flex-wrap">

        {/* Stat grid */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs min-w-[260px]">
          <StatRow label="Pre-Earnings Drift (5d)"  value={<Drift v={intel.pre_drift_5d} />} />
          <StatRow label="Pre-Earnings Drift (10d)" value={<Drift v={intel.pre_drift_10d} />} />
          <StatRow label="Hist. Avg Abs Move"
            value={<span className="tabular-nums text-text-primary">{intel.hist_avg_abs_move != null ? `±${intel.hist_avg_abs_move.toFixed(1)}%` : "—"}</span>} />
          <StatRow label="Hist. Avg Move (dir.)"
            value={<Drift v={intel.hist_avg_move} />} />
          <StatRow label="EPS Beat Rate"   value={<BeatRate v={intel.beat_rate} />} />
          <StatRow label="Gap Persist (5d)"  value={<GapPct v={intel.gap_persistence_5d} />} />
          <StatRow label="Gap Persist (10d)" value={<GapPct v={intel.gap_persistence_10d} />} />
          <StatRow label="Revisions (30d)"
            value={<Revisions up={intel.revisions_up_30d} down={intel.revisions_down_30d} />} />
          <StatRow label="Quarters analysed"
            value={<span className="text-text-primary font-mono">{intel.n_quarters}</span>} />
        </div>

        {/* History table */}
        {history.length > 0 && (
          <div className="text-xs">
            <p className="text-text-muted uppercase tracking-wider mb-2">Past Earnings Reactions</p>
            <table className="border-collapse">
              <thead>
                <tr className="text-text-muted">
                  <th className="pr-4 py-1 text-left font-medium">Date</th>
                  <th className="pr-4 py-1 text-right font-medium">Gap</th>
                  <th className="pr-4 py-1 text-right font-medium">Pre-5d</th>
                  <th className="pr-4 py-1 text-right font-medium">Post-5d</th>
                  <th className="pr-4 py-1 text-right font-medium">Post-10d</th>
                  <th className="py-1 text-center font-medium">Beat?</th>
                </tr>
              </thead>
              <tbody>
                {[...history].sort((a, b) => b.date.localeCompare(a.date)).map(h => (
                  <tr key={h.date} className="border-t border-border/30">
                    <td className="pr-4 py-1 text-text-muted font-mono">{h.date}</td>
                    <td className={cn("pr-4 py-1 text-right font-mono", h.day_ret >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {h.day_ret > 0 ? "+" : ""}{h.day_ret.toFixed(1)}%
                    </td>
                    <td className={cn("pr-4 py-1 text-right font-mono", h.pre_5d != null && h.pre_5d >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {h.pre_5d != null ? `${h.pre_5d >= 0 ? "+" : ""}${h.pre_5d.toFixed(1)}%` : "—"}
                    </td>
                    <td className={cn("pr-4 py-1 text-right font-mono", h.post_5d != null && h.post_5d >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {h.post_5d != null ? `${h.post_5d >= 0 ? "+" : ""}${h.post_5d.toFixed(1)}%` : "—"}
                    </td>
                    <td className={cn("pr-4 py-1 text-right font-mono", h.post_10d != null && h.post_10d >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {h.post_10d != null ? `${h.post_10d >= 0 ? "+" : ""}${h.post_10d.toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-1 text-center">
                      {h.beat == null ? <span className="text-text-muted">?</span>
                        : h.beat ? <span className="text-emerald-400">✓</span>
                        : <span className="text-red-400">✗</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-text-muted">{label}</span>
      {value}
    </div>
  );
}

// ── Intelligence flat table ───────────────────────────────────────────────────

function IntelligenceTable({
  calendar, intelligence, optionsFlow, intelLoading, intelFetching,
}: {
  calendar: { date: string; days_from_today: number; stocks: EarningsCalendarStock[] }[];
  intelligence: Record<string, EarningsIntelligenceItem>;
  optionsFlow: Record<string, OptionsFlowItem>;
  intelLoading: boolean;
  intelFetching: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"days" | "signal" | "hist_move" | "beat_rate">("days");
  const [drawer, setDrawer] = useState<DrawerConfig | null>(null);

  // Flatten calendar → list of rows enriched with intelligence
  const rows = useMemo(() => {
    const flat: Array<{
      stock: EarningsCalendarStock;
      date: string;
      days_from_today: number;
      intel: EarningsIntelligenceItem | undefined;
      flow: OptionsFlowItem | undefined;
      signalScore: number;
    }> = [];

    for (const day of calendar) {
      for (const s of day.stocks) {
        const intel = intelligence[s.ticker];
        const flow  = optionsFlow[s.ticker];
        const sig   = computeSignal(intel);
        const sigScore =
          sig.label === "Strong Setup" ? 4 :
          sig.label === "Bullish"      ? 3 :
          sig.label === "Neutral"      ? 2 :
          sig.label === "Weak"         ? 1 : 0;
        flat.push({ stock: s, date: day.date, days_from_today: day.days_from_today, intel, flow, signalScore: sigScore });
      }
    }

    switch (sortBy) {
      case "signal":    return [...flat].sort((a, b) => b.signalScore - a.signalScore);
      case "hist_move": return [...flat].sort((a, b) => (b.intel?.hist_avg_abs_move ?? 0) - (a.intel?.hist_avg_abs_move ?? 0));
      case "beat_rate": return [...flat].sort((a, b) => (b.intel?.beat_rate ?? 0) - (a.intel?.beat_rate ?? 0));
      default:          return flat; // sorted by days (already in order from calendar)
    }
  }, [calendar, intelligence, optionsFlow, sortBy]);

  if (intelLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <RefreshCw size={18} className="animate-spin text-accent" />
        <p className="text-sm text-text-muted">
          Fetching historical earnings data… this takes 20-40 seconds first load.
        </p>
      </div>
    );
  }

  function SortBtn({ id, label }: { id: typeof sortBy; label: string }) {
    return (
      <button
        onClick={() => setSortBy(id)}
        className={cn("px-2 py-1 rounded text-[10px] border transition-colors",
          sortBy === id ? "border-accent bg-surface-2 text-text-primary" : "border-border text-text-muted hover:text-text-primary"
        )}
      >{label}</button>
    );
  }

  return (
    <div>
      {/* Sort controls */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs text-text-muted">Sort:</span>
        <SortBtn id="days"      label="Days to Earnings" />
        <SortBtn id="signal"    label="Signal Strength" />
        <SortBtn id="hist_move" label="Hist. Avg Move" />
        <SortBtn id="beat_rate" label="Beat Rate" />
        {intelFetching && <RefreshCw size={11} className="animate-spin text-text-muted ml-2" />}
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-surface text-text-muted">
              <th className="px-3 py-2 text-left">Ticker</th>
              <th className="px-3 py-2 text-right">Days</th>
              <th className="px-3 py-2 text-center">Imp. Move</th>
              <th className="px-3 py-2 text-right">Hist Avg±</th>
              <th className="px-3 py-2 text-right">Pre-5d</th>
              <th className="px-3 py-2 text-right">Pre-10d</th>
              <th className="px-3 py-2 text-right">Beat%</th>
              <th className="px-3 py-2 text-right">Gap→5d</th>
              <th className="px-3 py-2 text-center">Revisions</th>
              <th className="px-3 py-2 text-center">Past Qtrs</th>
              <th className="px-3 py-2 text-center">Signal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ stock, date, days_from_today, intel, flow }) => (
              <>
                <tr
                  key={stock.ticker}
                  onClick={() => setExpanded(expanded === stock.ticker ? null : stock.ticker)}
                  className="border-b border-border/40 hover:bg-surface-2 cursor-pointer transition-colors"
                >
                  {/* Ticker */}
                  <td className="px-3 py-2" onClick={e => { e.stopPropagation(); setDrawer({ fetchUrl: `/api/chart/stock/${stock.ticker}`, color: "#6366f1" }); }}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-text-primary hover:text-accent">{stock.ticker}</span>
                      <SetupBadge setup={stock.setup} />
                    </div>
                    <div className="text-text-muted text-[10px] mt-0.5">{date}</div>
                  </td>
                  {/* Days */}
                  <td className={cn("px-3 py-2 text-right font-mono font-medium",
                    days_from_today <= 2 ? "text-red-400" : days_from_today <= 5 ? "text-amber-400" : "text-text-muted")}>
                    {days_from_today}d
                  </td>
                  {/* Implied move */}
                  <td className="px-3 py-2 text-center">
                    <ExpMoveBadge pct={flow?.expected_move_pct ?? null} loading={false} />
                  </td>
                  {/* Historical avg absolute move */}
                  <td className="px-3 py-2 text-right font-mono text-text-primary">
                    {intel?.hist_avg_abs_move != null ? `±${intel.hist_avg_abs_move.toFixed(1)}%` : "—"}
                  </td>
                  {/* Pre-drift */}
                  <td className="px-3 py-2 text-right"><Drift v={intel?.pre_drift_5d ?? null} /></td>
                  <td className="px-3 py-2 text-right"><Drift v={intel?.pre_drift_10d ?? null} /></td>
                  {/* Beat rate */}
                  <td className="px-3 py-2 text-right"><BeatRate v={intel?.beat_rate ?? null} /></td>
                  {/* Gap persistence */}
                  <td className="px-3 py-2 text-right"><GapPct v={intel?.gap_persistence_5d ?? null} /></td>
                  {/* Revisions */}
                  <td className="px-3 py-2 text-center">
                    <Revisions up={intel?.revisions_up_30d ?? 0} down={intel?.revisions_down_30d ?? 0} />
                  </td>
                  {/* Mini bar chart */}
                  <td className="px-3 py-2 text-center">
                    <EarningsBars history={intel?.history ?? []} />
                  </td>
                  {/* Signal */}
                  <td className="px-3 py-2 text-center">
                    <SignalBadge intel={intel} />
                  </td>
                </tr>
                {expanded === stock.ticker && intel && (
                  <tr key={`${stock.ticker}-detail`}>
                    <td colSpan={11} className="p-0">
                      <IntelDetail intel={intel} />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-text-muted">
        <div><span className="text-text-primary font-medium">Hist Avg±</span> — average absolute move on earnings day (last 8 qtrs)</div>
        <div><span className="text-text-primary font-medium">Pre-5d / 10d</span> — avg return in 5 or 10 days leading into earnings</div>
        <div><span className="text-text-primary font-medium">Gap→5d</span> — % of time earnings gap direction persisted 5 days after</div>
        <div><span className="text-text-primary font-medium">Signal</span> — composite of beat rate + pre-drift + revisions + gap persistence</div>
      </div>
      <HistoryDrawer open={!!drawer} onClose={() => setDrawer(null)} config={drawer} />
    </div>
  );
}

// ── Date section (Technical + Options views) ──────────────────────────────────

type ViewMode = "technical" | "options" | "intelligence";

function DateSection({
  dateStr, daysFromToday, stocks, optionsFlow, optionsLoading, viewMode,
}: {
  dateStr: string;
  daysFromToday: number;
  stocks: EarningsCalendarStock[];
  optionsFlow: Record<string, OptionsFlowItem>;
  optionsLoading: boolean;
  viewMode: ViewMode;
}) {
  const [open, setOpen]   = useState(true);
  const [drawer, setDrawer] = useState<DrawerConfig | null>(null);
  const urgency =
    daysFromToday === 0 ? "text-red-400 border-red-500/40 bg-red-500/5" :
    daysFromToday === 1 ? "text-red-300 border-red-500/30 bg-red-500/5" :
    daysFromToday <= 3  ? "text-amber-400 border-amber-500/30 bg-amber-500/5" :
    daysFromToday <= 7  ? "text-yellow-400/80 border-yellow-500/20 bg-yellow-500/5" :
                          "text-text-muted border-border bg-surface";
  const withSetup = stocks.filter(s => s.setup !== "No Setup").length;
  const maxMove = stocks.reduce((max, s) => {
    const m = optionsFlow[s.ticker]?.expected_move_pct ?? 0;
    return m > max ? m : max;
  }, 0);

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn("w-full flex items-center gap-3 px-4 py-2.5 text-left border-b border-border", urgency)}
      >
        <Calendar size={13} className="shrink-0" />
        <span className="font-semibold text-sm">{formatDate(dateStr, daysFromToday)}</span>
        <span className="text-xs opacity-70">{dateStr}</span>
        {daysFromToday <= 3 && <AlertTriangle size={12} />}
        <span className="ml-auto text-xs opacity-70">{stocks.length} stocks</span>
        {withSetup > 0 && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
            {withSetup} setups
          </span>
        )}
        {maxMove >= 5 && !optionsLoading && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/25">
            max ±{maxMove.toFixed(0)}%
          </span>
        )}
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {open && (
        <div className="overflow-x-auto">
          {viewMode === "technical" ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="px-3 py-2 text-left text-text-muted font-medium">Ticker</th>
                  <th className="px-3 py-2 text-left text-text-muted font-medium">Setup</th>
                  <th className="px-3 py-2 text-left text-text-muted font-medium">Stage</th>
                  <th className="px-3 py-2 text-left text-text-muted font-medium">Score★</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium">Price</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium">1D</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium">RS/SPY</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium">RS/Sect</th>
                  <th className="px-3 py-2 text-center text-text-muted font-medium">3×RS</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium">RSI</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium">Vol×</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium">52W Hi</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium">Days</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stocks.map(s => (
                  <tr key={s.ticker} onClick={() => setDrawer({ fetchUrl: `/api/chart/stock/${s.ticker}`, color: "#6366f1" })} className="hover:bg-surface-2 transition-colors cursor-pointer">
                    <td className="px-3 py-2 font-mono font-semibold text-text-primary">{s.ticker}</td>
                    <td className="px-3 py-2"><SetupBadge setup={s.setup} /></td>
                    <td className="px-3 py-2 font-medium text-text-muted">{s.stage != null ? `S${s.stage}` : "—"}</td>
                    <td className="px-3 py-2"><ScoreMini score={s.regime_adjusted_score} /></td>
                    <td className="px-3 py-2 text-right tabular-nums text-text-primary">
                      {s.price != null ? `$${s.price.toFixed(2)}` : "—"}
                    </td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", clr(s.chg_1d))}>{pct(s.chg_1d)}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", clr(s.rs_spy_20d))}>{pct(s.rs_spy_20d)}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", clr(s.rs_sector_20d))}>{pct(s.rs_sector_20d)}</td>
                    <td className="px-3 py-2 text-center">
                      {s.triple_rs ? <span className="text-emerald-400 font-bold">✓</span> : <span className="text-text-muted/40">✗</span>}
                    </td>
                    <td className={cn("px-3 py-2 text-right tabular-nums",
                      s.rsi != null ? s.rsi >= 70 ? "text-red-400" : s.rsi <= 35 ? "text-blue-400" : "text-text-primary" : "text-text-muted")}>
                      {num(s.rsi)}
                    </td>
                    <td className={cn("px-3 py-2 text-right tabular-nums",
                      s.vol_surge != null && s.vol_surge >= 1.5 ? "text-amber-400" : "text-text-primary")}>
                      {s.vol_surge != null ? `${s.vol_surge.toFixed(1)}×` : "—"}
                    </td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", clr(s.dist_52w_high))}>{pct(s.dist_52w_high)}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums font-medium",
                      daysFromToday <= 2 ? "text-red-400" : daysFromToday <= 5 ? "text-amber-400" : "text-text-muted")}>
                      {s.days_to_earnings}d
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            /* Options Flow view */
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="px-3 py-2 text-left text-text-muted font-medium">Ticker</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium">Price</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium">1D</th>
                  <th className="px-3 py-2 text-center text-text-muted font-medium">Exp Move</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium">ATM IV</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium">P/C Ratio</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium">Call / Put Vol</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium">Expiry</th>
                  <th className="px-3 py-2 text-left text-text-muted font-medium">Setup</th>
                  <th className="px-3 py-2 text-right text-text-muted font-medium">Days</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stocks.map(s => {
                  const flow    = optionsFlow[s.ticker] ?? null;
                  const loading = optionsLoading && !flow;
                  return (
                    <tr key={s.ticker} className="hover:bg-surface-2 transition-colors">
                      <td className="px-3 py-2 font-mono font-semibold text-text-primary">{s.ticker}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-text-primary">
                        {s.price != null ? `$${s.price.toFixed(2)}` : "—"}
                      </td>
                      <td className={cn("px-3 py-2 text-right tabular-nums", clr(s.chg_1d))}>{pct(s.chg_1d)}</td>
                      <td className="px-3 py-2 text-center">
                        <ExpMoveBadge pct={flow?.expected_move_pct ?? null} loading={loading} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        {loading ? <span className="text-text-muted/40">…</span> :
                          <span className={cn("tabular-nums",
                            (flow?.atm_iv ?? 0) >= 80 ? "text-red-400" : (flow?.atm_iv ?? 0) >= 50 ? "text-amber-400" : "text-text-primary")}>
                            {flow?.atm_iv != null ? `${flow.atm_iv.toFixed(0)}%` : "—"}
                          </span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {loading ? <span className="text-text-muted/40">…</span> :
                          <span className={cn("tabular-nums",
                            (flow?.put_call_vol_ratio ?? 0) > 1.2 ? "text-red-400" : (flow?.put_call_vol_ratio ?? 0) < 0.7 ? "text-green-400" : "text-text-primary")}>
                            {flow?.put_call_vol_ratio?.toFixed(2) ?? "—"}
                          </span>}
                      </td>
                      <td className="px-3 py-2 text-right text-[10px]">
                        {loading ? <span className="text-text-muted/40">…</span> : (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-green-400">C:{formatVol(flow?.call_volume)}</span>
                            <span className="text-red-400">P:{formatVol(flow?.put_volume)}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-text-muted text-[10px]">
                        {loading ? "…" : (flow?.expiry_used ?? "—")}
                      </td>
                      <td className="px-3 py-2"><SetupBadge setup={s.setup} /></td>
                      <td className={cn("px-3 py-2 text-right tabular-nums font-medium",
                        daysFromToday <= 2 ? "text-red-400" : daysFromToday <= 5 ? "text-amber-400" : "text-text-muted")}>
                        {s.days_to_earnings}d
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
      <HistoryDrawer open={!!drawer} onClose={() => setDrawer(null)} config={drawer} />
    </div>
  );
}

function formatVol(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EarningsPage() {
  const [universe,   setUniverse]   = useState("sp500");
  const [daysAhead,  setDaysAhead]  = useState(21);
  const [onlySetups, setOnlySetups] = useState(false);
  const [minScore,   setMinScore]   = useState(0);
  const [viewMode,   setViewMode]   = useState<ViewMode>("technical");

  const calendarKey = ["earnings-calendar", universe, daysAhead, onlySetups, minScore];

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: calendarKey,
    queryFn:  () => api.getEarningsCalendar({ universe, days_ahead: daysAhead, only_setups: onlySetups, min_score: minScore }),
    staleTime: 5 * 60 * 1000,
  });

  // Tickers + dates for the next 14 days (used by options + intelligence queries)
  const { nearTickers, nearDates } = useMemo(() => {
    const tickers: string[] = [];
    const dates:   string[] = [];
    if (!data?.days) return { nearTickers: tickers, nearDates: dates };
    for (const day of data.days) {
      if (day.days_from_today > 14) continue;
      for (const s of day.stocks) {
        tickers.push(s.ticker);
        dates.push(day.date);
      }
    }
    return { nearTickers: tickers, nearDates: dates };
  }, [data]);

  // Options flow query
  const { data: optionsData, isLoading: optionsLoading, isFetching: optionsFetching, refetch: refetchOptions } = useQuery({
    queryKey:  ["earnings-options-flow", nearTickers.join(",")],
    queryFn:   () => api.getEarningsOptionsFlow(nearTickers, nearDates),
    enabled:   nearTickers.length > 0 && viewMode === "options",
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Intelligence query (triggered when intelligence tab selected)
  const { data: intelData, isLoading: intelLoading, isFetching: intelFetching, refetch: refetchIntel } = useQuery({
    queryKey:  ["earnings-intelligence", nearTickers.join(",")],
    queryFn:   () => api.getEarningsIntelligence(nearTickers, nearDates),
    enabled:   nearTickers.length > 0 && viewMode === "intelligence",
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Also prefetch options when in intelligence mode (for implied move column)
  const { data: intelOptionsData } = useQuery({
    queryKey:  ["earnings-options-flow", nearTickers.join(",")],
    queryFn:   () => api.getEarningsOptionsFlow(nearTickers, nearDates),
    enabled:   nearTickers.length > 0 && viewMode === "intelligence",
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const optionsFlow  = optionsData?.options_flow ?? intelOptionsData?.options_flow ?? {};
  const intelligence = intelData?.intelligence ?? {};
  const days         = data?.days ?? [];

  return (
    <div className="space-y-5 max-w-screen-2xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-base font-semibold">Earnings Intelligence</h1>
          <p className="text-xs text-text-muted mt-0.5">
            Calendar · options flow · historical drift · gap persistence · revision trends
          </p>
        </div>
        <button
          onClick={() => { refetch(); if (viewMode === "options") refetchOptions(); if (viewMode === "intelligence") refetchIntel(); }}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
        >
          <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* View toggle */}
        <div className="flex rounded-md border border-border overflow-hidden">
          {([
            { id: "technical",    label: "Technical",    icon: <TrendingUp size={11} /> },
            { id: "options",      label: "Options Flow", icon: <Activity size={11} /> },
            { id: "intelligence", label: "Intelligence", icon: <Brain size={11} /> },
          ] as const).map(v => (
            <button
              key={v.id}
              onClick={() => setViewMode(v.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs border-l border-border first:border-l-0 transition-colors",
                viewMode === v.id ? "bg-surface-2 text-text-primary" : "text-text-muted hover:text-text-primary"
              )}
            >
              {v.icon} {v.label}
              {v.id === "options"      && optionsFetching && <RefreshCw size={9} className="animate-spin ml-1" />}
              {v.id === "intelligence" && intelFetching   && <RefreshCw size={9} className="animate-spin ml-1" />}
            </button>
          ))}
        </div>

        {/* Universe */}
        <select value={universe} onChange={e => setUniverse(e.target.value)}
          className="text-xs bg-surface-2 border border-border rounded-md px-2.5 py-1.5 text-text-primary focus:outline-none">
          <option value="sp500">S&P 500</option>
          <option value="sp1500">S&P 1500</option>
          <option value="nifty50">Nifty 50</option>
          <option value="euro_top">Europe Top 40</option>
          <option value="etfs">Popular ETFs</option>
          <option value="all_cached">All Cached</option>
        </select>

        {/* Days ahead */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-text-muted">Look ahead</span>
          {[7, 14, 21, 30].map(d => (
            <button key={d} onClick={() => setDaysAhead(d)}
              className={cn("px-2.5 py-1 rounded text-xs border transition-colors",
                daysAhead === d ? "border-accent bg-surface-2 text-text-primary" : "border-border text-text-muted hover:text-text-primary")}>
              {d}D
            </button>
          ))}
        </div>

        <button onClick={() => setOnlySetups(o => !o)}
          className={cn("px-3 py-1 rounded text-xs border transition-colors",
            onlySetups ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" : "border-border text-text-muted hover:text-text-primary")}>
          Setups only
        </button>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-text-muted">Min Score</span>
          {[0, 50, 60, 70].map(s => (
            <button key={s} onClick={() => setMinScore(s)}
              className={cn("px-2 py-1 rounded text-xs border transition-colors",
                minScore === s ? "border-accent bg-surface-2 text-text-primary" : "border-border text-text-muted hover:text-text-primary")}>
              {s === 0 ? "All" : s}
            </button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      {data && (
        <div className="flex flex-wrap items-center gap-4 px-4 py-2.5 rounded-lg border border-border bg-surface text-xs">
          <span><span className="text-text-muted">Upcoming: </span><span className="font-semibold">{data.total_stocks}</span></span>
          <span><span className="text-text-muted">With setup: </span><span className="font-semibold text-emerald-400">{data.total_with_setups}</span></span>
          <span><span className="text-text-muted">In next 14d: </span><span className="font-semibold">{nearTickers.length}</span></span>
          {viewMode === "options" && nearTickers.length > 0 && (
            <span className="text-text-muted">
              Options: <span className={optionsLoading ? "text-amber-400" : "text-emerald-400"}>
                {optionsLoading ? `fetching ${nearTickers.length}…` : `${Object.keys(optionsFlow).length} loaded`}
              </span>
            </span>
          )}
          {viewMode === "intelligence" && nearTickers.length > 0 && (
            <span className="text-text-muted">
              Intelligence: <span className={intelLoading ? "text-amber-400" : "text-emerald-400"}>
                {intelLoading ? `fetching ${nearTickers.length}…` : `${Object.keys(intelligence).length} loaded`}
              </span>
            </span>
          )}
        </div>
      )}

      {/* Loading banners */}
      {viewMode === "options" && nearTickers.length > 0 && optionsLoading && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 text-xs text-amber-400">
          <RefreshCw size={11} className="animate-spin shrink-0" />
          Fetching live options chains for {nearTickers.length} tickers — 15-30 seconds…
        </div>
      )}
      {viewMode === "intelligence" && nearTickers.length > 0 && intelLoading && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-purple-500/20 bg-purple-500/5 text-xs text-purple-300">
          <Brain size={11} className="shrink-0" />
          Analysing {nearTickers.length} earnings histories — pre-drift, gap persistence, revision trends… (~20-40s first load)
        </div>
      )}

      {isLoading && (
        <div className="flex items-center gap-2 text-text-muted text-sm py-16 justify-center">
          <RefreshCw size={14} className="animate-spin" />
          Loading earnings calendar…
        </div>
      )}
      {error && <div className="text-red-400 text-sm py-8 text-center">Failed to load earnings calendar.</div>}
      {!isLoading && data && days.length === 0 && (
        <div className="text-center py-16 text-text-muted text-sm">
          No upcoming earnings found in the next {daysAhead} days for this universe.
        </div>
      )}

      {/* Content */}
      {!isLoading && data && days.length > 0 && (
        viewMode === "intelligence" ? (
          <IntelligenceTable
            calendar={days}
            intelligence={intelligence}
            optionsFlow={optionsFlow}
            intelLoading={intelLoading}
            intelFetching={intelFetching}
          />
        ) : (
          <div className="space-y-3">
            {days.map(day => (
              <DateSection
                key={day.date}
                dateStr={day.date}
                daysFromToday={day.days_from_today}
                stocks={day.stocks}
                optionsFlow={optionsFlow}
                optionsLoading={optionsLoading && viewMode === "options"}
                viewMode={viewMode}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}

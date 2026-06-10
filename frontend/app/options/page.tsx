"use client";
import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import { api, type OptionsResponse, type OptionRow } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Search, RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPct(v: number | null, dec = 1): string {
  if (v == null) return "—";
  return `${v.toFixed(dec)}%`;
}

function fmtNum(v: number | null, dec = 2): string {
  if (v == null) return "—";
  return v.toFixed(dec);
}

function ivColor(v: number | null): string {
  if (v == null) return "text-text-muted";
  if (v < 20)  return "text-emerald-400";
  if (v < 35)  return "text-text-primary";
  if (v < 50)  return "text-amber-400";
  return "text-red-400";
}

function pcColor(v: number | null): string {
  if (v == null) return "text-text-muted";
  if (v < 0.7) return "text-emerald-400";   // call-heavy → bullish
  if (v < 1.0) return "text-text-primary";
  if (v < 1.3) return "text-amber-400";
  return "text-red-400";                    // put-heavy → bearish
}

function IVRankBar({ rank }: { rank: number | null }) {
  if (rank == null) return <span className="text-text-muted text-xs">—</span>;
  const color = rank < 25 ? "bg-emerald-500" : rank < 50 ? "bg-amber-500/70" : rank < 75 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-surface-2 rounded-full h-1.5 max-w-[80px]">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${rank}%` }} />
      </div>
      <span className="text-xs font-mono text-text-primary">{rank.toFixed(0)}th pct</span>
    </div>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="text-xs text-text-muted mb-0.5">{label}</div>
      <div className={cn("text-base font-mono font-bold", accent ?? "text-text-primary")}>{value}</div>
      {sub && <div className="text-[10px] text-text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-border rounded p-2 text-xs shadow-lg min-w-[140px]">
      <div className="text-text-muted mb-1">{label}</div>
      {payload.map((p: any) => p.value != null && (
        <div key={p.dataKey} className="flex justify-between gap-3">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono">{p.value.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}

// ── IV Term Structure chart ───────────────────────────────────────────────────

function TermStructureChart({ data, hv30 }: { data: OptionsResponse["term_structure"]; hv30: number | null }) {
  const points = data.filter(d => d.atm_iv != null);
  if (points.length < 2) return (
    <div className="flex items-center justify-center h-28 text-text-muted text-xs">Insufficient data</div>
  );
  return (
    <ResponsiveContainer width="100%" height={180}>
      <ComposedChart data={points} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
        <XAxis
          dataKey="dte"
          tick={{ fill: "#6b6b80", fontSize: 10 }}
          axisLine={{ stroke: "#2a2a38" }}
          tickLine={false}
          label={{ value: "DTE", position: "insideBottomRight", offset: -4, fill: "#6b6b80", fontSize: 9 }}
        />
        <YAxis
          tick={{ fill: "#6b6b80", fontSize: 10 }}
          axisLine={{ stroke: "#2a2a38" }}
          tickLine={false}
          width={36}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip content={<ChartTooltip />} />
        {hv30 != null && (
          <ReferenceLine yAxisId={0} y={hv30} stroke="#6b6b80" strokeDasharray="4 3" strokeWidth={1.5}
            label={{ value: `HV30 ${hv30.toFixed(1)}%`, position: "right", fill: "#6b6b80", fontSize: 9 }} />
        )}
        <Line
          type="monotone" dataKey="atm_iv" name="ATM IV"
          stroke="#6366f1" strokeWidth={2.5} dot={{ fill: "#6366f1", r: 3 }} connectNulls={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── Volatility skew chart ─────────────────────────────────────────────────────

function SkewChart({ data, spot }: { data: OptionsResponse["skew"]; spot: number }) {
  const points = data.filter(d => d.put_iv != null || d.call_iv != null);
  if (points.length < 3) return (
    <div className="flex items-center justify-center h-28 text-text-muted text-xs">Insufficient data</div>
  );
  return (
    <ResponsiveContainer width="100%" height={180}>
      <ComposedChart data={points} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
        <XAxis
          dataKey="moneyness"
          tick={{ fill: "#6b6b80", fontSize: 10 }}
          axisLine={{ stroke: "#2a2a38" }}
          tickLine={false}
          tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`}
          label={{ value: "Moneyness", position: "insideBottomRight", offset: -4, fill: "#6b6b80", fontSize: 9 }}
        />
        <YAxis
          tick={{ fill: "#6b6b80", fontSize: 10 }}
          axisLine={{ stroke: "#2a2a38" }}
          tickLine={false}
          width={36}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip content={<ChartTooltip />} />
        <ReferenceLine x={0} stroke="#3a3a50" strokeWidth={1.5} />
        <Line
          type="monotone" dataKey="put_iv" name="Put IV"
          stroke="#ef4444" strokeWidth={2} dot={false} connectNulls={true}
        />
        <Line
          type="monotone" dataKey="call_iv" name="Call IV"
          stroke="#22c55e" strokeWidth={2} dot={false}
          strokeDasharray="5 3" connectNulls={true}
        />
        <Legend wrapperStyle={{ fontSize: 10, color: "#6b6b80" }} iconType="line" iconSize={10} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── Most active options table ─────────────────────────────────────────────────

type SortKey = "volume" | "oi" | "iv" | "strike";

function MostActiveTable({ rows, spot }: { rows: OptionRow[]; spot: number }) {
  const [sort, setSort] = useState<SortKey>("volume");
  const [showCalls, setShowCalls] = useState(true);
  const [showPuts, setShowPuts]   = useState(true);

  const filtered = rows
    .filter(r => (r.type === "CALL" ? showCalls : showPuts))
    .sort((a, b) => {
      if (sort === "volume") return b.volume - a.volume;
      if (sort === "oi")     return b.oi - a.oi;
      if (sort === "iv")     return (b.iv ?? 0) - (a.iv ?? 0);
      return a.strike - b.strike;
    });

  const Th = ({ k, label }: { k: SortKey; label: string }) => (
    <th
      onClick={() => setSort(k)}
      className={cn("pb-2 font-normal cursor-pointer hover:text-text-primary text-right transition-colors",
        sort === k ? "text-accent" : "text-text-muted")}
    >{label}</th>
  );

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-text-muted text-xs">Filter:</span>
        {[["CALL", showCalls, setShowCalls, "text-emerald-400"], ["PUT", showPuts, setShowPuts, "text-red-400"]] .map(([label, active, setActive, textColor]) => (
          <button
            key={label as string}
            onClick={() => (setActive as any)(!(active as boolean))}
            className={cn(
              "px-2 py-0.5 rounded border text-xs transition-colors",
              active ? `bg-surface-2 border-border ${textColor}` : "bg-surface border-border/40 text-text-muted/40"
            )}
          >{label as string}</button>
        ))}
        <span className="text-text-muted text-xs ml-2">Sort by:</span>
        {(["volume", "oi", "iv", "strike"] as SortKey[]).map(k => (
          <button key={k} onClick={() => setSort(k)}
            className={cn("px-2 py-0.5 rounded border text-xs transition-colors",
              sort === k ? "bg-accent/10 border-accent/30 text-accent" : "bg-surface-2 border-border text-text-muted hover:text-text-primary"
            )}
          >{k === "oi" ? "OI" : k.charAt(0).toUpperCase() + k.slice(1)}</button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left pb-2 font-normal text-text-muted w-16">Type</th>
              <th className="text-right pb-2 font-normal text-text-muted">Strike</th>
              <th className="text-right pb-2 font-normal text-text-muted">Δ Spot</th>
              <Th k="iv"     label="IV" />
              <Th k="volume" label="Volume" />
              <Th k="oi"     label="OI" />
              <th className="text-right pb-2 font-normal text-text-muted">Bid</th>
              <th className="text-right pb-2 font-normal text-text-muted">Ask</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {filtered.map((r, i) => {
              const pctFromSpot = ((r.strike / spot) - 1) * 100;
              return (
                <tr key={i} className={cn("hover:bg-surface-2 transition-colors", r.itm ? "opacity-60" : "")}>
                  <td className={cn("py-1.5 font-semibold", r.type === "CALL" ? "text-emerald-400" : "text-red-400")}>
                    {r.type}
                  </td>
                  <td className="py-1.5 text-right font-mono text-text-primary">{r.strike.toFixed(2)}</td>
                  <td className={cn("py-1.5 text-right font-mono text-xs",
                    pctFromSpot > 0 ? "text-emerald-400/70" : "text-red-400/70")}>
                    {pctFromSpot >= 0 ? "+" : ""}{pctFromSpot.toFixed(1)}%
                  </td>
                  <td className={cn("py-1.5 text-right font-mono", ivColor(r.iv))}>
                    {fmtPct(r.iv)}
                  </td>
                  <td className="py-1.5 text-right font-mono text-text-primary">
                    {r.volume.toLocaleString()}
                  </td>
                  <td className="py-1.5 text-right font-mono text-text-muted">
                    {r.oi.toLocaleString()}
                  </td>
                  <td className="py-1.5 text-right font-mono text-text-muted">{fmtNum(r.bid)}</td>
                  <td className="py-1.5 text-right font-mono text-text-muted">{fmtNum(r.ask)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OptionsPage() {
  const [input,     setInput]     = useState("SPY");
  const [submitted, setSubmitted] = useState("SPY");
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey:  ["options", submitted],
    queryFn:   () => api.getOptions(submitted),
    staleTime: 5 * 60 * 1000,
    retry:     1,
  });

  function submit() {
    const t = input.trim().toUpperCase();
    if (!t) return;
    setSubmitted(t);
  }

  const ivVsHvColor = !data?.iv_vs_hv ? "text-text-primary"
    : data.iv_vs_hv > 1.3 ? "text-red-400"
    : data.iv_vs_hv > 1.0 ? "text-amber-400"
    : "text-emerald-400";

  const pcLabel = (v: number | null): string => {
    if (v == null) return "—";
    if (v < 0.7) return `${v.toFixed(2)} (call-heavy)`;
    if (v < 1.0) return `${v.toFixed(2)} (neutral)`;
    if (v < 1.3) return `${v.toFixed(2)} (neutral)`;
    return `${v.toFixed(2)} (put-heavy)`;
  };

  return (
    <div className="space-y-5 max-w-screen-xl">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-base font-semibold">Options Analytics</h1>
          <p className="text-xs text-text-muted mt-0.5">
            IV term structure · vol skew · P/C ratios · max pain · most-active strikes
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex gap-0 rounded border border-border overflow-hidden">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && submit()}
              placeholder="Ticker…"
              className="px-3 py-1.5 bg-surface-2 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none w-24"
            />
            <button
              onClick={submit}
              className="px-2.5 py-1.5 bg-surface-2 border-l border-border text-text-muted hover:text-text-primary"
            >
              <Search size={12} />
            </button>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-1.5 rounded bg-surface-2 border border-border text-text-muted hover:text-text-primary disabled:opacity-50"
          >
            <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-text-muted text-sm gap-2">
          <RefreshCw size={14} className="animate-spin" />
          Fetching options data (live from market)…
        </div>
      )}

      {!isLoading && !data && (
        <div className="flex items-center justify-center py-16 text-text-muted text-sm">
          Enter a ticker above to load options analytics.
        </div>
      )}

      {data && (
        <>
          {/* Key stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            <StatCard label="Underlying" value={data.ticker} sub={`@ ${data.spot.toFixed(2)}`} />
            <StatCard label="ATM IV (nearest)" value={fmtPct(data.atm_iv)} accent={ivColor(data.atm_iv)} />
            <StatCard label="HV30" value={fmtPct(data.hv30)} />
            <StatCard
              label="IV / HV"
              value={fmtNum(data.iv_vs_hv)}
              sub={data.iv_vs_hv != null ? (data.iv_vs_hv > 1 ? "IV above HV" : "IV below HV") : undefined}
              accent={ivVsHvColor}
            />
            <div className="rounded-lg border border-border bg-surface p-3 col-span-2 sm:col-span-1 lg:col-span-2">
              <div className="text-xs text-text-muted mb-1">IV Rank (vs HV30 history)</div>
              <IVRankBar rank={data.iv_rank} />
            </div>
            <StatCard
              label="P/C Volume"
              value={pcLabel(data.pc_volume)}
              accent={pcColor(data.pc_volume)}
            />
            <StatCard
              label="Max Pain"
              value={data.max_pain != null ? data.max_pain.toFixed(2) : "—"}
              sub={data.max_pain != null && data.spot
                ? `${((data.max_pain / data.spot - 1) * 100).toFixed(1)}% from spot`
                : undefined}
            />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* IV Term Structure */}
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="text-sm font-medium mb-0.5">IV Term Structure</div>
              <div className="text-xs text-text-muted mb-3">
                ATM implied vol by expiry · dashed = HV30 · lower DTE = nearer-term
              </div>
              <TermStructureChart data={data.term_structure} hv30={data.hv30} />

              {/* Expiry chips */}
              <div className="flex flex-wrap gap-1.5 mt-3">
                {data.term_structure.map(p => (
                  <span key={p.expiry} className="px-2 py-0.5 rounded bg-surface-2 border border-border text-xs font-mono">
                    <span className="text-text-muted">{p.expiry}</span>
                    {p.atm_iv != null && (
                      <span className={cn("ml-1.5", ivColor(p.atm_iv))}>{p.atm_iv.toFixed(1)}%</span>
                    )}
                  </span>
                ))}
              </div>
            </div>

            {/* Vol Skew */}
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between mb-0.5">
                <div className="text-sm font-medium">Volatility Skew</div>
                <span className="text-xs text-text-muted">{data.nearest_expiry}</span>
              </div>
              <div className="text-xs text-text-muted mb-3">
                IV by moneyness · puts (red) vs calls (green) · 0% = at-the-money
              </div>
              <SkewChart data={data.skew} spot={data.spot} />

              {/* Skew interpretation */}
              {data.skew.length >= 3 && (() => {
                const otmPut = data.skew.find(s => s.moneyness >= -10 && s.moneyness <= -5);
                const atm    = data.skew.reduce((a, b) => Math.abs(b.moneyness) < Math.abs(a.moneyness) ? b : a);
                const otmCall = data.skew.find(s => s.moneyness >= 5 && s.moneyness <= 10);
                const putSkew = otmPut?.put_iv && atm?.put_iv ? otmPut.put_iv - atm.put_iv : null;
                return putSkew != null ? (
                  <div className="mt-3 text-xs text-text-muted">
                    Put skew (−10% vs ATM):{" "}
                    <span className={putSkew > 3 ? "text-red-400" : putSkew > 1 ? "text-amber-400" : "text-emerald-400"}>
                      +{putSkew.toFixed(1)}%
                    </span>
                    {putSkew > 5 && " · heavy tail-risk hedging detected"}
                    {putSkew <= 2 && " · low fear premium · complacent market"}
                  </div>
                ) : null;
              })()}
            </div>
          </div>

          {/* Most active options */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="text-sm font-medium mb-0.5">Most Active Options</div>
            <div className="text-xs text-text-muted mb-3">
              Top 25 contracts by volume · nearest expiry ({data.nearest_expiry}) · greyed = in-the-money
            </div>
            <MostActiveTable rows={data.most_active} spot={data.spot} />
          </div>
        </>
      )}
    </div>
  );
}

"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { RefreshCw, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

// ── Types (mirroring backend) ─────────────────────────────────────────────────

interface IndexSummary {
  label:             string;
  underlying:        number | null;
  price:             number | null;
  overall_pcr:       number | null;
  atm_iv:            number | null;
  atm_iv_label:      string | null;
  nearest_expiry:    string | null;
  nearest_max_pain:  number | null;
  expiry_count:      number;
}

interface StrikeRow {
  strike:    number;
  ce_oi:     number | null;
  ce_oi_chg: number | null;
  ce_vol:    number | null;
  ce_iv:     number | null;
  ce_ltp:    number | null;
  pe_oi:     number | null;
  pe_oi_chg: number | null;
  pe_vol:    number | null;
  pe_iv:     number | null;
  pe_ltp:    number | null;
}

interface GammaRow {
  strike:        number;
  net_gamma_oi:  number;
}

interface ExpiryMeta {
  expiry:   string;
  ce_oi:    number;
  pe_oi:    number;
  pcr:      number | null;
  max_pain: number | null;
}

interface IndexChain {
  index:           string;
  label:           string;
  underlying:      number | null;
  timestamp:       string | null;
  expiries:        string[];
  expiry_meta:     ExpiryMeta[];
  overall_pcr:     number | null;
  atm_iv:          number | null;
  atm_iv_label:    string | null;
  gamma_exposure:  GammaRow[];
  strikes:         Record<string, StrikeRow[]>;
}

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtOI = (v: number | null | undefined) => {
  if (v == null) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e7) return `${(v / 1e7).toFixed(1)}Cr`;
  if (abs >= 1e5) return `${(v / 1e5).toFixed(1)}L`;
  return v.toLocaleString("en-IN");
};

const fmtPrice = (v: number | null | undefined) =>
  v == null ? "—" : `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const pcrColor = (v: number | null | undefined) => {
  if (v == null) return "#6b6b80";
  if (v > 1.5) return "#22c55e";
  if (v > 1.0) return "#84cc16";
  if (v > 0.7) return "#eab308";
  return "#ef4444";
};

const ivColor = (label: string | null | undefined) => {
  if (label === "Elevated") return "#ef4444";
  if (label === "Moderate") return "#eab308";
  return "#22c55e";
};

// ── Index Chain Modal ─────────────────────────────────────────────────────────

function IndexChainModal({ index, onClose }: { index: string; onClose: () => void }) {
  const [expiry, setExpiry] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["idx-chain", index],
    queryFn:  () => api.getFoOptionChain ? fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/index-fo/option-chain/${index}`).then(r => r.json()) as Promise<IndexChain> : Promise.reject("no api"),
    staleTime: 4 * 60 * 1000,
  });

  const activeExpiry = expiry || data?.expiries?.[0] || "";
  const strikes      = (data?.strikes?.[activeExpiry] ?? []) as StrikeRow[];
  const underlying   = data?.underlying;

  // ATM strike
  const atmStrike = underlying
    ? strikes.reduce<StrikeRow | null>((best, s) =>
        best == null || Math.abs(s.strike - underlying) < Math.abs(best.strike - underlying) ? s : best
      , null)?.strike ?? null
    : null;

  // Show ±20 strikes around ATM
  const visible: StrikeRow[] = (() => {
    if (!atmStrike) return strikes;
    const idx = strikes.findIndex(s => s.strike === atmStrike);
    return strikes.slice(Math.max(0, idx - 20), idx + 21);
  })();

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <div className="text-base font-bold">{index} Option Chain</div>
            {underlying && (
              <div className="text-[11px] text-text-muted">
                Spot: {fmtPrice(underlying)} · PCR: {data?.overall_pcr?.toFixed(2) ?? "—"} · ATM IV: {data?.atm_iv?.toFixed(1) ?? "—"}%
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-surface-2 text-text-muted">
            <X size={14} />
          </button>
        </div>

        {/* Expiry tabs */}
        {data && (
          <div className="px-5 py-2 border-b border-border flex gap-2 overflow-x-auto">
            {data.expiries.slice(0, 8).map(exp => {
              const meta = data.expiry_meta.find(m => m.expiry === exp);
              return (
                <button
                  key={exp}
                  onClick={() => setExpiry(exp)}
                  className={cn(
                    "px-2.5 py-1 rounded text-[10px] whitespace-nowrap transition-colors",
                    activeExpiry === exp ? "bg-accent text-white" : "bg-surface-2 text-text-muted hover:text-text-primary"
                  )}
                >
                  {exp}
                  {meta?.pcr != null && (
                    <span className="ml-1 opacity-60">PCR {meta.pcr.toFixed(2)}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* OI Chart */}
        {visible.length > 0 && (
          <div className="px-5 py-3 border-b border-border">
            <div className="text-[10px] text-text-muted mb-1">OI Distribution · CE <span className="text-emerald-400">green</span> · PE <span className="text-red-400">red</span></div>
            <ResponsiveContainer width="100%" height={100}>
              <BarChart data={visible} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <XAxis dataKey="strike" tick={{ fill: "#6b6b80", fontSize: 8 }} axisLine={false} tickLine={false} interval={3} />
                <Tooltip
                  contentStyle={{ background: "#111118", border: "1px solid #2a2a38", fontSize: 10 }}
                  formatter={(v: number, name: string) => [fmtOI(v), name]}
                />
                {atmStrike && <ReferenceLine x={atmStrike} stroke="#6366f1" strokeDasharray="3 3" />}
                <Bar dataKey="ce_oi" name="Call OI" fill="#22c55e" opacity={0.8} radius={[2,2,0,0]} />
                <Bar dataKey="pe_oi" name="Put OI"  fill="#ef4444" opacity={0.8} radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Gamma exposure chart */}
        {data?.gamma_exposure && data.gamma_exposure.length > 0 && activeExpiry === data.expiries[0] && (
          <div className="px-5 py-3 border-b border-border">
            <div className="text-[10px] text-text-muted mb-1">Net Gamma OI (CE - PE) by Strike</div>
            <ResponsiveContainer width="100%" height={80}>
              <BarChart
                data={data.gamma_exposure.filter(g => {
                  if (!atmStrike) return true;
                  return Math.abs(g.strike - atmStrike) <= 20 * (atmStrike * 0.002);
                })}
                margin={{ top: 0, right: 0, bottom: 0, left: -10 }}
              >
                <XAxis dataKey="strike" tick={{ fill: "#6b6b80", fontSize: 7 }} axisLine={false} tickLine={false} interval={3} />
                <ReferenceLine y={0} stroke="#3a3a50" />
                {atmStrike && <ReferenceLine x={atmStrike} stroke="#6366f1" strokeDasharray="3 3" />}
                <Tooltip
                  contentStyle={{ background: "#111118", border: "1px solid #2a2a38", fontSize: 10 }}
                  formatter={(v: number) => [fmtOI(v), "Net γ OI"]}
                />
                <Bar dataKey="net_gamma_oi" name="Net γ OI" radius={[1,1,0,0]}>
                  {data.gamma_exposure.map((g, i) => (
                    <Cell key={i} fill={g.net_gamma_oi >= 0 ? "#22c55e" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Strikes table */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-text-muted text-sm">
              <RefreshCw size={14} className="animate-spin mr-2" /> Loading…
            </div>
          ) : visible.length === 0 ? (
            <div className="py-12 text-center text-text-muted text-sm">No data for this expiry</div>
          ) : (
            <table className="w-full text-[10px]">
              <thead className="sticky top-0 bg-surface border-b border-border">
                <tr className="text-text-muted">
                  <th colSpan={5} className="py-1.5 text-center text-emerald-400 border-r border-border">CALLS</th>
                  <th className="py-1.5 px-3 text-center font-bold text-text-primary">STRIKE</th>
                  <th colSpan={5} className="py-1.5 text-center text-red-400 border-l border-border">PUTS</th>
                </tr>
                <tr className="text-text-faint text-[9px]">
                  {["OI", "OI Δ", "Vol", "IV%", "LTP"].map(h => (
                    <th key={`ce-${h}`} className="py-1 px-2 text-right font-normal">{h}</th>
                  ))}
                  <th className="py-1 px-3 border-x border-border" />
                  {["LTP", "IV%", "Vol", "OI Δ", "OI"].map(h => (
                    <th key={`pe-${h}`} className="py-1 px-2 text-left font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const isATM = row.strike === atmStrike;
                  return (
                    <tr key={row.strike} className={cn(
                      "border-b border-border/30",
                      isATM ? "bg-accent/8 font-semibold" : "hover:bg-surface-2/50"
                    )}>
                      <td className="py-1 px-2 text-right font-mono text-emerald-300">{fmtOI(row.ce_oi)}</td>
                      <td className={cn("py-1 px-2 text-right font-mono", (row.ce_oi_chg ?? 0) >= 0 ? "text-emerald-400" : "text-red-400")}>
                        {fmtOI(row.ce_oi_chg)}
                      </td>
                      <td className="py-1 px-2 text-right font-mono text-text-muted">{fmtOI(row.ce_vol)}</td>
                      <td className="py-1 px-2 text-right font-mono text-text-muted">{row.ce_iv?.toFixed(1) ?? "—"}</td>
                      <td className="py-1 px-2 text-right font-mono text-text-primary">{fmtPrice(row.ce_ltp)}</td>
                      <td className="py-1 px-3 text-center font-bold text-[11px] border-x border-border" style={{ color: isATM ? "#6366f1" : undefined }}>
                        {row.strike.toLocaleString("en-IN")}
                        {isATM && <span className="ml-1 text-[8px] text-accent">ATM</span>}
                      </td>
                      <td className="py-1 px-2 text-left font-mono text-text-primary">{fmtPrice(row.pe_ltp)}</td>
                      <td className="py-1 px-2 text-left font-mono text-text-muted">{row.pe_iv?.toFixed(1) ?? "—"}</td>
                      <td className="py-1 px-2 text-left font-mono text-text-muted">{fmtOI(row.pe_vol)}</td>
                      <td className={cn("py-1 px-2 text-left font-mono", (row.pe_oi_chg ?? 0) >= 0 ? "text-red-400" : "text-emerald-400")}>
                        {fmtOI(row.pe_oi_chg)}
                      </td>
                      <td className="py-1 px-2 text-left font-mono text-red-300">{fmtOI(row.pe_oi)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Index Card ────────────────────────────────────────────────────────────────

function IndexCard({ idxKey, data, onClick }: { idxKey: string; data: IndexSummary; onClick: () => void }) {
  const pcr    = data.overall_pcr;
  const pcrClr = pcrColor(pcr);
  const ivClr  = ivColor(data.atm_iv_label);

  return (
    <div
      className="bg-surface border border-border rounded-xl p-4 space-y-3 cursor-pointer hover:border-border-2 transition-colors"
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-bold text-text-primary">{idxKey}</div>
          <div className="text-[11px] text-text-muted">{data.label}</div>
        </div>
        <div className="text-right">
          <div className="text-base font-mono font-bold text-text-primary">{fmtPrice(data.underlying ?? data.price)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-surface-2 rounded p-2 text-center">
          <div className="text-[9px] text-text-faint uppercase tracking-wide mb-0.5">PCR</div>
          <div className="text-base font-bold font-mono" style={{ color: pcrClr }}>
            {pcr?.toFixed(2) ?? "—"}
          </div>
          <div className="text-[9px] text-text-muted">
            {pcr == null ? "—" : pcr > 1.5 ? "Bullish" : pcr > 1.0 ? "Neutral+" : pcr > 0.7 ? "Neutral−" : "Bearish"}
          </div>
        </div>
        <div className="bg-surface-2 rounded p-2 text-center">
          <div className="text-[9px] text-text-faint uppercase tracking-wide mb-0.5">ATM IV</div>
          <div className="text-base font-bold font-mono" style={{ color: ivClr }}>
            {data.atm_iv?.toFixed(1) ?? "—"}<span className="text-[10px]">%</span>
          </div>
          <div className="text-[9px]" style={{ color: ivClr }}>{data.atm_iv_label ?? "—"}</div>
        </div>
      </div>

      <div className="border-t border-border/50 pt-2 grid grid-cols-2 gap-2 text-[10px]">
        <div>
          <span className="text-text-faint">Max Pain</span>
          <div className="font-mono text-text-primary">{fmtPrice(data.nearest_max_pain)}</div>
        </div>
        <div>
          <span className="text-text-faint">Next Expiry</span>
          <div className="font-mono text-text-primary">{data.nearest_expiry ?? "—"}</div>
        </div>
      </div>

      <div className="text-[10px] text-accent text-center">Click to view full option chain →</div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function IndexFOPage() {
  const [activeIndex, setActiveIndex] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey:        ["index-fo-dashboard"],
    queryFn:         () => fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/index-fo/dashboard`).then(r => r.json()) as Promise<{ as_of: string; indices: Record<string, IndexSummary> }>,
    staleTime:       4 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const indices = data?.indices ?? {};

  return (
    <div className="space-y-4 max-w-screen-xl">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary">🇮🇳 Index Options Dashboard</h1>
          <p className="text-[12px] text-text-muted mt-0.5">
            NIFTY · BANKNIFTY · FINNIFTY · Real-time option chains from NSE
            {data && ` · ${data.as_of}`}
          </p>
        </div>
        <button onClick={() => refetch()} disabled={isFetching}
          className="p-2 rounded-lg bg-surface border border-border text-text-muted hover:text-text-primary disabled:opacity-50 transition-all">
          <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-24 gap-3 text-text-muted text-sm">
          <RefreshCw size={14} className="animate-spin text-accent" />
          <span>Fetching index option chains from NSE…</span>
        </div>
      )}

      {/* Index Cards */}
      {!isLoading && Object.keys(indices).length === 0 && (
        <div className="py-12 text-center text-text-muted">
          <div className="text-sm">NSE option chain data unavailable</div>
          <div className="text-xs mt-1">The NSE API requires an active session — try refreshing.</div>
          <button onClick={() => refetch()} className="mt-3 px-4 py-1.5 text-sm rounded bg-accent text-white">
            Retry
          </button>
        </div>
      )}

      {Object.keys(indices).length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Object.entries(indices).map(([key, idx]) => (
            <IndexCard key={key} idxKey={key} data={idx} onClick={() => setActiveIndex(key)} />
          ))}
        </div>
      )}

      {/* How to interpret PCR */}
      <div className="bg-surface border border-border rounded-lg p-4 text-xs text-text-muted space-y-1">
        <div className="font-medium text-text-primary mb-2">Interpretation Guide</div>
        <div>• <strong className="text-text-primary">PCR &gt; 1.5</strong>: Heavy put buying → contrarian bullish (max pessimism)</div>
        <div>• <strong className="text-text-primary">PCR 0.7–1.0</strong>: Call-heavy → market expects upside / short-term overbought</div>
        <div>• <strong className="text-text-primary">Max Pain</strong>: Strike at which option sellers (writers) have minimum loss — spot tends to gravitate here on expiry</div>
        <div>• <strong className="text-text-primary">Net Gamma OI &gt; 0</strong> at a strike: Call writers dominate → resistance zone</div>
        <div>• <strong className="text-text-primary">Net Gamma OI &lt; 0</strong> at a strike: Put writers dominate → support zone</div>
        <div>• <strong className="text-text-primary">ATM IV Elevated (&gt;25%)</strong>: Premium is expensive — consider selling strategies</div>
      </div>

      {/* Option chain modal */}
      {activeIndex && (
        <IndexChainModal index={activeIndex} onClose={() => setActiveIndex(null)} />
      )}
    </div>
  );
}

"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend,
} from "recharts";
import { api } from "@/lib/api";
import { PageGuide } from "@/components/PageGuide";
import { TickerChip } from "@/components/TickerChip";

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
  green:  "#22c55e",
  red:    "#ef4444",
  amber:  "#f59e0b",
  blue:   "#3b82f6",
  cyan:   "#06b6d4",
  purple: "#a855f7",
  muted:  "var(--text-muted)",
  border: "var(--border, #2a2f3e)",
  surf2:  "var(--surface-2, #1a1f2e)",
};

const TICK = { fill: "var(--text-muted)", fontSize: 10 };

// ── Utility components ────────────────────────────────────────────────────────
function Loading() {
  return <div className="flex items-center justify-center h-40 text-sm" style={{ color: C.muted }}>Loading…</div>;
}
function Err({ msg }: { msg: string }) {
  return <div className="flex items-center justify-center h-40 text-sm text-red-500">{msg}</div>;
}
function SH({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: C.muted }}>
      {children}
    </div>
  );
}
function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
      <div className="text-xs mb-1" style={{ color: C.muted }}>{label}</div>
      <div className="text-xl font-mono font-bold" style={{ color: color ?? "var(--text-primary)" }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: C.muted }}>{sub}</div>}
    </div>
  );
}

// ── Party badge ───────────────────────────────────────────────────────────────
function PartyBadge({ party }: { party: string }) {
  const bg = party === "D" ? "#1e3a5f" : "#3f1515";
  const fg = party === "D" ? C.blue : C.red;
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: bg, color: fg }}>
      {party}
    </span>
  );
}

// ── Action badge ──────────────────────────────────────────────────────────────
function ActionBadge({ action }: { action: string }) {
  const isBuy = action === "Buy";
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
      style={{ background: isBuy ? "#14402a" : "#3f1515", color: isBuy ? C.green : C.red }}>
      {action.toUpperCase()}
    </span>
  );
}

// ── Signal badge ──────────────────────────────────────────────────────────────
const SIG_COLORS: Record<string, string> = {
  "STRONG BUY": C.green, "BUY": "#86efac", "HOLD": C.amber,
  "SELL": "#fca5a5", "STRONG SELL": C.red,
};
function SigBadge({ sig }: { sig: string }) {
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
      style={{ color: SIG_COLORS[sig] ?? C.muted, border: `1px solid ${SIG_COLORS[sig] ?? C.muted}` }}>
      {sig}
    </span>
  );
}

// ── Priority badge ────────────────────────────────────────────────────────────
const PRI: Record<string, { bg: string; fg: string }> = {
  CRITICAL: { bg: "#3f1515", fg: C.red },
  HIGH:     { bg: "#3f2a0a", fg: C.amber },
  MEDIUM:   { bg: "#1a2a3f", fg: C.blue },
  LOW:      { bg: "#1a1f2e", fg: C.muted },
};
function PriBadge({ p }: { p: string }) {
  const s = PRI[p] ?? PRI.LOW;
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: s.bg, color: s.fg }}>
      {p}
    </span>
  );
}

// ── Impact badge ──────────────────────────────────────────────────────────────
const IMP: Record<string, string> = { POSITIVE: C.green, NEGATIVE: C.red, MIXED: C.amber };
function ImpactBadge({ v }: { v: string }) {
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
      style={{ color: IMP[v] ?? C.muted, border: `1px solid ${IMP[v] ?? C.muted}` }}>
      {v}
    </span>
  );
}

// ── Conviction bar ────────────────────────────────────────────────────────────
function ConvBar({ score }: { score: number }) {
  const color = score >= 80 ? C.green : score >= 60 ? C.cyan : score >= 40 ? C.amber : C.red;
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full" style={{ background: C.border }}>
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-xs font-mono" style={{ color }}>{score}</span>
    </div>
  );
}

// ── Bullishness Gauge ─────────────────────────────────────────────────────────
function BullishnessGauge({ score, label }: { score: number; label: string }) {
  const r = 70;
  const cx = 100;
  const cy = 90;
  const startA = Math.PI;
  const endA = 0;
  const angle = startA - (score / 100) * Math.PI;
  const nx = cx + r * Math.cos(angle);
  const ny = cy - r * Math.sin(angle);

  const zones = [
    { from: 0, to: 20,  color: "#ef4444" },
    { from: 20, to: 40, color: "#f97316" },
    { from: 40, to: 60, color: C.amber },
    { from: 60, to: 80, color: C.cyan },
    { from: 80, to: 100,color: C.green },
  ];

  function arcPath(from: number, to: number) {
    const a1 = Math.PI - (from / 100) * Math.PI;
    const a2 = Math.PI - (to   / 100) * Math.PI;
    const x1 = cx + r * Math.cos(a1); const y1 = cy - r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2); const y2 = cy - r * Math.sin(a2);
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  }

  const scoreColor = score >= 80 ? C.green : score >= 60 ? C.cyan : score >= 40 ? C.amber : score >= 20 ? "#f97316" : C.red;

  return (
    <div className="flex flex-col items-center">
      <svg width="200" height="110" viewBox="0 0 200 110">
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke={C.border} strokeWidth={14} strokeLinecap="round" />
        {zones.map(z => (
          <path key={z.from} d={arcPath(z.from, z.to)}
            fill="none" stroke={z.color} strokeWidth={10} strokeLinecap="round" opacity={0.25} />
        ))}
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${nx} ${ny}`}
          fill="none" stroke={scoreColor} strokeWidth={10} strokeLinecap="round" />
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="white" strokeWidth={2} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={4} fill="white" />
        <text x={cx} y={cy - 18} textAnchor="middle" fontSize={26} fontFamily="monospace" fontWeight="bold" fill={scoreColor}>{score}</text>
        <text x={30} y={cy + 18} textAnchor="middle" fontSize={8} fill={C.red}>Sell</text>
        <text x={170} y={cy + 18} textAnchor="middle" fontSize={8} fill={C.green}>Buy</text>
      </svg>
      <div className="text-sm font-semibold mt-1" style={{ color: scoreColor }}>{label}</div>
    </div>
  );
}

// ── Score bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ label, score, weight }: { label: string; score: number; weight: number }) {
  const color = score >= 70 ? C.green : score >= 50 ? C.cyan : score >= 35 ? C.amber : C.red;
  return (
    <div className="grid grid-cols-[1fr_60px_80px_50px] items-center gap-2 py-1.5"
      style={{ borderBottom: `1px solid ${C.border}` }}>
      <span className="text-xs" style={{ color: "var(--text-primary)" }}>{label}</span>
      <div className="h-1.5 rounded-full" style={{ background: C.border }}>
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-xs font-mono text-right" style={{ color }}>{score}/100</span>
      <span className="text-xs font-mono text-right" style={{ color: C.muted }}>{(weight * 100).toFixed(0)}%</span>
    </div>
  );
}

function fmt$(v: number): string {
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3)  return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v}`;
}
function fmtPct(v: number): string { return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`; }

// ── Tabs ──────────────────────────────────────────────────────────────────────
const TABS = ["Overview", "Trades", "Buyers & Sellers", "Options", "Sectors",
              "Committees", "Government", "Legislation", "Performance", "Composite"];

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CongressionalPage() {
  const [tab, setTab] = useState("Overview");

  // ── Queries ──────────────────────────────────────────────────────────────────
  const overview    = useQuery({ queryKey: ["cong-overview"],    queryFn: api.getCongressionalOverview,    staleTime: 300_000, enabled: tab === "Overview" });
  const trades      = useQuery({ queryKey: ["cong-trades"],      queryFn: api.getCongressionalTrades,      staleTime: 300_000, enabled: tab === "Trades" });
  const buyers      = useQuery({ queryKey: ["cong-buyers"],      queryFn: api.getCongressionalBuyers,      staleTime: 300_000, enabled: tab === "Buyers & Sellers" });
  const sellers     = useQuery({ queryKey: ["cong-sellers"],     queryFn: api.getCongressionalSellers,     staleTime: 300_000, enabled: tab === "Buyers & Sellers" });
  const optionsQ    = useQuery({ queryKey: ["cong-options"],     queryFn: api.getCongressionalOptions,     staleTime: 300_000, enabled: tab === "Options" });
  const sectors     = useQuery({ queryKey: ["cong-sectors"],     queryFn: api.getCongressionalSectors,     staleTime: 300_000, enabled: tab === "Sectors" });
  const committees  = useQuery({ queryKey: ["cong-committees"],  queryFn: api.getCongressionalCommittees,  staleTime: 300_000, enabled: tab === "Committees" });
  const government  = useQuery({ queryKey: ["cong-government"],  queryFn: api.getCongressionalGovernment,  staleTime: 300_000, enabled: tab === "Government" });
  const legislation = useQuery({ queryKey: ["cong-legislation"], queryFn: api.getCongressionalLegislation, staleTime: 300_000, enabled: tab === "Legislation" });
  const performance = useQuery({ queryKey: ["cong-performance"], queryFn: api.getCongressionalPerformance, staleTime: 300_000, enabled: tab === "Performance" });
  const composite   = useQuery({ queryKey: ["cong-composite"],   queryFn: api.getCongressionalComposite,   staleTime: 300_000, enabled: tab === "Composite" });

  return (
    <div className="p-6 space-y-6">
      <PageGuide
        title="Congressional Trading Intelligence"
        subtitle="Track STOCK Act disclosures to identify political alpha — trades made by US senators and representatives before major legislation."
        steps={[
          { title: "Overview Tab", detail: "See the aggregate stats: total disclosed trades this period, most active traders, top-bought and top-sold stocks, and the political alpha composite score vs. S&P 500." },
          { title: "Trades Tab", detail: "Browse individual trade disclosures: the member of Congress, stock traded, transaction type (buy/sell/exchange), amount range, and days to disclosure (STOCK Act requires 45-day reporting)." },
          { title: "Buyers & Sellers Tab", detail: "See which congresspeople are consistently net buyers (bullish thesis) vs. net sellers. Concentrations in specific sectors often reveal forthcoming legislation or contract awards." },
          { title: "Sectors Tab", detail: "Aggregate congressional trading activity by sector. Heavy buying in defense ahead of a budget vote, or tech buying ahead of a regulatory bill, are the most actionable patterns." },
          { title: "Committees Tab", detail: "Members on the Armed Services, Financial Services, or Energy committees have information advantages in their respective sectors. Filter trades by committee membership to identify the highest-information trades." },
          { title: "Performance Tab", detail: "Historical backtest: if you bought every congressional purchase within 10 days of disclosure, what was the performance vs. SPY? This tab shows the evidence for (or against) political alpha." },
        ]}
        howItWorks={[
          { title: "STOCK Act Data", detail: "The STOCK Act (2012) requires members of Congress and their immediate families to disclose stock trades within 45 days of the transaction. Disclosures are filed with the House Clerk and Senate Secretary and are publicly available." },
          { title: "Political Alpha Signal", detail: "Research has documented 6–12% annual alpha from mimicking congressional trades on a 10-day lag. The effect is strongest for committee members trading in their committee's sector, and for trades in the 30 days before major legislation." },
          { title: "Trade Classification", detail: "Purchases, sales, and exchanges are classified by amount range (SEC uses ranges: <$15K, $15–50K, $50–100K, $100–250K, $250K–$500K, $500K–$1M, $1M+). The midpoint of each range is used for return calculations." },
          { title: "Benchmark Comparison", detail: "Each disclosed trade is compared to SPY over the same holding period. Positive alpha = the congressional trade outperformed the S&P 500 by that amount." },
        ]}
        tips={[
          "Focus on cluster trades: when 3+ congresspeople buy the same stock within 2 weeks of each other, especially from the same committee — this is the highest-conviction political signal.",
          "Trades by members on the Appropriations or Armed Services committees in defense stocks often precede contract announcements — check recent disclosed purchases vs. upcoming DoD budget news.",
          "The 45-day disclosure lag means you're always trading on 'old' information — use it as confirmation of a thesis rather than as a primary trade trigger.",
        ]}
      />

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Congressional Trading Intelligence
          </h1>
          <p className="text-xs mt-0.5" style={{ color: C.muted }}>
            STOCK Act Disclosures · Political Alpha · Legislative Catalysts · Government Spending
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-2 py-1 rounded font-semibold"
            style={{ background: "#14402a", color: C.green }}>LIVE MOCK</span>
          <span className="text-[10px] px-2 py-1 rounded font-semibold"
            style={{ background: "#1a1f2e", color: C.muted }}>STOCK Act</span>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-1 flex-wrap" style={{ borderBottom: `1px solid ${C.border}` }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-3 py-2 text-xs font-medium transition-colors"
            style={{
              color: tab === t ? "var(--text-primary)" : C.muted,
              borderBottom: tab === t ? `2px solid var(--accent, #6366f1)` : "2px solid transparent",
            }}>
            {t}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          OVERVIEW TAB
      ════════════════════════════════════════════════════════════════════════ */}
      {tab === "Overview" && (
        overview.isLoading ? <Loading /> :
        overview.isError   ? <Err msg="Failed to load overview" /> :
        overview.data ? (
          <div className="space-y-6">
            {/* Top panel */}
            <div className="grid grid-cols-[auto_1fr] gap-6">
              {/* Gauge */}
              <div className="rounded-lg p-5 flex flex-col items-center justify-center" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
                <SH>Congressional Bullishness Score</SH>
                <BullishnessGauge score={overview.data.bullishness.score} label={overview.data.bullishness.label} />
                <div className="grid grid-cols-3 gap-4 mt-4 w-full">
                  <div className="text-center">
                    <div className="text-[10px]" style={{ color: C.muted }}>Net Flow</div>
                    <div className="text-sm font-mono font-bold" style={{ color: C.green }}>
                      {fmt$(overview.data.bullishness.net_flow)}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px]" style={{ color: C.muted }}>Positioning</div>
                    <div className="text-sm font-semibold" style={{ color: C.cyan }}>{overview.data.positioning}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px]" style={{ color: C.muted }}>Traders</div>
                    <div className="text-sm font-mono font-bold" style={{ color: "var(--text-primary)" }}>
                      {overview.data.bullishness.active_traders}
                    </div>
                  </div>
                </div>
              </div>

              {/* KPI grid */}
              <div className="grid grid-cols-3 gap-3">
                <Kpi label="Total Purchases (30D)" value={fmt$(overview.data.bullishness.total_purchases_30d)} color={C.green} />
                <Kpi label="Total Sales (30D)"     value={fmt$(overview.data.bullishness.total_sales_30d)}     color={C.red} />
                <Kpi label="Net Congressional Flow" value={fmt$(overview.data.bullishness.net_flow)}           color={C.cyan} />
                <Kpi label="Active Traders"         value={`${overview.data.kpis.total_politicians_tracked}`}  sub={`${overview.data.kpis.house_members}H + ${overview.data.kpis.senate_members}S`} />
                <Kpi label="Trades This Month"      value={`${overview.data.kpis.total_trades_30d}`}           sub={`${overview.data.kpis.buy_count} buys / ${overview.data.kpis.sell_count} sells`} color={C.amber} />
                <Kpi label="Avg Conviction"         value={`${overview.data.kpis.avg_conviction}/100`}         sub={`${overview.data.kpis.committee_linked_trades} committee-linked`} color={C.purple} />
              </div>
            </div>

            {/* Top trades + Alerts */}
            <div className="grid grid-cols-2 gap-6">
              {/* Top trades */}
              <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
                <SH>Largest Transactions (30D)</SH>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ color: C.muted }}>
                      <th className="text-left pb-2">Politician</th>
                      <th className="text-left pb-2">Ticker</th>
                      <th className="text-left pb-2">Action</th>
                      <th className="text-left pb-2">Size</th>
                      <th className="text-left pb-2">Conv</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.data.top_trades.map((t, i) => (
                      <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td className="py-1.5">
                          <div className="flex items-center gap-1.5">
                            <PartyBadge party={t.party} />
                            <span style={{ color: "var(--text-primary)" }}>{t.politician.split(" ").slice(-1)[0]}</span>
                          </div>
                        </td>
                        <td className="py-1.5 font-mono font-bold" style={{ color: C.cyan }}><TickerChip ticker={t.ticker} showDetail={false} /></td>
                        <td className="py-1.5"><ActionBadge action={t.action} /></td>
                        <td className="py-1.5 font-mono text-[10px]" style={{ color: "var(--text-primary)" }}>{t.size}</td>
                        <td className="py-1.5"><ConvBar score={t.conviction} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Alerts */}
              <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
                <SH>Active Intelligence Alerts</SH>
                <div className="space-y-2">
                  {overview.data.alerts.map(a => (
                    <div key={a.id} className="rounded p-3" style={{ background: "var(--surface, #111827)", border: `1px solid ${C.border}` }}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{a.title}</span>
                        <PriBadge p={a.priority} />
                      </div>
                      <p className="text-[10px]" style={{ color: C.muted }}>{a.detail}</p>
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {a.tickers.map(tkr => (
                          <span key={tkr} className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                            style={{ background: "#1a2a3f", color: C.cyan }}>
                            <TickerChip ticker={tkr} showDetail={false} />
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Market technicals */}
            <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
              <SH>Most-Traded Stocks — Technical Signals</SH>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ color: C.muted }}>
                      {["Ticker","Price","Chg%","RSI","MACD","EMA20","Signal","Score"].map(h => (
                        <th key={h} className="text-right pb-2 first:text-left px-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(overview.data.markets).map(([tkr, m]) => (
                      <tr key={tkr} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td className="py-1.5 font-mono font-bold px-2" style={{ color: C.cyan }}><TickerChip ticker={tkr} showDetail={false} /></td>
                        <td className="py-1.5 font-mono text-right px-2" style={{ color: "var(--text-primary)" }}>${m.price.toFixed(2)}</td>
                        <td className="py-1.5 font-mono text-right px-2" style={{ color: m.chg_pct >= 0 ? C.green : C.red }}>
                          {m.chg_pct >= 0 ? "+" : ""}{m.chg_pct.toFixed(2)}%
                        </td>
                        <td className="py-1.5 font-mono text-right px-2" style={{ color: m.rsi > 70 ? C.red : m.rsi < 30 ? C.green : C.amber }}>{m.rsi.toFixed(1)}</td>
                        <td className="py-1.5 font-mono text-right px-2" style={{ color: m.macd > m.macd_signal ? C.green : C.red }}>{m.macd.toFixed(3)}</td>
                        <td className="py-1.5 font-mono text-right px-2" style={{ color: C.muted }}>${m.ema20.toFixed(2)}</td>
                        <td className="py-1.5 text-right px-2"><SigBadge sig={m.signal} /></td>
                        <td className="py-1.5 text-right px-2"><ConvBar score={m.score} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TRADES TAB
      ════════════════════════════════════════════════════════════════════════ */}
      {tab === "Trades" && (
        trades.isLoading ? <Loading /> :
        trades.isError   ? <Err msg="Failed to load trades" /> :
        trades.data ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <SH>Full Trade Disclosure Feed — {trades.data.total} Trades</SH>
              <span className="text-[10px]" style={{ color: C.muted }}>STOCK Act 45-Day Disclosure Window</span>
            </div>
            <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
              <table className="w-full text-xs">
                <thead style={{ background: C.surf2 }}>
                  <tr style={{ color: C.muted }}>
                    {["Politician","Chamber","Ticker","Type","Action","Size","Sector","Committee","Trade Date","Conv."].map(h => (
                      <th key={h} className="text-left py-2 px-3 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trades.data.trades.map((t, i) => (
                    <tr key={i}
                      style={{ borderTop: `1px solid ${C.border}`, background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1.5">
                          <PartyBadge party={t.party} />
                          <span style={{ color: "var(--text-primary)" }}>{t.politician}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3" style={{ color: C.muted }}>{t.chamber}</td>
                      <td className="py-2 px-3 font-mono font-bold" style={{ color: C.cyan }}><TickerChip ticker={t.ticker} showDetail={false} /></td>
                      <td className="py-2 px-3" style={{ color: C.muted }}>{t.asset_type}</td>
                      <td className="py-2 px-3"><ActionBadge action={t.action} /></td>
                      <td className="py-2 px-3 font-mono text-[10px]" style={{ color: "var(--text-primary)" }}>{t.size_label}</td>
                      <td className="py-2 px-3" style={{ color: C.muted }}>{t.sector}</td>
                      <td className="py-2 px-3">
                        {t.committee_link ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                            style={{ background: "#2a1f3f", color: C.purple }}>{t.committee_link}</span>
                        ) : <span style={{ color: C.muted }}>—</span>}
                      </td>
                      <td className="py-2 px-3 font-mono" style={{ color: C.muted }}>{t.trade_date}</td>
                      <td className="py-2 px-3"><ConvBar score={t.conviction} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          BUYERS & SELLERS TAB
      ════════════════════════════════════════════════════════════════════════ */}
      {tab === "Buyers & Sellers" && (
        (buyers.isLoading || sellers.isLoading) ? <Loading /> :
        (buyers.isError || sellers.isError)     ? <Err msg="Failed to load" /> :
        (buyers.data && sellers.data) ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              {/* Top Buyers */}
              <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
                <SH>Top Buyers — Ranked by Purchase Volume</SH>
                <div className="space-y-2">
                  {buyers.data.buyers.map((b, i) => (
                    <div key={b.name} className="rounded p-3" style={{ background: "var(--surface, #111827)", border: `1px solid ${C.border}` }}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold" style={{ color: C.muted }}>#{i + 1}</span>
                          <PartyBadge party={b.party} />
                          <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{b.name}</span>
                          <span className="text-[10px]" style={{ color: C.muted }}>{b.state} · {b.chamber}</span>
                        </div>
                        <span className="text-sm font-mono font-bold" style={{ color: C.green }}>{fmt$(b.total_purchases)}</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-[10px]">
                        <div><span style={{ color: C.muted }}>Trades: </span><span className="font-mono" style={{ color: "var(--text-primary)" }}>{b.num_trades}</span></div>
                        <div><span style={{ color: C.muted }}>Win%: </span><span className="font-mono" style={{ color: C.green }}>{(b.win_rate * 100).toFixed(0)}%</span></div>
                        <div><span style={{ color: C.muted }}>Alpha: </span><span className="font-mono" style={{ color: b.avg_alpha >= 0 ? C.green : C.red }}>{fmtPct(b.avg_alpha)}</span></div>
                        <div><span style={{ color: C.muted }}>Conv: </span><span className="font-mono" style={{ color: C.cyan }}>{b.avg_conviction}</span></div>
                      </div>
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {b.tickers.map(tkr => (
                          <span key={tkr} className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                            style={{ background: "#14402a", color: C.green }}>
                            <TickerChip ticker={tkr} showDetail={false} />
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Sellers + Risk Exits */}
              <div className="space-y-4">
                <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
                  <SH>Top Sellers — Risk Reduction Activity</SH>
                  <div className="space-y-2">
                    {sellers.data.sellers.map((s, i) => (
                      <div key={s.name} className="rounded p-3" style={{ background: "var(--surface, #111827)", border: `1px solid ${C.border}` }}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <PartyBadge party={s.party} />
                            <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{s.name}</span>
                          </div>
                          <span className="text-sm font-mono font-bold" style={{ color: C.red }}>{fmt$(s.total_sales)}</span>
                        </div>
                        <div className="text-[10px]" style={{ color: C.muted }}>
                          Exiting: {s.sectors_exiting.join(", ")} · {s.num_trades} trade{s.num_trades !== 1 ? "s" : ""}
                        </div>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {s.tickers.map(tkr => (
                            <span key={tkr} className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                              style={{ background: "#3f1515", color: C.red }}>
                              <TickerChip ticker={tkr} showDetail={false} /></span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
                  <SH>Political Risk Reduction — Watchlist</SH>
                  <div className="space-y-2">
                    {sellers.data.risk_exits.map(r => (
                      <div key={r.ticker} className="flex items-start justify-between gap-3 py-2"
                        style={{ borderBottom: `1px solid ${C.border}` }}>
                        <div>
                          <TickerChip ticker={r.ticker} showDetail={false} />
                          <span className="text-[10px] ml-2" style={{ color: C.muted }}>{r.reason}</span>
                        </div>
                        <div className="shrink-0">
                          <div className="text-[10px] text-right" style={{ color: C.muted }}>Risk Score</div>
                          <div className="text-sm font-mono font-bold text-right" style={{ color: r.risk_score > 70 ? C.red : C.amber }}>{r.risk_score}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          OPTIONS TAB
      ════════════════════════════════════════════════════════════════════════ */}
      {tab === "Options" && (
        optionsQ.isLoading ? <Loading /> :
        optionsQ.isError   ? <Err msg="Failed to load options" /> :
        optionsQ.data ? (
          <div className="space-y-6">
            {/* Sentiment bar */}
            <div className="grid grid-cols-4 gap-4">
              <Kpi label="Call Volume"   value={fmt$(optionsQ.data.sentiment.call_volume)}  color={C.green} />
              <Kpi label="Put Volume"    value={fmt$(optionsQ.data.sentiment.put_volume)}   color={C.red} />
              <Kpi label="Put/Call Ratio" value={optionsQ.data.sentiment.put_call_ratio.toFixed(2)} sub="< 0.5 = Bullish" color={C.cyan} />
              <Kpi label="Options Sentiment" value={optionsQ.data.sentiment.sentiment} color={optionsQ.data.sentiment.sentiment === "Bullish" ? C.green : C.red} />
            </div>

            {/* Options chart */}
            <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
              <SH>Options Volume by Sector</SH>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={[
                  { sector: "Defense", calls: 150000, puts: 0 },
                  { sector: "Tech", calls: 500000, puts: 100000 },
                  { sector: "Semis", calls: 250000, puts: 0 },
                  { sector: "Finance", calls: 100000, puts: 0 },
                  { sector: "EV", calls: 0, puts: 100000 },
                  { sector: "Health", calls: 0, puts: 500000 },
                ]} margin={{ top: 0, right: 10, bottom: 0, left: 0 }}>
                  <XAxis dataKey="sector" tick={TICK} />
                  <YAxis tick={TICK} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                  <Tooltip formatter={(v: number) => fmt$(v)} contentStyle={{ background: C.surf2, border: `1px solid ${C.border}`, fontSize: 11 }} />
                  <Bar dataKey="calls" name="Calls" fill={C.green} opacity={0.85} />
                  <Bar dataKey="puts"  name="Puts"  fill={C.red}   opacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Options table */}
            <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
              <SH>Congressional Options Positions — Sorted by Conviction</SH>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: C.muted }}>
                    {["Politician","Type","Ticker","Option","Strike","Expiry","Size","Sector","Date","Conv."].map(h => (
                      <th key={h} className="text-left pb-2 pr-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {optionsQ.data.options.map((o, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td className="py-1.5 pr-3">
                        <div className="flex items-center gap-1">
                          <PartyBadge party={o.party} />
                          <span style={{ color: "var(--text-primary)" }}>{o.politician.split(" ").slice(-1)[0]}</span>
                        </div>
                      </td>
                      <td className="py-1.5 pr-3" style={{ color: C.muted }}>{o.state}</td>
                      <td className="py-1.5 pr-3 font-mono font-bold" style={{ color: C.cyan }}><TickerChip ticker={o.ticker} showDetail={false} /></td>
                      <td className="py-1.5 pr-3">
                        <span className="font-bold text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: o.option_type === "Call" ? "#14402a" : "#3f1515", color: o.option_type === "Call" ? C.green : C.red }}>
                          {o.option_type.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 font-mono" style={{ color: "var(--text-primary)" }}>${o.strike}</td>
                      <td className="py-1.5 pr-3 font-mono" style={{ color: C.muted }}>{o.expiry}</td>
                      <td className="py-1.5 pr-3 font-mono text-[10px]" style={{ color: "var(--text-primary)" }}>{o.size_label}</td>
                      <td className="py-1.5 pr-3" style={{ color: C.muted }}>{o.sector}</td>
                      <td className="py-1.5 pr-3 font-mono" style={{ color: C.muted }}>{o.trade_date}</td>
                      <td className="py-1.5"><ConvBar score={o.conviction} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          SECTORS TAB
      ════════════════════════════════════════════════════════════════════════ */}
      {tab === "Sectors" && (
        sectors.isLoading ? <Loading /> :
        sectors.isError   ? <Err msg="Failed to load sectors" /> :
        sectors.data ? (
          <div className="space-y-6">
            {/* Flow chart */}
            <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
              <SH>Sector Net Flow — Congressional Buying vs Selling</SH>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={sectors.data.sectors.map(s => ({
                  sector: s.sector, buy: s.net_buy / 1000, sell: -s.net_sell / 1000,
                }))} margin={{ top: 0, right: 10, bottom: 0, left: 40 }}>
                  <XAxis dataKey="sector" tick={TICK} />
                  <YAxis tick={TICK} tickFormatter={v => `$${Math.abs(v).toFixed(0)}K`} />
                  <Tooltip formatter={(v: number, n: string) => [`$${Math.abs(v).toFixed(0)}K`, n === "buy" ? "Buys" : "Sells"]}
                    contentStyle={{ background: C.surf2, border: `1px solid ${C.border}`, fontSize: 11 }} />
                  <Bar dataKey="buy"  name="Buys"  fill={C.green} opacity={0.85} />
                  <Bar dataKey="sell" name="Sells" fill={C.red}   opacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Sector cards */}
            <div className="grid grid-cols-2 gap-4">
              {sectors.data.sectors.map(s => {
                const trendColor = s.trend === "Strong Buy" ? C.green : s.trend === "Accumulating" ? C.cyan : s.trend === "Distributing" ? C.red : s.trend === "Mild Buy" ? "#86efac" : C.amber;
                return (
                  <div key={s.sector} className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{s.sector}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ color: trendColor, border: `1px solid ${trendColor}` }}>
                        {s.trend}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mb-3 text-[10px]">
                      <div>
                        <div style={{ color: C.muted }}>Net Buy</div>
                        <div className="font-mono font-bold" style={{ color: C.green }}>{fmt$(s.net_buy)}</div>
                      </div>
                      <div>
                        <div style={{ color: C.muted }}>Net Sell</div>
                        <div className="font-mono font-bold" style={{ color: C.red }}>{fmt$(s.net_sell)}</div>
                      </div>
                      <div>
                        <div style={{ color: C.muted }}>Traders</div>
                        <div className="font-mono font-bold" style={{ color: "var(--text-primary)" }}>{s.active_traders}</div>
                      </div>
                    </div>
                    <div className="mb-2">
                      <div className="text-[10px] mb-1" style={{ color: C.muted }}>Political Flow Score</div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full" style={{ background: C.border }}>
                          <div className="h-full rounded-full" style={{ width: `${s.flow_score}%`, background: trendColor }} />
                        </div>
                        <span className="text-xs font-mono font-bold" style={{ color: trendColor }}>{s.flow_score}</span>
                      </div>
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {s.top_tickers.map(tkr => (
                        <span key={tkr} className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                          style={{ background: "#1a2a3f", color: C.cyan }}>
                          <TickerChip ticker={tkr} showDetail={false} />
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          COMMITTEES TAB
      ════════════════════════════════════════════════════════════════════════ */}
      {tab === "Committees" && (
        committees.isLoading ? <Loading /> :
        committees.isError   ? <Err msg="Failed to load committees" /> :
        committees.data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {committees.data.committees.map(c => (
                <div key={c.name} className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{c.name}</div>
                      <div className="text-[10px]" style={{ color: C.muted }}>{c.chamber} · {c.sector_focus}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px]" style={{ color: C.muted }}>Influence</div>
                      <div className="text-lg font-mono font-bold" style={{ color: C.purple }}>{c.influence_score}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[10px] mb-3">
                    <div>
                      <div style={{ color: C.muted }}>Budget Auth</div>
                      <div className="font-mono font-bold" style={{ color: C.amber }}>
                        {c.budget_authority ? fmt$(c.budget_authority) : "N/A"}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: C.muted }}>Pending Bills</div>
                      <div className="font-mono font-bold" style={{ color: C.cyan }}>{c.pending_bills}</div>
                    </div>
                    <div>
                      <div style={{ color: C.muted }}>Linked Trades</div>
                      <div className="font-mono font-bold" style={{ color: c.linked_trades > 0 ? C.green : C.muted }}>{c.linked_trades}</div>
                    </div>
                  </div>
                  {c.member_buy_volume > 0 && (
                    <div className="text-[10px] mb-2">
                      <span style={{ color: C.muted }}>Member buying: </span>
                      <span className="font-mono font-bold" style={{ color: C.green }}>{fmt$(c.member_buy_volume)}</span>
                    </div>
                  )}
                  <div className="text-[10px]" style={{ color: C.muted }}>Members:</div>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {c.members.map(m => (
                      <span key={m} className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ background: "#2a1f3f", color: C.purple }}>{m.split(" ").slice(-1)[0]}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          GOVERNMENT TAB
      ════════════════════════════════════════════════════════════════════════ */}
      {tab === "Government" && (
        government.isLoading ? <Loading /> :
        government.isError   ? <Err msg="Failed to load government data" /> :
        government.data ? (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <Kpi label="Total Spending Tracked" value={fmt$(government.data.total_spending_tracked)} color={C.amber} />
              <Kpi label="Total Contract Value"   value={fmt$(government.data.total_contracts)}       color={C.cyan} />
              <Kpi label="Fastest Growing"        value={government.data.fastest_growing}             sub="YoY growth leader" color={C.green} />
            </div>

            {/* Spending */}
            <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
              <SH>FY2026 Government Spending — Congressional Buying Correlation</SH>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: C.muted }}>
                    {["Category","FY Budget","YoY Growth","Beneficiaries","Members Buying"].map(h => (
                      <th key={h} className="text-left pb-2 pr-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {government.data.spending.map((s, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td className="py-2 pr-4 font-semibold" style={{ color: "var(--text-primary)" }}>{s.category}</td>
                      <td className="py-2 pr-4 font-mono" style={{ color: C.amber }}>{fmt$(s.fy_budget)}</td>
                      <td className="py-2 pr-4 font-mono" style={{ color: s.yoy_growth > 0.1 ? C.green : s.yoy_growth > 0 ? C.cyan : C.red }}>
                        +{(s.yoy_growth * 100).toFixed(1)}%
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex gap-1 flex-wrap">
                          {s.beneficiaries.slice(0, 4).map(t => (
                            <span key={t} className="text-[10px] font-mono px-1 py-0.5 rounded"
                              style={{ background: "#1a2a3f", color: C.cyan }}>{t}</span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2 pr-4">
                        {s.congressional_buys.length > 0 ? (
                          <div className="flex gap-1 flex-wrap">
                            {s.congressional_buys.slice(0, 2).map(n => (
                              <span key={n} className="text-[10px] px-1 py-0.5 rounded"
                                style={{ background: "#14402a", color: C.green }}>{n.split(" ").slice(-1)[0]}</span>
                            ))}
                            {s.congressional_buys.length > 2 && (
                              <span className="text-[10px]" style={{ color: C.muted }}>+{s.congressional_buys.length - 2}</span>
                            )}
                          </div>
                        ) : <span style={{ color: C.muted }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Contracts */}
            <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
              <SH>Government Contract Tracker — Contract Momentum Score</SH>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: C.muted }}>
                    {["Company","Ticker","Sector","FY Contracts","YoY%","Gov Rev%","Recent Award","Award Value","Momentum"].map(h => (
                      <th key={h} className="text-left pb-2 pr-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {government.data.contracts.map((c, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td className="py-2 pr-3" style={{ color: "var(--text-primary)" }}>{c.company}</td>
                      <td className="py-2 pr-3 font-mono font-bold" style={{ color: C.cyan }}><TickerChip ticker={c.ticker} showDetail={false} /></td>
                      <td className="py-2 pr-3" style={{ color: C.muted }}>{c.sector}</td>
                      <td className="py-2 pr-3 font-mono" style={{ color: C.amber }}>{fmt$(c.total_fy)}</td>
                      <td className="py-2 pr-3 font-mono" style={{ color: C.green }}>+{(c.yoy_growth * 100).toFixed(1)}%</td>
                      <td className="py-2 pr-3 font-mono" style={{ color: C.muted }}>{(c.gov_rev_pct * 100).toFixed(0)}%</td>
                      <td className="py-2 pr-3 text-[10px]" style={{ color: C.muted }}>{c.recent_award}</td>
                      <td className="py-2 pr-3 font-mono" style={{ color: C.purple }}>{fmt$(c.award_value)}</td>
                      <td className="py-2 pr-3"><ConvBar score={c.momentum} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          LEGISLATION TAB
      ════════════════════════════════════════════════════════════════════════ */}
      {tab === "Legislation" && (
        legislation.isLoading ? <Loading /> :
        legislation.isError   ? <Err msg="Failed to load legislation" /> :
        legislation.data ? (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <Kpi label="Positive Bills" value={`${legislation.data.positive_count}`} sub="Market tailwinds" color={C.green} />
              <Kpi label="Negative Bills" value={`${legislation.data.negative_count}`} sub="Regulatory risk"  color={C.red} />
              <Kpi label="Mixed Bills"    value={`${legislation.data.mixed_count}`}    sub="Sector-dependent" color={C.amber} />
            </div>

            {/* Bills */}
            <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
              <SH>Legislative Pipeline — Impact Tracker</SH>
              <div className="space-y-3">
                {legislation.data.bills.map((b, i) => (
                  <div key={i} className="rounded p-3" style={{ background: "var(--surface, #111827)", border: `1px solid ${C.border}` }}>
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div>
                        <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{b.bill}</span>
                        <span className="text-[10px] ml-2 px-1.5 py-0.5 rounded"
                          style={{ background: "#1a2a3f", color: C.muted }}>{b.status}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <ImpactBadge v={b.impact} />
                        <span className="text-[10px] font-mono" style={{ color: C.muted }}>{b.catalyst_date}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-[10px]">
                      <div>
                        <span style={{ color: C.muted }}>Sector: </span>
                        <span style={{ color: C.amber }}>{b.sector}</span>
                      </div>
                      {b.budget && (
                        <div>
                          <span style={{ color: C.muted }}>Budget: </span>
                          <span className="font-mono" style={{ color: C.cyan }}>{fmt$(b.budget)}</span>
                        </div>
                      )}
                    </div>
                    {b.beneficiaries.length > 0 && (
                      <div className="mt-2 flex gap-1 items-center flex-wrap">
                        <span className="text-[10px]" style={{ color: C.green }}>Beneficiaries:</span>
                        {b.beneficiaries.map(t => (
                          <span key={t} className="text-[10px] font-mono px-1 py-0.5 rounded"
                            style={{ background: "#14402a", color: C.green }}>
                            <TickerChip ticker={t} showDetail={false} />
                          </span>
                        ))}
                      </div>
                    )}
                    {b.at_risk.length > 0 && (
                      <div className="mt-1 flex gap-1 items-center flex-wrap">
                        <span className="text-[10px]" style={{ color: C.red }}>At Risk:</span>
                        {b.at_risk.map(t => (
                          <span key={t} className="text-[10px] font-mono px-1 py-0.5 rounded"
                            style={{ background: "#3f1515", color: C.red }}>
                            <TickerChip ticker={t} showDetail={false} />
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Lobbying */}
            <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
              <SH>Corporate Lobbying & PAC Intelligence — Political Influence Score</SH>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: C.muted }}>
                    {["Company","Ticker","Sector","Annual Spend","PAC Contributions","Key Committees","Influence Score"].map(h => (
                      <th key={h} className="text-left pb-2 pr-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {legislation.data.lobbying.map((l, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td className="py-2 pr-4" style={{ color: "var(--text-primary)" }}>{l.company}</td>
                      <td className="py-2 pr-4 font-mono font-bold" style={{ color: C.cyan }}><TickerChip ticker={l.ticker} showDetail={false} /></td>
                      <td className="py-2 pr-4" style={{ color: C.muted }}>{l.sector}</td>
                      <td className="py-2 pr-4 font-mono" style={{ color: C.amber }}>{fmt$(l.annual_spend)}</td>
                      <td className="py-2 pr-4 font-mono" style={{ color: C.purple }}>{fmt$(l.pac_contributions)}</td>
                      <td className="py-2 pr-4">
                        <div className="flex gap-1 flex-wrap">
                          {l.key_committees.map(c => (
                            <span key={c} className="text-[10px] px-1 py-0.5 rounded"
                              style={{ background: "#2a1f3f", color: C.purple }}>{c}</span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2 pr-4"><ConvBar score={l.influence_score} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          PERFORMANCE TAB
      ════════════════════════════════════════════════════════════════════════ */}
      {tab === "Performance" && (
        performance.isLoading ? <Loading /> :
        performance.isError   ? <Err msg="Failed to load performance" /> :
        performance.data ? (
          <div className="space-y-6">
            {/* Alpha leaderboard chart */}
            <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
              <SH>Political Alpha Leaderboard — Excess Returns vs S&P 500</SH>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={performance.data.performance.map(p => ({
                  name: p.name.split(" ").slice(-1)[0],
                  alpha: +(p.vs_sp500 * 100).toFixed(1),
                }))} margin={{ top: 0, right: 10, bottom: 0, left: 20 }}>
                  <XAxis dataKey="name" tick={TICK} />
                  <YAxis tick={TICK} tickFormatter={v => `${v}%`} />
                  <Tooltip formatter={(v: number) => [`${v}%`, "Alpha vs S&P"]}
                    contentStyle={{ background: C.surf2, border: `1px solid ${C.border}`, fontSize: 11 }} />
                  <Bar dataKey="alpha" name="Alpha vs S&P">
                    {performance.data.performance.map((p, i) => (
                      <Cell key={i} fill={p.vs_sp500 >= 0 ? C.green : C.red} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Performance table */}
            <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
              <SH>Comprehensive Politician Performance Dashboard</SH>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: C.muted }}>
                    {["Rank","Politician","Style","Trades","Win Rate","Avg Alpha","Ann. Return","vs S&P","Best Trade","Worst Trade"].map(h => (
                      <th key={h} className="text-left pb-2 pr-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {performance.data.performance.map((p, i) => (
                    <tr key={p.name} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td className="py-2 pr-3 font-mono font-bold" style={{ color: i < 3 ? C.amber : C.muted }}>#{i + 1}</td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-1.5">
                          <PartyBadge party={p.party} />
                          <span style={{ color: "var(--text-primary)" }}>{p.name}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-3" style={{ color: C.muted }}>{p.style}</td>
                      <td className="py-2 pr-3 font-mono" style={{ color: "var(--text-primary)" }}>{p.total_trades}</td>
                      <td className="py-2 pr-3 font-mono" style={{ color: p.win_rate >= 0.65 ? C.green : p.win_rate >= 0.5 ? C.amber : C.red }}>
                        {(p.win_rate * 100).toFixed(0)}%
                      </td>
                      <td className="py-2 pr-3 font-mono" style={{ color: p.avg_alpha >= 0 ? C.green : C.red }}>
                        {fmtPct(p.avg_alpha)}
                      </td>
                      <td className="py-2 pr-3 font-mono" style={{ color: p.annualized_return >= 0.15 ? C.green : C.amber }}>
                        {fmtPct(p.annualized_return)}
                      </td>
                      <td className="py-2 pr-3 font-mono font-bold" style={{ color: p.vs_sp500 >= 0 ? C.green : C.red }}>
                        {fmtPct(p.vs_sp500)}
                      </td>
                      <td className="py-2 pr-3 text-[10px]" style={{ color: C.green }}>{p.best_trade}</td>
                      <td className="py-2 pr-3 text-[10px]" style={{ color: C.red }}>{p.worst_trade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          COMPOSITE TAB
      ════════════════════════════════════════════════════════════════════════ */}
      {tab === "Composite" && (
        composite.isLoading ? <Loading /> :
        composite.isError   ? <Err msg="Failed to load composite" /> :
        composite.data ? (
          <div className="space-y-6">
            {/* Top panel */}
            <div className="grid grid-cols-[auto_1fr] gap-6">
              <div className="rounded-lg p-5 flex flex-col items-center" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
                <SH>Congressional Conviction Score</SH>
                <BullishnessGauge score={composite.data.composite_score} label={composite.data.label} />
                <div className="text-xs mt-2 text-center" style={{ color: C.muted }}>
                  Weighted: Buying · Conviction · Accuracy · Committee · Options · Legislation · Smart Money
                </div>
              </div>
              <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
                <SH>Composite Score Components</SH>
                <div className="space-y-0.5">
                  {Object.entries(composite.data.components).map(([label, c]) => (
                    <ScoreBar key={label} label={label} score={c.score} weight={c.weight} />
                  ))}
                </div>
              </div>
            </div>

            {/* Alerts */}
            <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
              <SH>AI-Powered Alert Engine — Active Signals</SH>
              <div className="grid grid-cols-2 gap-3">
                {composite.data.alerts.map(a => (
                  <div key={a.id} className="rounded p-3" style={{ background: "var(--surface, #111827)", border: `1px solid ${C.border}` }}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{a.title}</span>
                      <PriBadge p={a.priority} />
                    </div>
                    <p className="text-[10px] mb-2" style={{ color: C.muted }}>{a.detail}</p>
                    <div className="flex gap-1 flex-wrap">
                      {a.tickers.map(t => (
                        <span key={t} className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                          style={{ background: "#1a2a3f", color: C.cyan }}>{t}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Cluster buys + Screener */}
            <div className="grid grid-cols-2 gap-6">
              {/* Cluster buys */}
              <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
                <SH>Congressional Buy Clusters — Hedge Fund Screener</SH>
                {Object.entries(composite.data.cluster_buys).map(([sector, members]) => (
                  <div key={sector} className="mb-4 pb-3" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <div className="text-xs font-semibold mb-2" style={{ color: C.cyan }}>{sector}</div>
                    <div className="flex gap-1 flex-wrap">
                      {(members as string[]).map(m => (
                        <span key={m} className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: "#14402a", color: C.green }}>{m.split(" ").slice(-1)[0]}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Best longs + Short candidates */}
              <div className="space-y-4">
                <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
                  <SH>Best Long Ideas — Political Alpha</SH>
                  <div className="space-y-2">
                    {composite.data.best_longs.map(l => (
                      <div key={l.ticker} className="flex items-start gap-3 py-1.5" style={{ borderBottom: `1px solid ${C.border}` }}>
                        <TickerChip ticker={l.ticker} showDetail={false} />
                        <span className="text-[10px] flex-1" style={{ color: C.muted }}>{l.reason}</span>
                        <ConvBar score={l.conviction} />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
                  <SH>Lockup Short Candidates — Political Risk</SH>
                  <div className="space-y-2">
                    {composite.data.short_candidates.map(s => (
                      <div key={s.ticker} className="flex items-start gap-3 py-1.5" style={{ borderBottom: `1px solid ${C.border}` }}>
                        <TickerChip ticker={s.ticker} showDetail={false} />
                        <span className="text-[10px] flex-1" style={{ color: C.muted }}>{s.reason}</span>
                        <div className="shrink-0 text-xs font-mono font-bold" style={{ color: s.risk > 70 ? C.red : C.amber }}>{s.risk}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Event-driven calendar */}
            <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
              <SH>Event-Driven Catalyst Calendar — Congressional Pre-Positioning</SH>
              <div className="grid grid-cols-2 gap-3">
                {composite.data.event_driven.map(e => (
                  <div key={e.event} className="rounded p-3" style={{ background: "var(--surface, #111827)", border: `1px solid ${C.border}` }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{e.event}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded"
                        style={{ background: "#3f2a0a", color: C.amber }}>{e.date}</span>
                    </div>
                    <p className="text-[10px] mb-2" style={{ color: C.muted }}>{e.positioning}</p>
                    <div className="flex gap-1 flex-wrap">
                      {e.beneficiaries.map(t => (
                        <span key={t} className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                          style={{ background: "#14402a", color: C.green }}>
                          <TickerChip ticker={t} showDetail={false} />
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* PM Summary */}
            <div className="rounded-lg p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
              <SH>PM Dashboard Summary</SH>
              <div className="grid grid-cols-3 gap-6 text-xs">
                {/* Top panel */}
                <div className="space-y-3">
                  <div className="font-semibold" style={{ color: C.green }}>▲ Top Panel — Flow Summary</div>
                  <div style={{ color: C.muted }}>Net Buying (30D):
                    <span className="font-mono ml-1" style={{ color: C.green }}>Strong</span></div>
                  <div style={{ color: C.muted }}>Options Sentiment:
                    <span className="ml-1" style={{ color: C.green }}>Bullish (75% Calls)</span></div>
                  <div style={{ color: C.muted }}>Sector Rotation:
                    <span className="ml-1" style={{ color: C.cyan }}>Defense → Tech → Finance</span></div>
                  <div style={{ color: C.muted }}>Cluster Activity:
                    <span className="ml-1" style={{ color: C.amber }}>HIGH (5 in Defense)</span></div>
                </div>
                {/* Middle panel */}
                <div className="space-y-3">
                  <div className="font-semibold" style={{ color: C.cyan }}>● Middle Panel — High Conviction</div>
                  <div style={{ color: C.muted }}>Top Buys:
                    <span className="font-mono ml-1" style={{ color: C.green }}>LMT, PLTR, NVDA, RTX</span></div>
                  <div style={{ color: C.muted }}>Cluster Signal:
                    <span className="ml-1" style={{ color: C.amber }}>5 Armed Services → Defense</span></div>
                  <div style={{ color: C.muted }}>Legislative Alpha:
                    <span className="ml-1" style={{ color: C.cyan }}>NDAA, CHIPS 2.0, Energy Act</span></div>
                  <div style={{ color: C.muted }}>Committee Edge:
                    <span className="ml-1" style={{ color: C.purple }}>Intelligence → PLTR (active)</span></div>
                </div>
                {/* Bottom panel */}
                <div className="space-y-3">
                  <div className="font-semibold" style={{ color: C.amber }}>▼ Bottom Panel — Outlook</div>
                  <div style={{ color: C.muted }}>Alpha Signals:
                    <span className="ml-1" style={{ color: C.green }}>5 STRONG BUY across Defense/AI</span></div>
                  <div style={{ color: C.muted }}>Political Risk:
                    <span className="ml-1" style={{ color: C.red }}>Healthcare → Short UNH</span></div>
                  <div style={{ color: C.muted }}>Gov Spending:
                    <span className="ml-1" style={{ color: C.cyan }}>Defense +6.8%, AI +45% YoY</span></div>
                  <div style={{ color: C.muted }}>Overall Outlook:
                    <span className="font-bold ml-1" style={{ color: C.green }}>RISK-ON / BULLISH</span></div>
                </div>
              </div>
            </div>
          </div>
        ) : null
      )}
    </div>
  );
}

"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageGuide } from "@/components/PageGuide";
import { TickerChip } from "@/components/TickerChip";
import type {
  CryptoAsset, CryptoBTCETF, CryptoETHETF, DeFiProtocol, Stablecoin,
  ListedMiner, L1L2Ecosystem, InstitutionalHolding,
} from "@/lib/api";
import {
  BarChart, Bar, AreaChart, Area, LineChart, Line, PieChart, Pie, Cell,
  ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:       "var(--surface,   #0f1117)",
  surf:     "var(--surface,   #0f1117)",
  surf2:    "var(--surface-2, #1a1f2e)",
  border:   "var(--border,    #2a2f3e)",
  text:     "var(--text-primary)",
  muted:    "var(--text-muted)",
  accent:   "var(--accent,    #4ade80)",
  orange:   "#f97316",
  amber:    "#f59e0b",
  red:      "#ef4444",
  blue:     "#60a5fa",
  purple:   "#a78bfa",
  cyan:     "#22d3ee",
  gold:     "#fbbf24",
};

const TABS = [
  "Overview", "BTC & ETH", "On-Chain", "DeFi",
  "Derivatives", "ETFs", "Stablecoins",
  "Mining", "Ecosystems", "Institutional", "Composite",
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt  = (n: number | null | undefined, d = 2) => n == null ? "—" : n.toFixed(d);
const fmtB = (n: number | null | undefined) => n == null ? "—" : `$${n.toFixed(2)}B`;
const fmtK = (n: number | null | undefined) => n == null ? "—" : n >= 1000 ? `${(n/1000).toFixed(1)}K` : String(n);
const fmtM = (n: number | null | undefined) => n == null ? "—" : `${n >= 1000 ? `$${(n/1000).toFixed(1)}B` : `$${n.toFixed(0)}M`}`;
const pct  = (n: number | null | undefined) => n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
const chgColor = (n: number | null | undefined) => !n ? C.muted : n >= 0 ? C.accent : C.red;
const scoreColor = (s: number) => s >= 70 ? C.accent : s >= 55 ? C.cyan : s >= 45 ? C.amber : s >= 30 ? C.orange : C.red;

function CryptoGauge({ score, label }: { score: number; label: string }) {
  const r = 52, cx = 70, cy = 70;
  const startAngle = Math.PI * 1.1, sweep = Math.PI * 0.8;
  const toXY = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const arc  = (a1: number, a2: number, color: string) => {
    const [x1, y1] = toXY(a1); const [x2, y2] = toXY(a2);
    return <path d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
                 stroke={color} strokeWidth="8" fill="none" strokeLinecap="round" />;
  };
  const needle = startAngle + (score / 100) * sweep;
  const [nx, ny] = toXY(needle);
  const col = scoreColor(score);
  return (
    <svg width="140" height="100" viewBox="0 0 140 100">
      {arc(startAngle, startAngle + sweep * 0.33, C.red)}
      {arc(startAngle + sweep * 0.33, startAngle + sweep * 0.66, C.amber)}
      {arc(startAngle + sweep * 0.66, startAngle + sweep, C.accent)}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={col} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="4" fill={col} />
      <text x={cx} y={cy + 22} textAnchor="middle" fill={col} fontSize="16" fontWeight="bold">{score.toFixed(0)}</text>
      <text x={cx} y={cy + 36} textAnchor="middle" fill={C.muted} fontSize="8">{label}</text>
    </svg>
  );
}

function SigBadge({ sig }: { sig: string }) {
  const col = sig.includes("Buy") ? C.accent : sig.includes("Sell") ? C.red : C.amber;
  return (
    <span style={{ background: col + "22", color: col, border: `1px solid ${col}44`,
                   borderRadius: 4, padding: "1px 6px", fontSize: 11, fontWeight: 600 }}>
      {sig}
    </span>
  );
}

function PriBadge({ p }: { p: string }) {
  const col = p === "CRITICAL" ? C.red : p === "HIGH" ? C.orange : C.amber;
  return (
    <span style={{ background: col + "22", color: col, border: `1px solid ${col}44`,
                   borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>
      {p}
    </span>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "16px 18px", ...style }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 style={{ color: C.muted, fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                       letterSpacing: "0.12em", marginBottom: 12 }}>{children}</h3>;
}

// ── Mini components ────────────────────────────────────────────────────────────
function AssetRow({ a }: { a: CryptoAsset }) {
  const px = a.price > 1000 ? `$${a.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
           : a.price > 1    ? `$${a.price.toFixed(3)}`
           : `$${a.price.toFixed(5)}`;
  return (
    <tr style={{ borderBottom: `1px solid ${C.border}22` }}>
      <td style={{ padding: "8px 4px", color: C.accent, fontWeight: 700, fontFamily: "monospace" }}>{a.name}</td>
      <td style={{ padding: "8px 4px", color: C.text, fontFamily: "monospace" }}>{px}</td>
      <td style={{ padding: "8px 4px", color: chgColor(a.chg_1d), fontFamily: "monospace" }}>{pct(a.chg_1d)}</td>
      <td style={{ padding: "8px 4px", color: chgColor(a.chg_7d), fontFamily: "monospace" }}>{pct(a.chg_7d)}</td>
      <td style={{ padding: "8px 4px", color: chgColor(a.chg_30d), fontFamily: "monospace" }}>{pct(a.chg_30d)}</td>
      <td style={{ padding: "8px 4px", color: chgColor(a.chg_1y), fontFamily: "monospace" }}>{pct(a.chg_1y)}</td>
      <td style={{ padding: "8px 4px", color: scoreColor(a.rsi), fontFamily: "monospace" }}>{fmt(a.rsi, 1)}</td>
      <td style={{ padding: "8px 4px" }}><SigBadge sig={a.signal} /></td>
      <td style={{ padding: "8px 4px" }}>
        <div style={{ width: 60, height: 4, background: C.border, borderRadius: 2 }}>
          <div style={{ width: `${a.score}%`, height: 4, background: scoreColor(a.score), borderRadius: 2 }} />
        </div>
      </td>
    </tr>
  );
}

function KpiBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <Card style={{ flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || C.text, fontFamily: "monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{sub}</div>}
    </Card>
  );
}

// ── Tab: Overview ─────────────────────────────────────────────────────────────
function OverviewTab() {
  const { data, isLoading } = useQuery({ queryKey: ["crypto-overview"], queryFn: api.getCryptoOverview, staleTime: 300_000 });
  if (isLoading || !data) return <div style={{ color: C.muted, padding: 40, textAlign: "center" }}>Loading...</div>;

  const k = data.kpis;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Score + KPIs */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <Card style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 24px" }}>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>CRYPTO MARKET SCORE</div>
          <CryptoGauge score={data.crypto_score} label={data.regime} />
        </Card>
        <div style={{ display: "flex", flex: 1, gap: 12, flexWrap: "wrap" }}>
          <KpiBox label="Total Crypto Market Cap" value={fmtB(k.total_mcap_b)} sub={`BTC Dom: ${k.btc_dominance}%`} />
          <KpiBox label="BTC Market Cap" value={fmtB(k.btc_mcap_b)} color={C.amber} />
          <KpiBox label="ETH Market Cap" value={fmtB(k.eth_mcap_b)} color={C.blue} />
          <KpiBox label="24h Volume" value={fmtB(k.total_vol_24h_b)} />
          <KpiBox label="DeFi TVL" value={fmtB(k.defi_tvl_b)} color={C.purple} />
          <KpiBox label="Stablecoin Cap" value={fmtB(k.stablecoin_mcap_b)} color={C.cyan} />
          <KpiBox label="ETF Daily Flows" value={fmtM(k.etf_daily_flow_m)} color={C.accent} sub="Net inflow" />
          <KpiBox label="Fear & Greed" value={String(k.fear_greed)} sub={k.fear_greed_label}
                  color={k.fear_greed >= 70 ? C.red : k.fear_greed >= 50 ? C.amber : C.accent} />
        </div>
      </div>

      {/* BTC & ETH quick */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {[data.btc, data.eth].map((a) => {
          const isBTC = a.ticker === "BTC-USD";
          const col = isBTC ? C.amber : C.blue;
          const px  = a.price > 1000 ? `$${a.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `$${a.price.toFixed(2)}`;
          return (
            <Card key={a.ticker} style={{ borderLeft: `3px solid ${col}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ color: col, fontWeight: 700, fontSize: 16 }}>{a.ticker}</div>
                  <div style={{ color: C.text, fontFamily: "monospace", fontSize: 22, fontWeight: 700 }}>{px}</div>
                  <div style={{ color: chgColor(a.chg_1d), fontFamily: "monospace", fontSize: 13 }}>{pct(a.chg_1d)} today</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <SigBadge sig={a.signal} />
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>RSI {fmt(a.rsi, 1)}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>Mkt Cap {fmtB(a.market_cap_b)}</div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Macro correlations */}
      <Card>
        <SectionTitle>Macro Correlations (90-Day)</SectionTitle>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            { label: "BTC/Gold", val: data.macro.btc_gold_90d },
            { label: "BTC/Nasdaq", val: data.macro.btc_nasdaq_90d },
            { label: "BTC/S&P500", val: data.macro.btc_sp500_90d },
            { label: "BTC/DXY",   val: data.macro.btc_dxy_90d },
            { label: "BTC/10Y Yield", val: data.macro.btc_10y_90d },
            { label: "BTC/M2",    val: data.macro.btc_m2_90d },
          ].map(({ label, val }) => (
            <div key={label} style={{ background: C.surf, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: C.muted }}>{label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: val >= 0 ? C.accent : C.red, fontFamily: "monospace" }}>{val.toFixed(2)}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Alerts */}
      <Card>
        <SectionTitle>Intelligence Alerts</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.alerts.map((a) => (
            <div key={a.id} style={{ display: "flex", gap: 12, alignItems: "flex-start",
                                      padding: "8px 12px", background: C.surf, borderRadius: 6,
                                      borderLeft: `3px solid ${a.priority === "CRITICAL" ? C.red : a.priority === "HIGH" ? C.orange : C.amber}` }}>
              <PriBadge p={a.priority} />
              <div style={{ flex: 1 }}>
                <div style={{ color: C.text, fontWeight: 600, fontSize: 13 }}>{a.title}</div>
                <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{a.detail}</div>
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {a.tickers.map(t => <span key={t} style={{ fontSize: 10, color: C.accent, fontFamily: "monospace", background: C.accent + "18", padding: "1px 5px", borderRadius: 3 }}>{t}</span>)}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Tailwinds / Headwinds */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card>
          <SectionTitle>Macro Tailwinds</SectionTitle>
          {data.macro.tailwinds.map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <span style={{ color: C.accent }}>↑</span>
              <span style={{ color: C.text, fontSize: 12 }}>{t}</span>
            </div>
          ))}
        </Card>
        <Card>
          <SectionTitle>Macro Headwinds</SectionTitle>
          {data.macro.headwinds.map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <span style={{ color: C.red }}>↓</span>
              <span style={{ color: C.text, fontSize: 12 }}>{t}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

// ── Tab: BTC & ETH ────────────────────────────────────────────────────────────
function BTCETHTab() {
  const { data: assets, isLoading } = useQuery({ queryKey: ["crypto-assets"], queryFn: api.getCryptoAssets, staleTime: 300_000 });
  if (isLoading || !assets) return <div style={{ color: C.muted, padding: 40, textAlign: "center" }}>Loading...</div>;

  const ths: string[] = ["Asset", "Price", "1D", "7D", "30D", "1Y", "RSI", "Signal", "Score"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <SectionTitle>All Crypto Assets — Live Technicals</SectionTitle>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>{ths.map(h => <th key={h} style={{ padding: "6px 4px", color: C.muted, textAlign: "left", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr>
            </thead>
            <tbody>{assets.assets.map(a => <AssetRow key={a.ticker} a={a} />)}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── Tab: On-Chain ──────────────────────────────────────────────────────────────
function OnChainTab() {
  const { data, isLoading } = useQuery({ queryKey: ["crypto-onchain"], queryFn: api.getCryptoOnChain, staleTime: 300_000 });
  if (isLoading || !data) return <div style={{ color: C.muted, padding: 40, textAlign: "center" }}>Loading...</div>;

  const { btc, eth } = data;

  const mvrvColor = (v: number) => v > 3 ? C.red : v > 2 ? C.orange : v > 1 ? C.amber : C.accent;
  const nuplColor = (v: number) => v > 0.7 ? C.red : v > 0.5 ? C.orange : v > 0.25 ? C.amber : C.accent;
  const nuplLabel = (v: number) => v > 0.7 ? "Euphoria" : v > 0.5 ? "Greed" : v > 0.25 ? "Hope/Optimism" : "Fear";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* BTC On-Chain */}
        <Card style={{ borderTop: `3px solid ${C.amber}` }}>
          <SectionTitle>Bitcoin On-Chain Intelligence</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { label: "MVRV Z-Score", val: fmt(btc.mvrv_zscore), col: mvrvColor(btc.mvrv_zscore), sub: "Euphoria >3" },
              { label: "NUPL", val: fmt(btc.nupl), col: nuplColor(btc.nupl), sub: nuplLabel(btc.nupl) },
              { label: "SOPR", val: fmt(btc.sopr, 3), col: btc.sopr > 1 ? C.accent : C.red, sub: btc.sopr > 1 ? "Coins in profit" : "Coins at loss" },
              { label: "Realized Cap", val: fmtB(btc.realized_cap_b), col: C.text },
              { label: "Supply in Profit", val: `${btc.supply_in_profit_pct}%`, col: btc.supply_in_profit_pct > 70 ? C.accent : C.amber },
              { label: "Active Addr 24h", val: btc.active_addresses_24h.toLocaleString(), col: C.text },
              { label: "Net Exchange Flow", val: `${btc.net_exchange_flow_btc > 0 ? "+" : ""}${btc.net_exchange_flow_btc.toLocaleString()} BTC`, col: btc.net_exchange_flow_btc < 0 ? C.accent : C.red, sub: "Negative = outflow (bullish)" },
              { label: "Puell Multiple", val: fmt(btc.puell_multiple), col: btc.puell_multiple < 0.5 ? C.accent : btc.puell_multiple > 2 ? C.red : C.amber },
              { label: "Illiquid Supply", val: `${btc.illiquid_supply_pct}%`, col: C.text },
              { label: "HODL Wave (>1Y)", val: `${btc.hodl_wave_1y_pct}%`, col: C.accent },
              { label: "LT Holder %", val: `${btc.longterm_holder_pct}%`, col: C.accent },
              { label: "RHODL Ratio", val: fmt(btc.rhodl_ratio), col: C.text },
            ].map(({ label, val, col, sub }) => (
              <div key={label} style={{ background: C.surf, borderRadius: 6, padding: "8px 10px" }}>
                <div style={{ fontSize: 10, color: C.muted }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: col, fontFamily: "monospace" }}>{val}</div>
                {sub && <div style={{ fontSize: 9, color: C.muted, marginTop: 1 }}>{sub}</div>}
              </div>
            ))}
          </div>
        </Card>

        {/* ETH On-Chain */}
        <Card style={{ borderTop: `3px solid ${C.blue}` }}>
          <SectionTitle>Ethereum On-Chain Intelligence</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { label: "MVRV Z-Score", val: fmt(eth.mvrv_zscore), col: mvrvColor(eth.mvrv_zscore) },
              { label: "NUPL", val: fmt(eth.nupl), col: nuplColor(eth.nupl), sub: nuplLabel(eth.nupl) },
              { label: "SOPR", val: fmt(eth.sopr, 3), col: eth.sopr > 1 ? C.accent : C.red },
              { label: "Staking Rate", val: `${eth.staking_rate_pct}%`, col: C.accent },
              { label: "Staked ETH", val: `${(eth.staked_eth/1e6).toFixed(2)}M`, col: C.text },
              { label: "Staking Yield", val: `${eth.staking_yield}%`, col: C.amber },
              { label: "Burn Rate/Day", val: `${eth.burn_rate_eth_day.toLocaleString()} ETH`, col: C.red },
              { label: "Supply Growth", val: `${eth.supply_growth_annualized > 0 ? "+" : ""}${eth.supply_growth_annualized}%`, col: eth.supply_growth_annualized < 0 ? C.accent : C.red, sub: eth.supply_growth_annualized < 0 ? "Deflationary" : "Inflationary" },
              { label: "Net Exchange Flow", val: `${eth.net_exchange_flow_eth > 0 ? "+" : ""}${eth.net_exchange_flow_eth.toLocaleString()} ETH`, col: eth.net_exchange_flow_eth < 0 ? C.accent : C.red },
              { label: "Gas (Gwei)", val: fmt(eth.gas_gwei_avg, 1), col: eth.gas_gwei_avg < 20 ? C.accent : C.amber },
              { label: "L2 TVL", val: fmtB(eth.l2_tvl_b), col: C.blue },
              { label: "Validators", val: eth.validators.toLocaleString(), col: C.text },
            ].map(({ label, val, col, sub }) => (
              <div key={label} style={{ background: C.surf, borderRadius: 6, padding: "8px 10px" }}>
                <div style={{ fontSize: 10, color: C.muted }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: col, fontFamily: "monospace" }}>{val}</div>
                {sub && <div style={{ fontSize: 9, color: C.muted, marginTop: 1 }}>{sub}</div>}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card>
          <SectionTitle>BTC MVRV Z-Score History</SectionTitle>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={btc.history_labels.map((l, i) => ({ label: l, mvrv: btc.history_mvrv[i] }))}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 10 }} />
              <YAxis tick={{ fill: C.muted, fontSize: 10 }} />
              <Tooltip contentStyle={{ background: C.surf2, border: `1px solid ${C.border}`, color: C.text }} />
              <Area type="monotone" dataKey="mvrv" stroke={C.amber} fill={C.amber + "33"} strokeWidth={2} name="MVRV Z" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <SectionTitle>ETH Staking Growth (M ETH Staked)</SectionTitle>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={eth.history_labels.map((l, i) => ({ label: l, staked: eth.history_staked[i] }))}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 10 }} />
              <YAxis tick={{ fill: C.muted, fontSize: 10 }} />
              <Tooltip contentStyle={{ background: C.surf2, border: `1px solid ${C.border}`, color: C.text }} />
              <Area type="monotone" dataKey="staked" stroke={C.blue} fill={C.blue + "33"} strokeWidth={2} name="Staked (M)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}

// ── Tab: DeFi ─────────────────────────────────────────────────────────────────
function DeFiTab() {
  const { data, isLoading } = useQuery({ queryKey: ["crypto-defi"], queryFn: api.getCryptoDeFi, staleTime: 300_000 });
  if (isLoading || !data) return <div style={{ color: C.muted, padding: 40, textAlign: "center" }}>Loading...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <KpiBox label="Total DeFi TVL" value={fmtB(data.total_tvl_b)} color={C.purple} />
        <KpiBox label="RWA TVL" value={fmtB(data.total_rwa_tvl_b)} color={C.cyan} />
        <KpiBox label="Protocols Tracked" value={String(data.protocols.length)} />
        <KpiBox label="Top Protocol" value={data.top_by_tvl[0]?.name || "—"} color={C.accent} />
      </div>

      <Card>
        <SectionTitle>DeFi Protocol Rankings</SectionTitle>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>{["Protocol", "Category", "Chain", "TVL", "7D TVL Δ", "Rev/Ann", "Mkt Cap", "P/S", "Dominance"].map(h =>
                <th key={h} style={{ padding: "6px 4px", color: C.muted, textAlign: "left", fontSize: 10, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.protocols.map((p: DeFiProtocol) => (
                <tr key={p.name} style={{ borderBottom: `1px solid ${C.border}22` }}>
                  <td style={{ padding: "7px 4px", color: C.accent, fontWeight: 700 }}>{p.name}</td>
                  <td style={{ padding: "7px 4px", color: C.text, fontSize: 11 }}>{p.category}</td>
                  <td style={{ padding: "7px 4px", color: C.muted, fontSize: 11 }}>{p.chain}</td>
                  <td style={{ padding: "7px 4px", color: C.text, fontFamily: "monospace" }}>{fmtB(p.tvl_b)}</td>
                  <td style={{ padding: "7px 4px", color: chgColor(p.tvl_chg_7d), fontFamily: "monospace" }}>{pct(p.tvl_chg_7d)}</td>
                  <td style={{ padding: "7px 4px", color: C.text, fontFamily: "monospace" }}>${p.rev_ann_m}M</td>
                  <td style={{ padding: "7px 4px", color: C.text, fontFamily: "monospace" }}>{fmtB(p.mcap_b)}</td>
                  <td style={{ padding: "7px 4px", color: p.ps < 10 ? C.accent : C.amber, fontFamily: "monospace" }}>{p.ps.toFixed(1)}x</td>
                  <td style={{ padding: "7px 4px", color: C.muted, fontFamily: "monospace" }}>{p.dominance_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card>
          <SectionTitle>TVL by Category</SectionTitle>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.by_category} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis type="number" tick={{ fill: C.muted, fontSize: 10 }} />
              <YAxis dataKey="category" type="category" tick={{ fill: C.text, fontSize: 10 }} width={110} />
              <Tooltip contentStyle={{ background: C.surf2, border: `1px solid ${C.border}`, color: C.text }} />
              <Bar dataKey="tvl_b" fill={C.purple} name="TVL ($B)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <SectionTitle>Real World Assets (RWA)</SectionTitle>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>{["Asset", "Category", "TVL", "90D Growth", "Yield"].map(h =>
                <th key={h} style={{ padding: "5px 4px", color: C.muted, textAlign: "left", fontSize: 10, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.rwa.map((r) => (
                <tr key={r.name} style={{ borderBottom: `1px solid ${C.border}22` }}>
                  <td style={{ padding: "6px 4px", color: C.accent, fontWeight: 600, fontSize: 11 }}>{r.name}</td>
                  <td style={{ padding: "6px 4px", color: C.muted, fontSize: 10 }}>{r.cat}</td>
                  <td style={{ padding: "6px 4px", color: C.text, fontFamily: "monospace", fontSize: 11 }}>{fmtB(r.tvl_b)}</td>
                  <td style={{ padding: "6px 4px", color: chgColor(r.growth_90d), fontFamily: "monospace", fontSize: 11 }}>{pct(r.growth_90d)}</td>
                  <td style={{ padding: "6px 4px", color: C.amber, fontFamily: "monospace", fontSize: 11 }}>{r.yield_pct.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

// ── Tab: Derivatives ──────────────────────────────────────────────────────────
function DerivativesTab() {
  const { data, isLoading } = useQuery({ queryKey: ["crypto-derivatives"], queryFn: api.getCryptoDerivatives, staleTime: 300_000 });
  if (isLoading || !data) return <div style={{ color: C.muted, padding: 40, textAlign: "center" }}>Loading...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {[
          { label: "BTC", d: data.btc, col: C.amber },
          { label: "ETH", d: data.eth, col: C.blue },
        ].map(({ label, d, col }) => (
          <Card key={label} style={{ borderTop: `3px solid ${col}` }}>
            <SectionTitle>{label} Derivatives Dashboard</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { label: "Open Interest", val: fmtB(d.oi_b), sub: `${d.oi_chg_24h > 0 ? "+" : ""}${d.oi_chg_24h.toFixed(1)}% 24h`, col: C.text },
                { label: "Funding Rate (8h)", val: `${(d.funding_rate_8h * 100).toFixed(4)}%`, sub: `${d.ann_funding.toFixed(2)}% annualized`, col: d.funding_rate_8h > 0 ? C.amber : C.accent },
                { label: "Liq. Longs 24h", val: fmtM(d.liq_long_24h_m), col: C.red },
                { label: "Liq. Shorts 24h", val: fmtM(d.liq_short_24h_m), col: C.accent },
                { label: "Options OI", val: fmtB(d.options_oi_b), sub: `Calls: ${d.call_pct.toFixed(1)}%`, col: C.text },
                { label: "Put/Call Ratio", val: d.put_call_ratio.toFixed(2), sub: d.put_call_ratio < 0.75 ? "Bullish bias" : "Bearish hedge", col: d.put_call_ratio < 0.75 ? C.accent : C.red },
                { label: "Max Pain", val: `$${d.max_pain.toLocaleString()}`, col: C.muted },
                { label: "CME OI", val: fmtB(d.cme_oi_b), sub: "Institutional", col: C.text },
                { label: "IV 30D", val: `${d.iv_30d.toFixed(1)}%`, col: C.amber },
                { label: "IV 90D", val: `${d.iv_90d.toFixed(1)}%`, col: C.text },
                { label: "IV Skew", val: `${d.iv_skew.toFixed(1)}%`, sub: d.iv_skew < 0 ? "Downside hedged" : "Upside bid", col: d.iv_skew < 0 ? C.orange : C.accent },
                { label: "3M Basis", val: `${d.basis_3m_ann.toFixed(1)}% ann.`, sub: d.term_structure, col: C.cyan },
              ].map(({ label: lbl, val, sub, col: c }) => (
                <div key={lbl} style={{ background: C.surf, borderRadius: 6, padding: "8px 10px" }}>
                  <div style={{ fontSize: 10, color: C.muted }}>{lbl}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: c, fontFamily: "monospace" }}>{val}</div>
                  {sub && <div style={{ fontSize: 9, color: C.muted }}>{sub}</div>}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
      <Card>
        <SectionTitle>Total Crypto Open Interest</SectionTitle>
        <div style={{ fontSize: 24, fontWeight: 700, color: C.text, fontFamily: "monospace" }}>{fmtB(data.total_crypto_oi_b)}</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>BTC {fmtB(data.btc.oi_b)} + ETH {fmtB(data.eth.oi_b)} + Alts ~$8.4B</div>
      </Card>
    </div>
  );
}

// ── Tab: ETFs ─────────────────────────────────────────────────────────────────
function ETFTab() {
  const { data, isLoading } = useQuery({ queryKey: ["crypto-etf"], queryFn: api.getCryptoETF, staleTime: 300_000 });
  if (isLoading || !data) return <div style={{ color: C.muted, padding: 40, textAlign: "center" }}>Loading...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <KpiBox label="Total ETF AUM" value={fmtB(data.total_etf_aum_b)} color={C.accent} />
        <KpiBox label="BTC ETF AUM" value={fmtB(data.btc_total_aum_b)} color={C.amber} />
        <KpiBox label="ETH ETF AUM" value={fmtB(data.eth_total_aum_b)} color={C.blue} />
        <KpiBox label="BTC Daily Flows" value={fmtM(data.btc_total_flow_m)} color={data.btc_total_flow_m > 0 ? C.accent : C.red} />
        <KpiBox label="ETH Daily Flows" value={fmtM(data.eth_total_flow_m)} color={data.eth_total_flow_m > 0 ? C.accent : C.red} />
        <KpiBox label="Total BTC in ETFs" value={`${(data.btc_total_held/1000).toFixed(0)}K BTC`} color={C.amber} />
      </div>

      <Card>
        <SectionTitle>Bitcoin Spot ETFs</SectionTitle>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>{["Fund", "Ticker", "Issuer", "AUM", "BTC Held", "Daily Flow", "Fee", "Prem/Disc (bps)", "Price", "1D Chg"].map(h =>
                <th key={h} style={{ padding: "6px 4px", color: C.muted, textAlign: "left", fontSize: 10, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.btc_etfs.map((e: CryptoBTCETF) => (
                <tr key={e.ticker} style={{ borderBottom: `1px solid ${C.border}22` }}>
                  <td style={{ padding: "7px 4px", color: C.text, fontWeight: 600 }}>{e.name}</td>
                  <td style={{ padding: "7px 4px", color: C.accent, fontFamily: "monospace", fontWeight: 700 }}><TickerChip ticker={e.ticker} showDetail={false} /></td>
                  <td style={{ padding: "7px 4px", color: C.muted, fontSize: 11 }}>{e.issuer}</td>
                  <td style={{ padding: "7px 4px", color: C.text, fontFamily: "monospace" }}>{fmtB(e.aum_b)}</td>
                  <td style={{ padding: "7px 4px", color: C.amber, fontFamily: "monospace" }}>{e.btc_held.toLocaleString()}</td>
                  <td style={{ padding: "7px 4px", color: e.daily_flow_m >= 0 ? C.accent : C.red, fontFamily: "monospace" }}>{e.daily_flow_m > 0 ? "+" : ""}${e.daily_flow_m}M</td>
                  <td style={{ padding: "7px 4px", color: e.fee_pct > 1 ? C.red : C.muted, fontFamily: "monospace" }}>{e.fee_pct.toFixed(2)}%</td>
                  <td style={{ padding: "7px 4px", color: e.prem_bps < 0 ? C.red : C.accent, fontFamily: "monospace" }}>{e.prem_bps > 0 ? "+" : ""}{e.prem_bps}</td>
                  <td style={{ padding: "7px 4px", color: C.text, fontFamily: "monospace" }}>{e.price ? `$${e.price.toFixed(2)}` : "—"}</td>
                  <td style={{ padding: "7px 4px", color: chgColor(e.chg_1d ?? null), fontFamily: "monospace" }}>{e.chg_1d ? pct(e.chg_1d) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <SectionTitle>Ethereum Spot ETFs</SectionTitle>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>{["Fund", "Ticker", "Issuer", "AUM", "ETH Held", "Daily Flow", "Fee", "Prem/Disc (bps)", "Price", "1D Chg"].map(h =>
                <th key={h} style={{ padding: "6px 4px", color: C.muted, textAlign: "left", fontSize: 10, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.eth_etfs.map((e: CryptoETHETF) => (
                <tr key={e.ticker} style={{ borderBottom: `1px solid ${C.border}22` }}>
                  <td style={{ padding: "7px 4px", color: C.text, fontWeight: 600 }}>{e.name}</td>
                  <td style={{ padding: "7px 4px", color: C.blue, fontFamily: "monospace", fontWeight: 700 }}><TickerChip ticker={e.ticker} showDetail={false} /></td>
                  <td style={{ padding: "7px 4px", color: C.muted, fontSize: 11 }}>{e.issuer}</td>
                  <td style={{ padding: "7px 4px", color: C.text, fontFamily: "monospace" }}>{fmtB(e.aum_b)}</td>
                  <td style={{ padding: "7px 4px", color: C.blue, fontFamily: "monospace" }}>{e.eth_held.toLocaleString()}</td>
                  <td style={{ padding: "7px 4px", color: e.daily_flow_m >= 0 ? C.accent : C.red, fontFamily: "monospace" }}>{e.daily_flow_m > 0 ? "+" : ""}${e.daily_flow_m}M</td>
                  <td style={{ padding: "7px 4px", color: e.fee_pct > 1 ? C.red : C.muted, fontFamily: "monospace" }}>{e.fee_pct.toFixed(2)}%</td>
                  <td style={{ padding: "7px 4px", color: e.prem_bps < 0 ? C.red : C.accent, fontFamily: "monospace" }}>{e.prem_bps > 0 ? "+" : ""}{e.prem_bps}</td>
                  <td style={{ padding: "7px 4px", color: C.text, fontFamily: "monospace" }}>{e.price ? `$${e.price.toFixed(2)}` : "—"}</td>
                  <td style={{ padding: "7px 4px", color: chgColor(e.chg_1d ?? null), fontFamily: "monospace" }}>{e.chg_1d ? pct(e.chg_1d) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <SectionTitle>ETF AUM Comparison</SectionTitle>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data.btc_etfs.map((e: CryptoBTCETF) => ({ name: e.ticker, aum: e.aum_b, flow: e.daily_flow_m }))}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="name" tick={{ fill: C.text, fontSize: 11 }} />
            <YAxis tick={{ fill: C.muted, fontSize: 10 }} />
            <Tooltip contentStyle={{ background: C.surf2, border: `1px solid ${C.border}`, color: C.text }} />
            <Bar dataKey="aum" fill={C.amber} name="AUM ($B)" radius={[4, 4, 0, 0]}>
              {data.btc_etfs.map((e: CryptoBTCETF, i: number) => <Cell key={i} fill={e.daily_flow_m < 0 ? C.red : C.amber} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

// ── Tab: Stablecoins ──────────────────────────────────────────────────────────
function StablecoinsTab() {
  const { data, isLoading } = useQuery({ queryKey: ["crypto-stablecoins"], queryFn: api.getCryptoStablecoins, staleTime: 300_000 });
  if (isLoading || !data) return <div style={{ color: C.muted, padding: 40, textAlign: "center" }}>Loading...</div>;

  const COLORS = [C.accent, C.blue, C.purple, C.amber, C.orange, C.red];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <KpiBox label="Total Stablecoin Market Cap" value={fmtB(data.total_mcap_b)} color={C.cyan} />
        <KpiBox label="Top 3 Market Share" value={`${data.top_3_share_pct}%`} color={C.accent} />
        <KpiBox label="Fiat-Backed Share" value={`${data.fiat_backed_pct}%`} color={C.text} />
        <KpiBox label="Protocols Tracked" value={String(data.stablecoins.length)} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <Card>
          <SectionTitle>Stablecoin Rankings</SectionTitle>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>{["Name", "Symbol", "Type", "Market Cap", "30D Δ", "Vol 24h", "Peg (bps)", "Reserves", "Quality", "Share %"].map(h =>
                <th key={h} style={{ padding: "6px 4px", color: C.muted, textAlign: "left", fontSize: 10, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.stablecoins.map((s: Stablecoin) => (
                <tr key={s.symbol} style={{ borderBottom: `1px solid ${C.border}22` }}>
                  <td style={{ padding: "7px 4px", color: C.text, fontWeight: 600 }}>{s.name}</td>
                  <td style={{ padding: "7px 4px", color: C.cyan, fontFamily: "monospace", fontWeight: 700 }}>{s.symbol}</td>
                  <td style={{ padding: "7px 4px", color: C.muted, fontSize: 11 }}>{s.type}</td>
                  <td style={{ padding: "7px 4px", color: C.text, fontFamily: "monospace" }}>{fmtB(s.mcap_b)}</td>
                  <td style={{ padding: "7px 4px", color: chgColor(s.chg_30d), fontFamily: "monospace" }}>{pct(s.chg_30d)}</td>
                  <td style={{ padding: "7px 4px", color: C.text, fontFamily: "monospace" }}>{fmtB(s.vol_24h_b)}</td>
                  <td style={{ padding: "7px 4px", color: s.peg_bps > 5 ? C.orange : C.accent, fontFamily: "monospace" }}>{s.peg_bps}</td>
                  <td style={{ padding: "7px 4px", color: s.reserves ? C.accent : C.red }}>{s.reserves ? "✓" : "✗"}</td>
                  <td style={{ padding: "7px 4px", color: s.quality === "High" ? C.accent : s.quality === "Moderate" ? C.amber : C.orange, fontSize: 11 }}>{s.quality}</td>
                  <td style={{ padding: "7px 4px", color: C.text, fontFamily: "monospace" }}>{s.share_pct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <SectionTitle>Market Share</SectionTitle>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={data.stablecoins.map((s: Stablecoin) => ({ name: s.symbol, value: s.mcap_b }))}
                   cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                   labelLine={{ stroke: C.muted }}>
                {data.stablecoins.map((_: Stablecoin, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: C.surf2, border: `1px solid ${C.border}`, color: C.text }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}

// ── Tab: Mining ───────────────────────────────────────────────────────────────
function MiningTab() {
  const { data, isLoading } = useQuery({ queryKey: ["crypto-mining"], queryFn: api.getCryptoMining, staleTime: 300_000 });
  if (isLoading || !data) return <div style={{ color: C.muted, padding: 40, textAlign: "center" }}>Loading...</div>;

  const s = data.stats;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <KpiBox label="Hash Rate" value={`${s.hash_rate_eh.toFixed(1)} EH/s`} color={C.accent} sub={`+${s.hash_rate_change_30d}% 30D`} />
        <KpiBox label="Miner Revenue 24h" value={`$${(s.miner_revenue_usd_24h/1e6).toFixed(1)}M`} color={C.amber} />
        <KpiBox label="Block Reward" value={`${s.block_reward_btc} BTC`} color={C.text} sub="Post-4th Halving" />
        <KpiBox label="Puell Multiple" value={fmt(s.puell_multiple)} color={s.puell_multiple < 0.5 ? C.accent : s.puell_multiple > 2 ? C.red : C.amber} sub={s.puell_multiple < 0.5 ? "Historically cheap" : "Elevated"} />
        <KpiBox label="Fee Revenue %" value={`${s.fee_rev_pct}%`} color={C.text} />
        <KpiBox label="Next Halving" value={s.next_halving_est} color={C.muted} />
      </div>

      <Card>
        <SectionTitle>Listed Miners — Live Market Data</SectionTitle>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>{["Miner", "Ticker", "Hash Rate", "Network %", "BTC Held", "Energy ¢/kWh", "Breakeven", "AI Pivot", "Price", "1D Chg", "Signal"].map(h =>
              <th key={h} style={{ padding: "6px 4px", color: C.muted, textAlign: "left", fontSize: 10, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {data.miners.map((m: ListedMiner) => (
              <tr key={m.ticker} style={{ borderBottom: `1px solid ${C.border}22` }}>
                <td style={{ padding: "7px 4px", color: C.text, fontWeight: 600 }}>{m.name}</td>
                <td style={{ padding: "7px 4px", color: C.amber, fontFamily: "monospace", fontWeight: 700 }}><TickerChip ticker={m.ticker} showDetail={false} /></td>
                <td style={{ padding: "7px 4px", color: C.text, fontFamily: "monospace" }}>{m.hash_rate_eh.toFixed(1)} EH</td>
                <td style={{ padding: "7px 4px", color: C.accent, fontFamily: "monospace" }}>{m.share_pct.toFixed(1)}%</td>
                <td style={{ padding: "7px 4px", color: C.amber, fontFamily: "monospace" }}>{m.btc_held.toLocaleString()}</td>
                <td style={{ padding: "7px 4px", color: C.text, fontFamily: "monospace" }}>{(m.energy_cost_kwh * 100).toFixed(1)}¢</td>
                <td style={{ padding: "7px 4px", color: C.text, fontFamily: "monospace" }}>${m.breakeven_btc.toLocaleString()}</td>
                <td style={{ padding: "7px 4px" }}>
                  {m.ai_pivot && <span style={{ fontSize: 9, color: C.blue, background: C.blue + "22", borderRadius: 3, padding: "1px 5px" }}>AI</span>}
                </td>
                <td style={{ padding: "7px 4px", color: C.text, fontFamily: "monospace" }}>{m.price ? `$${m.price.toFixed(2)}` : "—"}</td>
                <td style={{ padding: "7px 4px", color: chgColor(m.chg_1d ?? null), fontFamily: "monospace" }}>{m.chg_1d ? pct(m.chg_1d) : "—"}</td>
                <td style={{ padding: "7px 4px" }}><SigBadge sig={m.signal} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card>
          <SectionTitle>Mining Pool Distribution (by Hash Rate)</SectionTitle>
          {data.pools.map((p) => (
            <div key={p.name} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ color: C.text, fontSize: 12 }}>{p.name}</span>
                <span style={{ color: C.muted, fontSize: 11, fontFamily: "monospace" }}>{p.share_pct}% · {p.hash_rate_eh} EH</span>
              </div>
              <div style={{ height: 4, background: C.surf, borderRadius: 2 }}>
                <div style={{ width: `${p.share_pct * 5}%`, height: 4, background: C.accent, borderRadius: 2 }} />
              </div>
            </div>
          ))}
        </Card>
        <Card>
          <SectionTitle>Listed Miner Hash Rate Share</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.miners.map((m: ListedMiner) => ({ name: m.ticker, eh: m.hash_rate_eh }))}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="name" tick={{ fill: C.text, fontSize: 11 }} />
              <YAxis tick={{ fill: C.muted, fontSize: 10 }} />
              <Tooltip contentStyle={{ background: C.surf2, border: `1px solid ${C.border}`, color: C.text }} />
              <Bar dataKey="eh" fill={C.amber} name="Hash Rate (EH/s)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}

// ── Tab: Ecosystems ───────────────────────────────────────────────────────────
function EcosystemsTab() {
  const { data, isLoading } = useQuery({ queryKey: ["crypto-ecosystems"], queryFn: api.getCryptoEcosystems, staleTime: 300_000 });
  if (isLoading || !data) return <div style={{ color: C.muted, padding: 40, textAlign: "center" }}>Loading...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <KpiBox label="Total Ecosystem TVL" value={fmtB(data.total_tvl_b)} color={C.accent} />
        <KpiBox label="Ethereum TVL Share" value={`${data.eth_tvl_share}%`} color={C.blue} />
        <KpiBox label="L2 TVL" value={fmtB(data.l2_tvl_b)} color={C.purple} />
        <KpiBox label="Ecosystems Tracked" value={String(data.ecosystems.length)} />
      </div>

      <Card>
        <SectionTitle>L1 / L2 Ecosystem Intelligence</SectionTitle>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>{["Ecosystem", "Type", "TPS", "Dev Activity", "dApps", "TVL", "Fees 7D", "Staking Yield", "L2s", "Score", "Price", "1D"].map(h =>
                <th key={h} style={{ padding: "6px 4px", color: C.muted, textAlign: "left", fontSize: 10, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.ecosystems.map((e: L1L2Ecosystem) => (
                <tr key={e.name} style={{ borderBottom: `1px solid ${C.border}22` }}>
                  <td style={{ padding: "7px 4px", color: C.accent, fontWeight: 700 }}>{e.name}</td>
                  <td style={{ padding: "7px 4px", color: C.muted, fontSize: 11 }}>{e.type}</td>
                  <td style={{ padding: "7px 4px", color: C.text, fontFamily: "monospace" }}>{e.tps.toLocaleString()}</td>
                  <td style={{ padding: "7px 4px", color: C.text, fontFamily: "monospace" }}>{e.active_devs.toLocaleString()}</td>
                  <td style={{ padding: "7px 4px", color: C.text, fontFamily: "monospace" }}>{e.dapps.toLocaleString()}</td>
                  <td style={{ padding: "7px 4px", color: C.text, fontFamily: "monospace" }}>{fmtB(e.tvl_b)}</td>
                  <td style={{ padding: "7px 4px", color: C.text, fontFamily: "monospace" }}>${e.fees_7d_m}M</td>
                  <td style={{ padding: "7px 4px", color: e.staking_yield ? C.amber : C.muted, fontFamily: "monospace" }}>{e.staking_yield ? `${e.staking_yield}%` : "—"}</td>
                  <td style={{ padding: "7px 4px", color: C.text, fontFamily: "monospace" }}>{e.l2_count > 0 ? e.l2_count : "—"}</td>
                  <td style={{ padding: "7px 4px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ width: 40, height: 4, background: C.surf }}>
                        <div style={{ width: `${e.score}%`, height: 4, background: scoreColor(e.score) }} />
                      </div>
                      <span style={{ color: scoreColor(e.score), fontSize: 11, fontFamily: "monospace" }}>{e.score}</span>
                    </div>
                  </td>
                  <td style={{ padding: "7px 4px", color: C.text, fontFamily: "monospace" }}>{e.price ? (e.price > 100 ? `$${e.price.toFixed(0)}` : `$${e.price.toFixed(2)}`) : "—"}</td>
                  <td style={{ padding: "7px 4px", color: chgColor(e.chg_1d ?? null), fontFamily: "monospace" }}>{e.chg_1d ? pct(e.chg_1d) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <SectionTitle>TVL by Ecosystem</SectionTitle>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data.ecosystems.map((e: L1L2Ecosystem) => ({ name: e.name, tvl: e.tvl_b }))}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="name" tick={{ fill: C.text, fontSize: 10 }} />
            <YAxis tick={{ fill: C.muted, fontSize: 10 }} />
            <Tooltip contentStyle={{ background: C.surf2, border: `1px solid ${C.border}`, color: C.text }} />
            <Bar dataKey="tvl" name="TVL ($B)" radius={[4, 4, 0, 0]}>
              {data.ecosystems.map((e: L1L2Ecosystem, i: number) => <Cell key={i} fill={e.type === "L1" ? C.accent : C.purple} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

// ── Tab: Institutional ────────────────────────────────────────────────────────
function InstitutionalTab() {
  const { data, isLoading } = useQuery({ queryKey: ["crypto-institutional"], queryFn: api.getCryptoInstitutional, staleTime: 300_000 });
  if (isLoading || !data) return <div style={{ color: C.muted, padding: 40, textAlign: "center" }}>Loading...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <KpiBox label="Total BTC Held" value={`${(data.total_btc_held/1000).toFixed(0)}K BTC`} color={C.amber} />
        <KpiBox label="Total Value" value={fmtB(data.total_val_b)} color={C.text} />
        <KpiBox label="% Circulating Supply" value={`${data.pct_circulating_supply}%`} color={C.accent} />
        <KpiBox label="Entities Tracked" value={String(data.holdings.length)} />
      </div>

      <Card>
        <SectionTitle>Corporate & Institutional Bitcoin Holdings</SectionTitle>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>{["Entity", "Type", "BTC Held", "Avg Cost", "Current Value", "Unrealized P&L", "P&L %", "Stock", "Stock 1D"].map(h =>
              <th key={h} style={{ padding: "6px 4px", color: C.muted, textAlign: "left", fontSize: 10, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {data.holdings.map((h: InstitutionalHolding) => (
              <tr key={h.entity} style={{ borderBottom: `1px solid ${C.border}22` }}>
                <td style={{ padding: "7px 4px", color: C.text, fontWeight: 600, fontSize: 11 }}>{h.entity}</td>
                <td style={{ padding: "7px 4px", color: C.muted, fontSize: 10 }}>{h.type}</td>
                <td style={{ padding: "7px 4px", color: C.amber, fontFamily: "monospace" }}>{h.btc_held.toLocaleString()}</td>
                <td style={{ padding: "7px 4px", color: C.muted, fontFamily: "monospace" }}>${h.avg_price.toLocaleString()}</td>
                <td style={{ padding: "7px 4px", color: C.text, fontFamily: "monospace" }}>{fmtB(h.current_val_b)}</td>
                <td style={{ padding: "7px 4px", color: h.unrealized_b >= 0 ? C.accent : C.red, fontFamily: "monospace" }}>{h.unrealized_b > 0 ? "+" : ""}{fmtB(h.unrealized_b)}</td>
                <td style={{ padding: "7px 4px", color: h.pnl_pct >= 0 ? C.accent : C.red, fontFamily: "monospace" }}>{pct(h.pnl_pct)}</td>
                <td style={{ padding: "7px 4px", color: C.text, fontFamily: "monospace" }}>{h.stock_price ? `$${h.stock_price.toFixed(2)}` : "—"}</td>
                <td style={{ padding: "7px 4px", color: chgColor(h.stock_chg_1d ?? null), fontFamily: "monospace" }}>{h.stock_chg_1d ? pct(h.stock_chg_1d) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card>
          <SectionTitle>VC & Pre-IPO Pipeline</SectionTitle>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>{["Company", "Sector", "Valuation", "Stage", "IPO Prob", "Window"].map(h =>
                <th key={h} style={{ padding: "5px 4px", color: C.muted, textAlign: "left", fontSize: 10, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.vc_pipeline.map((v) => (
                <tr key={v.company} style={{ borderBottom: `1px solid ${C.border}22` }}>
                  <td style={{ padding: "6px 4px", color: C.text, fontWeight: 600, fontSize: 11 }}>{v.company}</td>
                  <td style={{ padding: "6px 4px", color: C.muted, fontSize: 10 }}>{v.sector}</td>
                  <td style={{ padding: "6px 4px", color: C.text, fontFamily: "monospace", fontSize: 11 }}>{fmtB(v.val_b)}</td>
                  <td style={{ padding: "6px 4px", color: C.muted, fontSize: 10 }}>{v.stage}</td>
                  <td style={{ padding: "6px 4px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ width: 40, height: 4, background: C.surf }}>
                        <div style={{ width: `${v.ipo_prob * 100}%`, height: 4, background: v.ipo_prob > 0.5 ? C.accent : C.amber }} />
                      </div>
                      <span style={{ color: C.text, fontSize: 10, fontFamily: "monospace" }}>{(v.ipo_prob * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td style={{ padding: "6px 4px", color: C.muted, fontSize: 10 }}>{v.window}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <SectionTitle>Crypto Equity Proxies</SectionTitle>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>{["Ticker", "Price", "1D Chg", "Score", "Signal"].map(h =>
                <th key={h} style={{ padding: "5px 4px", color: C.muted, textAlign: "left", fontSize: 10, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.proxies.map((p) => (
                <tr key={p.ticker} style={{ borderBottom: `1px solid ${C.border}22` }}>
                  <td style={{ padding: "6px 4px", color: C.accent, fontFamily: "monospace", fontWeight: 700 }}><TickerChip ticker={p.ticker} showDetail={false} /></td>
                  <td style={{ padding: "6px 4px", color: C.text, fontFamily: "monospace" }}>${p.price.toFixed(2)}</td>
                  <td style={{ padding: "6px 4px", color: chgColor(p.chg_1d), fontFamily: "monospace" }}>{pct(p.chg_1d)}</td>
                  <td style={{ padding: "6px 4px" }}>
                    <div style={{ width: 50, height: 4, background: C.surf }}>
                      <div style={{ width: `${p.score}%`, height: 4, background: scoreColor(p.score) }} />
                    </div>
                  </td>
                  <td style={{ padding: "6px 4px" }}><SigBadge sig={p.signal} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

// ── Tab: Composite ────────────────────────────────────────────────────────────
function CompositeTab() {
  const { data, isLoading } = useQuery({ queryKey: ["crypto-composite"], queryFn: api.getCryptoComposite, staleTime: 300_000 });
  if (isLoading || !data) return <div style={{ color: C.muted, padding: 40, textAlign: "center" }}>Loading...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Score card */}
      <div style={{ display: "flex", gap: 16 }}>
        <Card style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 32px" }}>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>COMPOSITE CRYPTO SCORE</div>
          <CryptoGauge score={data.composite_score} label={data.label} />
          <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>Confidence-weighted model</div>
        </Card>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
          {Object.entries(data.components).map(([name, comp]) => (
            <div key={name}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: C.text, fontSize: 12 }}>{name}</span>
                <span style={{ color: scoreColor(comp.score), fontSize: 12, fontFamily: "monospace" }}>
                  {comp.score.toFixed(0)} <span style={{ color: C.muted }}>({(comp.weight * 100).toFixed(0)}%)</span>
                </span>
              </div>
              <div style={{ height: 6, background: C.surf, borderRadius: 3 }}>
                <div style={{ width: `${comp.score}%`, height: 6, background: scoreColor(comp.score), borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Trading signals */}
      <Card>
        <SectionTitle>Crypto Trading Signals</SectionTitle>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>{["Asset", "Price", "Signal", "Score", "Composite", "Target", "Stop", "Exp. Return", "Confidence"].map(h =>
              <th key={h} style={{ padding: "6px 4px", color: C.muted, textAlign: "left", fontSize: 10, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {data.signals.map((s) => (
              <tr key={s.ticker} style={{ borderBottom: `1px solid ${C.border}22` }}>
                <td style={{ padding: "8px 4px", color: C.accent, fontWeight: 700, fontFamily: "monospace" }}><TickerChip ticker={s.ticker} showDetail={false} /></td>
                <td style={{ padding: "8px 4px", color: C.text, fontFamily: "monospace" }}>{s.price > 1000 ? `$${s.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `$${s.price.toFixed(2)}`}</td>
                <td style={{ padding: "8px 4px" }}><SigBadge sig={s.signal} /></td>
                <td style={{ padding: "8px 4px", color: scoreColor(s.score), fontFamily: "monospace" }}>{s.score}</td>
                <td style={{ padding: "8px 4px", color: scoreColor(s.composite_score), fontFamily: "monospace" }}>{s.composite_score}</td>
                <td style={{ padding: "8px 4px", color: C.accent, fontFamily: "monospace" }}>{s.target > 1000 ? `$${s.target.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `$${s.target.toFixed(2)}`}</td>
                <td style={{ padding: "8px 4px", color: C.red, fontFamily: "monospace" }}>{s.stop > 1000 ? `$${s.stop.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `$${s.stop.toFixed(2)}`}</td>
                <td style={{ padding: "8px 4px", color: chgColor(s.exp_return), fontFamily: "monospace" }}>{pct(s.exp_return)}</td>
                <td style={{ padding: "8px 4px", color: C.text, fontFamily: "monospace" }}>{(s.confidence * 100).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* PM Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <Card style={{ borderTop: `3px solid ${C.accent}` }}>
          <SectionTitle>Best Long Candidates</SectionTitle>
          {data.best_longs.map((b) => (
            <div key={b.ticker} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <TickerChip ticker={b.ticker} showDetail={false} />
                <span style={{ color: C.muted, fontSize: 11 }}>Conv: {b.conviction}</span>
              </div>
              <div style={{ color: C.text, fontSize: 11, marginTop: 2 }}>{b.reason}</div>
              <div style={{ height: 3, background: C.surf, marginTop: 4 }}>
                <div style={{ width: `${b.conviction}%`, height: 3, background: C.accent }} />
              </div>
            </div>
          ))}
        </Card>
        <Card style={{ borderTop: `3px solid ${C.red}` }}>
          <SectionTitle>Short Candidates</SectionTitle>
          {data.short_candidates.map((s) => (
            <div key={s.ticker} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <TickerChip ticker={s.ticker} showDetail={false} />
                <span style={{ color: C.muted, fontSize: 11 }}>Risk: {s.risk}</span>
              </div>
              <div style={{ color: C.text, fontSize: 11, marginTop: 2 }}>{s.reason}</div>
              <div style={{ height: 3, background: C.surf, marginTop: 4 }}>
                <div style={{ width: `${s.risk}%`, height: 3, background: C.red }} />
              </div>
            </div>
          ))}
        </Card>
        <Card style={{ borderTop: `3px solid ${C.amber}` }}>
          <SectionTitle>PM Outlook</SectionTitle>
          {Object.entries(data.outlook).map(([horizon, text]) => (
            <div key={horizon} style={{ marginBottom: 12 }}>
              <div style={{ color: C.amber, fontWeight: 700, fontSize: 12, fontFamily: "monospace" }}>{horizon} Outlook</div>
              <div style={{ color: C.text, fontSize: 11, marginTop: 3, lineHeight: 1.5 }}>{text}</div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CryptoPage() {
  const [tab, setTab] = useState(TABS[0]);

  return (
    <div style={{ flex: 1, overflowY: "auto", background: C.bg, padding: "20px 24px", minHeight: "100vh" }}>
      <PageGuide
        title="Crypto & Digital Assets — Guide"
        subtitle="Bitcoin, Ethereum, DeFi, ETF flows, mining, and institutional crypto intelligence"
        steps={[
          { title: "Read BTC Dominance", detail: "Bitcoin dominance (BTC's share of total crypto market cap) is the most important macro signal in crypto. Rising BTC dominance = risk-off, rotate to BTC. Falling dominance = altcoin season, rotate to risk." },
          { title: "Navigate the Tabs", detail: "The page has 10 tabs: Overview (BTC/ETH market health), Assets (all crypto with live technicals), On-Chain (network metrics), DeFi (TVL, protocols), Derivatives (futures & options flow), ETF (spot ETF flows), Stablecoins, Mining (hash rate), Ecosystems (L1/L2), and Institutional." },
          { title: "Check Crypto Market Regime", detail: "The Overview tab's regime panel classifies the crypto market as Bull, Bear, or Neutral based on BTC trend, funding rates, and on-chain signals. Bull regime = risk-on crypto positioning." },
          { title: "Monitor BTC and ETH Prices", detail: "BTC and ETH are shown with 24h, 7d, and 30d changes, moving averages, and volume. ETH/BTC ratio tells you whether Ethereum is leading or lagging Bitcoin — a rising ratio signals altcoin season." },
          { title: "Check Spot ETF Flows", detail: "The ETF tab tracks daily inflows and outflows for all US spot Bitcoin ETFs. Large net inflows signal institutional accumulation; large outflows can precede price corrections." },
        ]}
        howItWorks={[
          { title: "Price Data", detail: "BTC-USD and ETH-USD prices are fetched from Yahoo Finance. Major altcoin prices and on-chain data use additional APIs. Data refreshes every 5 minutes." },
          { title: "On-Chain Metrics", detail: "NUPL (Net Unrealized Profit/Loss) measures how much of the total BTC supply is in profit. Above 0.75 = Euphoria (historically a sell signal). Below 0 = Capitulation (historically a buy signal)." },
          { title: "Funding Rate", detail: "Perpetual futures funding rate shows whether longs or shorts are paying. Positive funding (longs pay shorts) means excessive long leverage — a correction signal. Rates above 0.1% per 8 hours are extreme." },
        ]}
        tips={[
          "BTC above its 200-week moving average has historically never been a losing long-term buy opportunity.",
          "Funding rates above 0.1% per 8 hours signal excessive leverage — expect a flush-out move downward.",
          "ETH outperforming BTC by >20% in a month historically signals the start of an altcoin season within 4–6 weeks.",
        ]}
      />
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <h1 style={{ color: C.text, fontSize: 20, fontWeight: 700, margin: 0 }}>
            Crypto & Digital Assets Intelligence
          </h1>
          <span style={{ background: C.amber + "22", color: C.amber, border: `1px solid ${C.amber}44`,
                          borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
            BTC · ETH · DeFi · ETF · L1/L2
          </span>
        </div>
        <div style={{ color: C.muted, fontSize: 12 }}>
          Institutional-grade crypto intelligence — on-chain, derivatives, ETF flows, mining, ecosystems
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, flexWrap: "wrap", marginBottom: 20,
                    borderBottom: `1px solid ${C.border}`, paddingBottom: 0 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
                  style={{ padding: "8px 14px", fontSize: 12, fontWeight: tab === t ? 700 : 400,
                            color: tab === t ? C.accent : C.muted,
                            background: "none", border: "none", borderBottom: tab === t ? `2px solid ${C.accent}` : "2px solid transparent",
                            cursor: "pointer", transition: "color 0.15s", marginBottom: -1 }}>
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "Overview"     && <OverviewTab />}
      {tab === "BTC & ETH"   && <BTCETHTab />}
      {tab === "On-Chain"     && <OnChainTab />}
      {tab === "DeFi"         && <DeFiTab />}
      {tab === "Derivatives"  && <DerivativesTab />}
      {tab === "ETFs"         && <ETFTab />}
      {tab === "Stablecoins"  && <StablecoinsTab />}
      {tab === "Mining"       && <MiningTab />}
      {tab === "Ecosystems"   && <EcosystemsTab />}
      {tab === "Institutional"&& <InstitutionalTab />}
      {tab === "Composite"    && <CompositeTab />}
    </div>
  );
}

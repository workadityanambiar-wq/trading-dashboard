"use client";
import { use, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  ChevronLeft, RefreshCw, Star, Globe, Building2, Users, TrendingUp,
  TrendingDown, Minus, ExternalLink, BarChart3, DollarSign, Shield,
  ArrowUpRight, ArrowDownRight, Calendar, GitCompare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWatchlist } from "@/hooks/useWatchlist";
import { TradingViewWidget } from "@/components/charts/TradingViewWidget";

// ── Formatters ────────────────────────────────────────────────────────────────

const f2 = (v: number | null | undefined, dec = 2) => v == null ? "—" : v.toFixed(dec);
const fPct = (v: number | null | undefined, asFrac = true) => {
  if (v == null) return "—";
  const p = asFrac ? v * 100 : v;
  return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
};
const fMktCap = (v: number | null | undefined) => {
  if (v == null) return "—";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(0)}`;
};
const fLargeNum = (v: number | null | undefined) => {
  if (v == null) return "—";
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toLocaleString();
};
const fPrice = (v: number | null | undefined) => v == null ? "—" : `$${v.toFixed(2)}`;
const fMult  = (v: number | null | undefined) => v == null ? "—" : `${v.toFixed(1)}x`;

const pctColor = (v: number | null | undefined, asFrac = true) => {
  if (v == null) return "";
  const val = asFrac ? v : v / 100;
  return val > 0.002 ? "text-emerald-400" : val < -0.002 ? "text-red-400" : "text-text-muted";
};

// ── API helpers ───────────────────────────────────────────────────────────────

const apiFetch = (url: string) => fetch(url).then(r => r.json());

// ── Types ─────────────────────────────────────────────────────────────────────

interface Profile {
  ticker: string;
  company_name?: string;
  short_name?: string;
  long_business_summary?: string;
  hq_city?: string;
  hq_state?: string;
  hq_country?: string;
  full_time_employees?: number;
  website?: string;
  exchange_code?: string;
  primary_sector?: string;
  primary_industry?: string;
  asset_class?: string;
  currency?: string;
  market_cap?: number;
  enterprise_value?: number;
  shares_outstanding?: number;
  float_shares?: number;
  avg_daily_volume?: number;
  // ratios
  pe_ratio?: number;
  forward_pe?: number;
  peg_ratio?: number;
  ev_revenue?: number;
  ev_ebitda?: number;
  price_sales?: number;
  price_book?: number;
  dividend_yield?: number;
  gross_margin?: number;
  operating_margin?: number;
  net_margin?: number;
  roe?: number;
  roa?: number;
  debt_equity?: number;
  current_ratio?: number;
  quick_ratio?: number;
  revenue_growth?: number;
  earnings_growth?: number;
  current_price?: number;
  price_change_1y?: number;
  price_change_3m?: number;
  high_52w?: number;
  low_52w?: number;
  beta?: number;
  avg_volume_30d?: number;
  target_price?: number;
  analyst_count?: number;
  recommendation?: string;
}

interface StatementRow {
  ticker: string;
  period_end: string;
  period_type: string;
  revenue?: number;
  gross_profit?: number;
  operating_income?: number;
  ebit?: number;
  ebitda?: number;
  net_income?: number;
  eps_diluted?: number;
  // balance sheet
  cash_and_equivalents?: number;
  total_current_assets?: number;
  total_assets?: number;
  total_debt?: number;
  net_debt?: number;
  shareholders_equity?: number;
  // cash flow
  operating_cash_flow?: number;
  capex?: number;
  free_cash_flow?: number;
  dividends_paid?: number;
  share_repurchases?: number;
  [key: string]: unknown;
}

interface Financials {
  annual: { income_statement: StatementRow[]; balance_sheet: StatementRow[]; cash_flow: StatementRow[] };
  quarterly: { income_statement: StatementRow[]; balance_sheet: StatementRow[]; cash_flow: StatementRow[] };
}

interface IHolder { holder_name: string; shares?: number; value?: number; pct_held?: number }
interface InsiderTx { insider_name: string; insider_title?: string; transaction_type: string; shares?: number; value?: number; transaction_date?: string }
interface CorpAction { action_date: string; action_type: string; description?: string; value?: number }

// ── Shared components ─────────────────────────────────────────────────────────

function Row({ label, value, color, mono = true }: {
  label: string; value: string; color?: string; mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
      <span className="text-[11px] text-text-muted">{label}</span>
      <span className={cn("text-[11px]", mono && "font-mono", "font-medium", color ?? "text-text-primary")}>
        {value}
      </span>
    </div>
  );
}

function Card({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-border bg-surface p-4", className)}>
      {title && <div className="text-xs font-semibold text-text-primary mb-3">{title}</div>}
      {children}
    </div>
  );
}

// ── Tab: Overview ─────────────────────────────────────────────────────────────

function OverviewTab({ profile, ticker }: { profile: Profile; ticker: string }) {
  const rangeHigh = profile.high_52w;
  const rangeLow  = profile.low_52w;
  const price     = profile.current_price;
  const rangePos  = rangeHigh && rangeLow && price && rangeHigh !== rangeLow
    ? ((price - rangeLow) / (rangeHigh - rangeLow)) * 100 : null;

  return (
    <div className="space-y-4">
      {/* Price chart */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-text-muted">Price Chart</span>
          <span className="text-[10px] text-text-muted/60">TradingView</span>
        </div>
        <TradingViewWidget symbol={ticker} height={380} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Key stats */}
        <Card title="Key Statistics">
          <Row label="Current Price"   value={fPrice(profile.current_price)} />
          <Row label="52W High"        value={fPrice(profile.high_52w)} />
          <Row label="52W Low"         value={fPrice(profile.low_52w)} />
          <Row label="Market Cap"      value={fMktCap(profile.market_cap)} />
          <Row label="Enterprise Value" value={fMktCap(profile.enterprise_value)} />
          <Row label="Shares Outstanding" value={fLargeNum(profile.shares_outstanding)} />
          <Row label="Float"           value={fLargeNum(profile.float_shares)} />
          <Row label="Avg Volume (30D)" value={fLargeNum(profile.avg_daily_volume)} />
          <Row label="Beta"            value={f2(profile.beta)} />
          {rangePos != null && (
            <div className="pt-2">
              <div className="flex items-center justify-between text-[11px] text-text-muted mb-1">
                <span>${profile.low_52w?.toFixed(0)}</span>
                <span>52-Week Range</span>
                <span>${profile.high_52w?.toFixed(0)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-2 relative">
                <div className="absolute h-1.5 rounded-full bg-accent/60" style={{ width: `${rangePos}%` }} />
                <div className="absolute h-3 w-0.5 bg-accent -top-0.5 rounded-full" style={{ left: `${rangePos}%` }} />
              </div>
            </div>
          )}
        </Card>

        {/* Valuation snapshot */}
        <Card title="Valuation">
          <Row label="P/E (Trailing)"  value={fMult(profile.pe_ratio)} />
          <Row label="P/E (Forward)"   value={fMult(profile.forward_pe)} />
          <Row label="PEG Ratio"       value={f2(profile.peg_ratio)} />
          <Row label="EV/Revenue"      value={fMult(profile.ev_revenue)} />
          <Row label="EV/EBITDA"       value={fMult(profile.ev_ebitda)} />
          <Row label="Price/Sales"     value={fMult(profile.price_sales)} />
          <Row label="Price/Book"      value={fMult(profile.price_book)} />
          <Row label="Dividend Yield"  value={fPct(profile.dividend_yield)} />
          <Row label="Analyst Target"  value={fPrice(profile.target_price)} />
          {profile.target_price && profile.current_price && (
            <Row
              label="Upside to Target"
              value={fPct((profile.target_price - profile.current_price) / profile.current_price)}
              color={profile.target_price > profile.current_price ? "text-emerald-400" : "text-red-400"}
            />
          )}
        </Card>

        {/* Profitability */}
        <Card title="Profitability & Growth">
          <Row label="Gross Margin"    value={fPct(profile.gross_margin)} />
          <Row label="Operating Margin" value={fPct(profile.operating_margin)} />
          <Row label="Net Margin"      value={fPct(profile.net_margin)} color={profile.net_margin != null && profile.net_margin > 0 ? "text-emerald-400" : "text-red-400"} />
          <Row label="ROE"             value={fPct(profile.roe)} color={pctColor(profile.roe)} />
          <Row label="ROA"             value={fPct(profile.roa)} />
          <Row label="Revenue Growth"  value={fPct(profile.revenue_growth)} color={pctColor(profile.revenue_growth)} />
          <Row label="Earnings Growth" value={fPct(profile.earnings_growth)} color={pctColor(profile.earnings_growth)} />
          <Row label="D/E Ratio"       value={f2(profile.debt_equity)} />
          <Row label="Current Ratio"   value={f2(profile.current_ratio)} />
          <Row label="Quick Ratio"     value={f2(profile.quick_ratio)} />
        </Card>
      </div>

      {/* Business summary */}
      {profile.long_business_summary && (
        <Card title="Business Overview">
          <p className="text-[11px] text-text-muted leading-relaxed">{profile.long_business_summary}</p>
        </Card>
      )}

      {/* Company details */}
      <Card title="Company Details">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {profile.hq_city && (
            <div>
              <div className="text-[10px] text-text-muted uppercase tracking-wide mb-0.5">Headquarters</div>
              <div className="text-xs text-text-primary">
                {[profile.hq_city, profile.hq_state, profile.hq_country].filter(Boolean).join(", ")}
              </div>
            </div>
          )}
          {profile.full_time_employees && (
            <div>
              <div className="text-[10px] text-text-muted uppercase tracking-wide mb-0.5">Employees</div>
              <div className="text-xs font-mono text-text-primary">{profile.full_time_employees.toLocaleString()}</div>
            </div>
          )}
          {profile.primary_sector && (
            <div>
              <div className="text-[10px] text-text-muted uppercase tracking-wide mb-0.5">Sector</div>
              <div className="text-xs text-text-primary">{profile.primary_sector}</div>
            </div>
          )}
          {profile.primary_industry && (
            <div>
              <div className="text-[10px] text-text-muted uppercase tracking-wide mb-0.5">Industry</div>
              <div className="text-xs text-text-primary">{profile.primary_industry}</div>
            </div>
          )}
          {profile.currency && (
            <div>
              <div className="text-[10px] text-text-muted uppercase tracking-wide mb-0.5">Currency</div>
              <div className="text-xs font-mono text-text-primary">{profile.currency}</div>
            </div>
          )}
          {profile.website && (
            <div>
              <div className="text-[10px] text-text-muted uppercase tracking-wide mb-0.5">Website</div>
              <a
                href={profile.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-accent hover:underline flex items-center gap-1"
                onClick={e => e.stopPropagation()}
              >
                {profile.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                <ExternalLink size={10} />
              </a>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// ── Tab: Financials ───────────────────────────────────────────────────────────

function FinancialsTab({ ticker }: { ticker: string }) {
  const [period, setPeriod] = useState<"annual" | "quarterly">("annual");

  const { data, isLoading } = useQuery<Financials>({
    queryKey: ["universe-financials", ticker],
    queryFn: () => apiFetch(`/api/universe/${ticker}/financials`),
    staleTime: 24 * 60 * 60_000,
  });

  if (isLoading) return <LoadingSpinner text="Loading financial statements…" />;

  const set = data?.[period];
  const is  = set?.income_statement ?? [];
  const bs  = set?.balance_sheet ?? [];
  const cf  = set?.cash_flow ?? [];
  const periods = is.map(r => r.period_end?.slice(0, 10) ?? "");

  if (is.length === 0 && bs.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-8 text-center text-text-muted text-sm">
        No financial data cached yet. Click refresh or visit the stock detail to trigger a fetch.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Period toggle */}
      <div className="flex items-center gap-2">
        {(["annual", "quarterly"] as const).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={cn(
              "px-3 py-1 rounded border text-xs font-medium transition-colors capitalize",
              period === p ? "bg-accent border-accent text-white" : "border-border text-text-muted hover:text-text-primary"
            )}
          >
            {p === "annual" ? "Annual" : "Quarterly"}
          </button>
        ))}
      </div>

      {/* Income Statement */}
      {is.length > 0 && (
        <div className="rounded-lg border border-border bg-surface overflow-x-auto">
          <div className="px-4 py-3 border-b border-border text-xs font-semibold text-text-primary">Income Statement</div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/40">
                <th className="px-4 py-2 text-left text-[11px] text-text-muted font-medium w-52">Metric</th>
                {periods.map(p => (
                  <th key={p} className="px-4 py-2 text-right text-[11px] text-text-muted font-mono font-medium">{p}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { key: "revenue",          label: "Revenue" },
                { key: "gross_profit",     label: "Gross Profit" },
                { key: "operating_income", label: "Operating Income" },
                { key: "ebitda",           label: "EBITDA" },
                { key: "net_income",       label: "Net Income" },
                { key: "eps_diluted",      label: "EPS (Diluted)", isDollar: true, small: true },
              ].map(({ key, label, isDollar, small }) => (
                <tr key={key} className="border-b border-border/30 hover:bg-surface-2">
                  <td className="px-4 py-1.5 text-[11px] text-text-muted">{label}</td>
                  {is.map((row, i) => {
                    const v = row[key] as number | null;
                    return (
                      <td key={i} className="px-4 py-1.5 text-right text-[11px] font-mono text-text-primary">
                        {v == null ? "—" : small ? `$${v.toFixed(2)}` : `$${(v / 1e9).toFixed(2)}B`}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* Margin rows */}
              {is.map && is[0]?.revenue && is[0].gross_profit && (
                <>
                  <tr className="border-b border-border/30 bg-surface-2/50">
                    <td className="px-4 py-1.5 text-[11px] text-text-muted italic pl-6">Gross Margin</td>
                    {is.map((row, i) => (
                      <td key={i} className="px-4 py-1.5 text-right text-[11px] font-mono">
                        <span className={row.revenue && row.gross_profit ? pctColor(row.gross_profit / row.revenue) : ""}>
                          {row.revenue && row.gross_profit ? fPct(row.gross_profit / row.revenue, false) : "—"}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-border/30 bg-surface-2/50">
                    <td className="px-4 py-1.5 text-[11px] text-text-muted italic pl-6">Net Margin</td>
                    {is.map((row, i) => (
                      <td key={i} className="px-4 py-1.5 text-right text-[11px] font-mono">
                        <span className={row.revenue && row.net_income != null ? pctColor(row.net_income / row.revenue) : ""}>
                          {row.revenue && row.net_income != null ? fPct(row.net_income / row.revenue, false) : "—"}
                        </span>
                      </td>
                    ))}
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Balance Sheet */}
      {bs.length > 0 && (
        <div className="rounded-lg border border-border bg-surface overflow-x-auto">
          <div className="px-4 py-3 border-b border-border text-xs font-semibold text-text-primary">Balance Sheet</div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/40">
                <th className="px-4 py-2 text-left text-[11px] text-text-muted font-medium w-52">Metric</th>
                {bs.map(r => (
                  <th key={r.period_end} className="px-4 py-2 text-right text-[11px] text-text-muted font-mono font-medium">
                    {r.period_end?.slice(0, 10)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { key: "cash_and_equivalents",      label: "Cash & Equivalents" },
                { key: "total_current_assets",      label: "Current Assets" },
                { key: "total_assets",              label: "Total Assets" },
                { key: "total_current_liabilities", label: "Current Liabilities" },
                { key: "long_term_debt",            label: "Long-Term Debt" },
                { key: "total_debt",                label: "Total Debt" },
                { key: "net_debt",                  label: "Net Debt" },
                { key: "shareholders_equity",       label: "Shareholders' Equity" },
              ].map(({ key, label }) => (
                <tr key={key} className="border-b border-border/30 hover:bg-surface-2">
                  <td className="px-4 py-1.5 text-[11px] text-text-muted">{label}</td>
                  {bs.map((row, i) => {
                    const v = row[key] as number | null;
                    return (
                      <td key={i} className="px-4 py-1.5 text-right text-[11px] font-mono text-text-primary">
                        {v == null ? "—" : `$${(v / 1e9).toFixed(2)}B`}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Cash Flow */}
      {cf.length > 0 && (
        <div className="rounded-lg border border-border bg-surface overflow-x-auto">
          <div className="px-4 py-3 border-b border-border text-xs font-semibold text-text-primary">Cash Flow Statement</div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/40">
                <th className="px-4 py-2 text-left text-[11px] text-text-muted font-medium w-52">Metric</th>
                {cf.map(r => (
                  <th key={r.period_end} className="px-4 py-2 text-right text-[11px] text-text-muted font-mono font-medium">
                    {r.period_end?.slice(0, 10)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { key: "operating_cash_flow", label: "Operating Cash Flow" },
                { key: "capex",               label: "Capital Expenditure" },
                { key: "free_cash_flow",      label: "Free Cash Flow" },
                { key: "investing_cash_flow", label: "Investing Cash Flow" },
                { key: "financing_cash_flow", label: "Financing Cash Flow" },
                { key: "dividends_paid",      label: "Dividends Paid" },
                { key: "share_repurchases",   label: "Share Repurchases" },
              ].map(({ key, label }) => (
                <tr key={key} className="border-b border-border/30 hover:bg-surface-2">
                  <td className="px-4 py-1.5 text-[11px] text-text-muted">{label}</td>
                  {cf.map((row, i) => {
                    const v = row[key] as number | null;
                    const isFcf = key === "free_cash_flow";
                    return (
                      <td key={i} className={cn("px-4 py-1.5 text-right text-[11px] font-mono", isFcf && v != null ? (v >= 0 ? "text-emerald-400" : "text-red-400") : "text-text-primary")}>
                        {v == null ? "—" : `$${(v / 1e9).toFixed(2)}B`}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tab: Ownership ────────────────────────────────────────────────────────────

function OwnershipTab({ ticker }: { ticker: string }) {
  const { data, isLoading } = useQuery<{ institutional_holders: IHolder[]; insider_transactions: InsiderTx[] }>({
    queryKey: ["universe-ownership", ticker],
    queryFn: () => apiFetch(`/api/universe/${ticker}/ownership`),
    staleTime: 6 * 60 * 60_000,
  });

  if (isLoading) return <LoadingSpinner text="Loading ownership data…" />;

  const ih  = data?.institutional_holders ?? [];
  const ins = data?.insider_transactions ?? [];

  return (
    <div className="space-y-4">
      {/* Institutional holders */}
      <div className="rounded-lg border border-border bg-surface overflow-x-auto">
        <div className="px-4 py-3 border-b border-border text-xs font-semibold text-text-primary">
          Top Institutional Holders
        </div>
        {ih.length === 0 ? (
          <div className="px-4 py-6 text-center text-text-muted text-xs">No institutional holder data available.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/40">
                <th className="px-4 py-2 text-left text-[11px] text-text-muted font-medium">Holder</th>
                <th className="px-4 py-2 text-right text-[11px] text-text-muted font-medium">Shares</th>
                <th className="px-4 py-2 text-right text-[11px] text-text-muted font-medium">Value</th>
                <th className="px-4 py-2 text-right text-[11px] text-text-muted font-medium">% Held</th>
              </tr>
            </thead>
            <tbody>
              {ih.map((h, i) => (
                <tr key={i} className="border-b border-border/30 hover:bg-surface-2">
                  <td className="px-4 py-2 text-[11px] text-text-primary">{h.holder_name}</td>
                  <td className="px-4 py-2 text-right text-[11px] font-mono text-text-primary">{fLargeNum(h.shares)}</td>
                  <td className="px-4 py-2 text-right text-[11px] font-mono text-text-primary">{fMktCap(h.value)}</td>
                  <td className="px-4 py-2 text-right text-[11px] font-mono text-text-primary">
                    {h.pct_held != null ? `${(h.pct_held * 100).toFixed(2)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Insider transactions */}
      <div className="rounded-lg border border-border bg-surface overflow-x-auto">
        <div className="px-4 py-3 border-b border-border text-xs font-semibold text-text-primary">
          Insider Transactions
        </div>
        {ins.length === 0 ? (
          <div className="px-4 py-6 text-center text-text-muted text-xs">No insider transaction data available.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/40">
                <th className="px-4 py-2 text-left text-[11px] text-text-muted font-medium">Date</th>
                <th className="px-4 py-2 text-left text-[11px] text-text-muted font-medium">Insider</th>
                <th className="px-4 py-2 text-left text-[11px] text-text-muted font-medium">Title</th>
                <th className="px-4 py-2 text-left text-[11px] text-text-muted font-medium">Type</th>
                <th className="px-4 py-2 text-right text-[11px] text-text-muted font-medium">Shares</th>
                <th className="px-4 py-2 text-right text-[11px] text-text-muted font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {ins.map((tx, i) => (
                <tr key={i} className="border-b border-border/30 hover:bg-surface-2">
                  <td className="px-4 py-2 text-[11px] font-mono text-text-muted">{tx.transaction_date?.slice(0, 10) || "—"}</td>
                  <td className="px-4 py-2 text-[11px] text-text-primary">{tx.insider_name}</td>
                  <td className="px-4 py-2 text-[11px] text-text-muted">{tx.insider_title || "—"}</td>
                  <td className="px-4 py-2">
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-medium",
                      tx.transaction_type === "BUY" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                    )}>
                      {tx.transaction_type}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right text-[11px] font-mono text-text-primary">{fLargeNum(tx.shares)}</td>
                  <td className="px-4 py-2 text-right text-[11px] font-mono text-text-primary">{fMktCap(tx.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Tab: Analysts ─────────────────────────────────────────────────────────────

function AnalystsTab({ profile }: { profile: Profile }) {
  const recMap: Record<string, string> = {
    "STRONG BUY": "text-emerald-400",
    "BUY": "text-emerald-400",
    "HOLD": "text-amber-400",
    "SELL": "text-red-400",
    "STRONG SELL": "text-red-400",
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Consensus Rating">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-text-muted">Recommendation</span>
              <span className={cn("text-sm font-bold", recMap[profile.recommendation || ""] || "text-text-primary")}>
                {profile.recommendation || "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-text-muted">Analyst Count</span>
              <span className="text-xs font-mono text-text-primary">{profile.analyst_count ?? "—"}</span>
            </div>
          </div>
        </Card>

        <Card title="Price Target">
          <div className="space-y-3">
            <div className="text-2xl font-bold font-mono text-text-primary">{fPrice(profile.target_price)}</div>
            {profile.target_price && profile.current_price && (
              <div className={cn(
                "flex items-center gap-1 text-sm font-medium",
                profile.target_price > profile.current_price ? "text-emerald-400" : "text-red-400"
              )}>
                {profile.target_price > profile.current_price
                  ? <ArrowUpRight size={14} />
                  : <ArrowDownRight size={14} />}
                {fPct((profile.target_price - profile.current_price) / profile.current_price)} from current
              </div>
            )}
            <Row label="Current Price" value={fPrice(profile.current_price)} />
          </div>
        </Card>

        <Card title="Estimate Summary">
          <Row label="Revenue Growth (Est.)" value={fPct(profile.revenue_growth)} color={pctColor(profile.revenue_growth)} />
          <Row label="Earnings Growth (Est.)" value={fPct(profile.earnings_growth)} color={pctColor(profile.earnings_growth)} />
          <Row label="Forward P/E" value={fMult(profile.forward_pe)} />
          <Row label="PEG Ratio" value={f2(profile.peg_ratio)} />
        </Card>
      </div>
    </div>
  );
}

// ── Tab: Corporate Actions ────────────────────────────────────────────────────

function ActionsTab({ ticker }: { ticker: string }) {
  const { data, isLoading } = useQuery<CorpAction[]>({
    queryKey: ["universe-actions", ticker],
    queryFn: () => apiFetch(`/api/universe/${ticker}/corporate-actions`),
    staleTime: 24 * 60 * 60_000,
  });

  if (isLoading) return <LoadingSpinner text="Loading corporate actions…" />;

  const actions = data ?? [];

  if (actions.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-8 text-center text-text-muted text-sm">
        No corporate action history available.
      </div>
    );
  }

  const divs   = actions.filter(a => a.action_type === "DIVIDEND");
  const splits = actions.filter(a => a.action_type === "SPLIT");
  const other  = actions.filter(a => !["DIVIDEND", "SPLIT"].includes(a.action_type));

  return (
    <div className="space-y-4">
      {splits.length > 0 && (
        <div className="rounded-lg border border-border bg-surface overflow-x-auto">
          <div className="px-4 py-3 border-b border-border text-xs font-semibold text-text-primary">Stock Splits</div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/40">
                <th className="px-4 py-2 text-left text-[11px] text-text-muted font-medium">Date</th>
                <th className="px-4 py-2 text-left text-[11px] text-text-muted font-medium">Details</th>
                <th className="px-4 py-2 text-right text-[11px] text-text-muted font-medium">Ratio</th>
              </tr>
            </thead>
            <tbody>
              {splits.map((a, i) => (
                <tr key={i} className="border-b border-border/30 hover:bg-surface-2">
                  <td className="px-4 py-2 text-[11px] font-mono text-text-muted">{a.action_date}</td>
                  <td className="px-4 py-2 text-[11px] text-text-primary">{a.description}</td>
                  <td className="px-4 py-2 text-right text-[11px] font-mono text-emerald-400">{a.value?.toFixed(2)}:1</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-lg border border-border bg-surface overflow-x-auto">
        <div className="px-4 py-3 border-b border-border text-xs font-semibold text-text-primary">
          Dividend History ({divs.length} payments)
        </div>
        {divs.length === 0 ? (
          <div className="px-4 py-4 text-xs text-text-muted">No dividend history.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/40">
                <th className="px-4 py-2 text-left text-[11px] text-text-muted font-medium">Date</th>
                <th className="px-4 py-2 text-right text-[11px] text-text-muted font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {divs.slice(0, 30).map((a, i) => (
                <tr key={i} className="border-b border-border/30 hover:bg-surface-2">
                  <td className="px-4 py-1.5 text-[11px] font-mono text-text-muted">{a.action_date}</td>
                  <td className="px-4 py-1.5 text-right text-[11px] font-mono text-text-primary">${a.value?.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Loading spinner ───────────────────────────────────────────────────────────

function LoadingSpinner({ text }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-text-muted text-sm">
      <RefreshCw size={14} className="animate-spin" />
      {text || "Loading…"}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: "overview",   label: "Overview" },
  { id: "financials", label: "Financials" },
  { id: "ownership",  label: "Ownership" },
  { id: "analysts",   label: "Analysts" },
  { id: "actions",    label: "Corp. Actions" },
] as const;

type TabId = typeof TABS[number]["id"];

export default function SecurityDetailPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = use(params);
  const upperTicker = ticker.toUpperCase();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const { has: wlHas, add: wlAdd, remove: wlRemove, mounted } = useWatchlist();

  const { data: profile, isLoading, isFetching, refetch } = useQuery<Profile>({
    queryKey: ["universe-profile", upperTicker],
    queryFn: () => apiFetch(`/api/universe/${upperTicker}/profile`),
    staleTime: 6 * 60_000,
  });

  if (isLoading) return <LoadingSpinner text={`Loading ${upperTicker}…`} />;

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="text-negative text-sm">No data found for {upperTicker}</div>
        <Link href="/universe" className="text-xs text-accent hover:underline">← Back to Universe</Link>
      </div>
    );
  }

  const isWatched = mounted && wlHas(upperTicker);
  const price     = profile.current_price;
  const change1y  = profile.price_change_1y;
  const changeColor = change1y == null ? "" : change1y > 0 ? "text-emerald-400" : change1y < 0 ? "text-red-400" : "text-text-muted";
  const ChangeIcon = change1y == null ? Minus : change1y > 0 ? TrendingUp : TrendingDown;

  return (
    <div className="space-y-4 max-w-[1400px]">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1.5">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
            <Link href="/universe" className="hover:text-text-primary transition-colors flex items-center gap-1">
              <ChevronLeft size={12} />
              Investment Universe
            </Link>
            <span>/</span>
            <span className="text-text-primary font-mono">{upperTicker}</span>
          </div>

          {/* Company name + ticker */}
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-text-primary font-mono">{upperTicker}</h1>
            {profile.company_name && (
              <span className="text-sm text-text-muted">{profile.company_name}</span>
            )}
            {mounted && (
              <button onClick={() => isWatched ? wlRemove(upperTicker) : wlAdd(upperTicker)}>
                <Star
                  size={15}
                  strokeWidth={1.5}
                  className={isWatched ? "fill-amber-400 text-amber-400" : "text-text-muted/40 hover:text-amber-400"}
                />
              </button>
            )}
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-2 flex-wrap text-[11px] text-text-muted">
            {profile.exchange_code && (
              <span className="px-1.5 py-0.5 rounded border border-border bg-surface-2 font-mono">
                {profile.exchange_code}
              </span>
            )}
            {profile.primary_sector && <span>{profile.primary_sector}</span>}
            {profile.primary_industry && <><span>·</span><span>{profile.primary_industry}</span></>}
            {profile.asset_class && profile.asset_class !== "EQUITY" && (
              <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20">
                {profile.asset_class}
              </span>
            )}
            {profile.currency && <span className="font-mono">{profile.currency}</span>}
          </div>
        </div>

        {/* Price block + actions */}
        <div className="flex items-start gap-4">
          {price != null && (
            <div className="text-right space-y-1">
              <div className="text-2xl font-bold font-mono text-text-primary">{fPrice(price)}</div>
              <div className={cn("flex items-center justify-end gap-1 text-sm font-mono", changeColor)}>
                <ChangeIcon size={13} strokeWidth={2} />
                {fPct(change1y)} 1Y
              </div>
              {profile.market_cap != null && (
                <div className="text-[11px] text-text-muted">
                  Mkt Cap: {fMktCap(profile.market_cap)}
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="p-1.5 rounded border border-border text-text-muted hover:text-text-primary disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-0 border-b border-border overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors",
              activeTab === tab.id
                ? "border-accent text-accent"
                : "border-transparent text-text-muted hover:text-text-primary"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ────────────────────────────────────────────────────── */}
      {activeTab === "overview"   && <OverviewTab profile={profile} ticker={upperTicker} />}
      {activeTab === "financials" && <FinancialsTab ticker={upperTicker} />}
      {activeTab === "ownership"  && <OwnershipTab ticker={upperTicker} />}
      {activeTab === "analysts"   && <AnalystsTab profile={profile} />}
      {activeTab === "actions"    && <ActionsTab ticker={upperTicker} />}
    </div>
  );
}

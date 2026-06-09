"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  api,
  type RiskRequest,
  type RiskResponse,
  type VarCvarPoint,
} from "@/lib/api";
import { FactorAttribution } from "@/components/charts/FactorAttribution";
import { RollingBetaChart } from "@/components/charts/RollingBetaChart";
import { CorrelationHeatmap } from "@/components/charts/CorrelationHeatmap";
import { cn, formatPct } from "@/lib/utils";
import { Play, RefreshCw, ShieldAlert } from "lucide-react";

// ── Default portfolio weights ─────────────────────────────────────────────────

const DEFAULT_WEIGHTS = `AAPL: 0.15
MSFT: 0.15
GOOGL: 0.10
AMZN: 0.10
NVDA: 0.10
META: 0.08
JPM: 0.08
JNJ: 0.08
XOM: 0.08
BRK-B: 0.08`;

// ── VaR / CVaR table ──────────────────────────────────────────────────────────

function VarTable({ data }: { data: VarCvarPoint[] }) {
  return (
    <table className="w-full text-xs border-separate border-spacing-y-0.5">
      <thead>
        <tr className="text-text-muted">
          <th className="text-left py-1 pr-3 font-normal">Confidence</th>
          <th className="text-right py-1 pr-3 font-normal">VaR (Hist)</th>
          <th className="text-right py-1 pr-3 font-normal">CVaR (Hist)</th>
          <th className="text-right py-1 pr-3 font-normal">VaR (Param)</th>
          <th className="text-right py-1 font-normal">CVaR (Param)</th>
        </tr>
      </thead>
      <tbody>
        {data.map((row) => (
          <tr key={row.confidence} className="bg-surface-2">
            <td className="py-1.5 px-2 rounded-l font-mono text-text-primary">
              {(row.confidence * 100).toFixed(0)}%
            </td>
            {[row.var_hist, row.cvar_hist, row.var_param, row.cvar_param].map((v, i) => (
              <td
                key={i}
                className={cn(
                  "py-1.5 px-2 font-mono text-right",
                  i === 3 ? "rounded-r" : "",
                  v < 0 ? "text-negative" : "text-positive"
                )}
              >
                {formatPct(v)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Concentration panel ───────────────────────────────────────────────────────

function ConcentrationPanel({ data }: { data: RiskResponse["concentration"] }) {
  const metrics = [
    { label: "Holdings", value: data.n_holdings.toString() },
    { label: "HHI", value: data.hhi.toFixed(4) },
    { label: "Effective N", value: data.effective_n.toFixed(1) },
    { label: "Top 5 weight", value: formatPct(data.top5_weight) },
    { label: "Top 10 weight", value: formatPct(data.top10_weight) },
  ];
  const hhi_warn = data.hhi > 0.25;
  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
      {metrics.map((m) => (
        <div key={m.label} className="bg-surface-2 rounded p-2">
          <div className="text-text-muted text-[10px] mb-0.5">{m.label}</div>
          <div
            className={cn(
              "text-xs font-mono font-semibold",
              m.label === "HHI" && hhi_warn ? "text-yellow-400" : "text-text-primary"
            )}
          >
            {m.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Sector exposure bar ───────────────────────────────────────────────────────

const SECTOR_COLORS = [
  "#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4",
  "#a78bfa", "#34d399", "#fbbf24", "#f87171", "#38bdf8",
  "#c084fc", "#4ade80",
];

function SectorBar({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data);
  if (!entries.length) return null;
  return (
    <div className="space-y-2">
      {entries.map(([sector, w], i) => (
        <div key={sector} className="flex items-center gap-2 text-xs">
          <span className="w-32 text-text-muted truncate shrink-0" title={sector}>{sector}</span>
          <div className="flex-1 bg-surface-2 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${(w * 100).toFixed(1)}%`, background: SECTOR_COLORS[i % SECTOR_COLORS.length] }}
            />
          </div>
          <span className="w-12 font-mono text-text-muted text-right shrink-0">
            {(w * 100).toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Portfolio stats row ───────────────────────────────────────────────────────

function PortfolioStatsRow({ stats }: { stats: RiskResponse["portfolio_stats"] }) {
  const items = [
    { label: "Ann. Return", value: formatPct(stats.annualized_return), positive: stats.annualized_return >= 0 },
    { label: "Ann. Volatility", value: formatPct(stats.annualized_volatility), positive: true },
    { label: "Sharpe", value: stats.sharpe_ratio.toFixed(2), positive: stats.sharpe_ratio >= 1 },
    { label: "N Obs", value: stats.n_obs.toLocaleString(), positive: true },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {items.map((item) => (
        <div key={item.label} className="bg-surface-2 rounded-lg p-3">
          <div className="text-text-muted text-[10px] mb-0.5">{item.label}</div>
          <div
            className={cn(
              "text-lg font-mono font-semibold",
              item.label === "Ann. Volatility" || item.label === "N Obs"
                ? "text-text-primary"
                : item.positive
                ? "text-positive"
                : "text-negative"
            )}
          >
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Parse weights input ───────────────────────────────────────────────────────

function parseWeights(raw: string): Record<string, number> | null {
  const weights: Record<string, number> = {};
  for (const line of raw.split("\n")) {
    const cleaned = line.trim();
    if (!cleaned || cleaned.startsWith("#")) continue;
    const sep = cleaned.includes(":") ? ":" : cleaned.includes("=") ? "=" : ",";
    const [ticker, wStr] = cleaned.split(sep).map((s) => s.trim());
    if (!ticker || !wStr) return null;
    const w = parseFloat(wStr);
    if (isNaN(w)) return null;
    weights[ticker.toUpperCase()] = w;
  }
  return Object.keys(weights).length ? weights : null;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RiskPage() {
  const [weightsInput, setWeightsInput] = useState(DEFAULT_WEIGHTS);
  const [startDate, setStartDate] = useState("2019-01-01");
  const [parseError, setParseError] = useState<string | null>(null);

  const { mutate, data, isPending, error } = useMutation({
    mutationFn: api.analyzeRisk,
  });

  function runAnalysis() {
    const weights = parseWeights(weightsInput);
    if (!weights) {
      setParseError("Could not parse weights. Use format: TICKER: weight (one per line)");
      return;
    }
    setParseError(null);
    const req: RiskRequest = { weights, start_date: startDate };
    mutate(req);
  }

  return (
    <div className="space-y-5 max-w-screen-2xl">
      {/* Header */}
      <div>
        <h1 className="text-base font-semibold">Risk Dashboard</h1>
        <p className="text-xs text-text-muted mt-0.5">
          VaR / CVaR · Fama-French attribution · Rolling beta · Concentration · Sector exposure
        </p>
      </div>

      {/* Config */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-1">
            <label className="text-xs text-text-muted">
              Portfolio weights (TICKER: weight, one per line)
            </label>
            <textarea
              value={weightsInput}
              onChange={(e) => setWeightsInput(e.target.value)}
              rows={8}
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent font-mono resize-none"
              placeholder={"AAPL: 0.15\nMSFT: 0.10\n..."}
            />
            {parseError && <div className="text-red-400 text-xs">{parseError}</div>}
          </div>

          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs text-text-muted">Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-surface-2 border border-border rounded px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent w-full"
              />
            </div>

            <div className="text-xs text-text-muted space-y-1 bg-surface-2 rounded p-2.5">
              <div className="text-text-primary font-medium mb-1">Tip</div>
              <div>Weights are auto-normalized to sum to 1.</div>
              <div>Supports TICKER: value or TICKER = value formats.</div>
            </div>

            <button
              onClick={runAnalysis}
              disabled={isPending}
              className="flex items-center gap-2 px-4 py-2 rounded bg-accent hover:bg-accent/90 text-white text-xs font-medium transition-colors disabled:opacity-60 w-full justify-center"
            >
              {isPending ? (
                <RefreshCw size={13} className="animate-spin" />
              ) : (
                <Play size={13} />
              )}
              {isPending ? "Analyzing..." : "Analyze Risk"}
            </button>
          </div>
        </div>
      </div>

      {/* API error */}
      {error && (
        <div className="rounded border border-red-900/40 bg-red-950/20 text-red-400 text-xs p-3">
          {(error as Error).message}
        </div>
      )}

      {/* Loading */}
      {isPending && (
        <div className="flex items-center gap-2 justify-center py-16 text-text-muted text-sm">
          <RefreshCw size={14} className="animate-spin" />
          Fetching prices and computing risk metrics...
        </div>
      )}

      {/* Results */}
      {data && !isPending && (
        <div className="space-y-5">
          {/* Info bar */}
          <div className="text-xs text-text-muted">
            {data.tickers_used.length} tickers used
            {data.tickers_missing.length > 0 && (
              <span className="text-yellow-500 ml-2">
                · Missing: {data.tickers_missing.join(", ")}
              </span>
            )}
            <span className="ml-2">
              · {data.price_history_start} to {data.price_history_end}
            </span>
          </div>

          {/* Portfolio stats row */}
          <PortfolioStatsRow stats={data.portfolio_stats} />

          {/* VaR / CVaR + Concentration */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="text-sm font-medium mb-1">Value at Risk / CVaR</div>
              <div className="text-xs text-text-muted mb-4">
                Daily loss thresholds · Historical and parametric
              </div>
              <VarTable data={data.var_cvar} />
            </div>

            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="text-sm font-medium mb-1">Concentration</div>
              <div className="text-xs text-text-muted mb-4">
                HHI · Effective N · Top-weight exposure
              </div>
              <ConcentrationPanel data={data.concentration} />
            </div>
          </div>

          {/* FF3 attribution */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="text-sm font-medium mb-1">Fama-French 3-Factor Attribution</div>
            <div className="text-xs text-text-muted mb-4">
              OLS regression of excess portfolio returns on Mkt-RF, SMB, HML
              {data.attribution.error && (
                <span className="text-yellow-500 ml-2">· {data.attribution.error}</span>
              )}
            </div>
            <FactorAttribution data={data.attribution} height={200} />
          </div>

          {/* Rolling beta + Sector exposure */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="text-sm font-medium mb-1">Rolling Beta vs SPY</div>
              <div className="text-xs text-text-muted mb-4">63-day rolling window</div>
              <RollingBetaChart data={data.rolling_beta} height={200} />
            </div>

            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="text-sm font-medium mb-1">Sector Exposure</div>
              <div className="text-xs text-text-muted mb-4">
                Aggregated portfolio weight by GICS sector
              </div>
              <SectorBar data={data.sector_exposure} />
            </div>
          </div>

          {/* Correlation heatmap */}
          {data.correlation?.tickers?.length >= 2 && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="text-sm font-medium mb-1">Correlation Matrix</div>
              <div className="text-xs text-text-muted mb-4">
                Pairwise daily return correlation of holdings
              </div>
              <CorrelationHeatmap data={data.correlation} />
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!data && !isPending && !error && (
        <div className="flex flex-col items-center justify-center py-24 text-text-muted gap-3">
          <ShieldAlert size={32} strokeWidth={1} />
          <div className="text-sm">Enter portfolio weights and run analysis</div>
          <div className="text-xs">VaR · CVaR · Fama-French · Rolling beta · Sector breakdown</div>
        </div>
      )}
    </div>
  );
}

import { cn } from "@/lib/utils";

export interface BacktestStats {
  total_return?: number;
  cagr?: number;
  sharpe?: number;
  sortino?: number;
  calmar?: number;
  max_drawdown?: number;
  volatility?: number;
  beta?: number;
  alpha?: number;
  information_ratio?: number;
  hit_rate?: number;
  avg_monthly_return?: number;
  best_month?: number;
  worst_month?: number;
}

const METRICS: { key: keyof BacktestStats; label: string; fmt: "pct" | "num" | "ratio" }[] = [
  { key: "total_return",       label: "Total Return",     fmt: "pct"   },
  { key: "cagr",               label: "CAGR",             fmt: "pct"   },
  { key: "sharpe",             label: "Sharpe Ratio",     fmt: "ratio" },
  { key: "sortino",            label: "Sortino Ratio",    fmt: "ratio" },
  { key: "calmar",             label: "Calmar Ratio",     fmt: "ratio" },
  { key: "max_drawdown",       label: "Max Drawdown",     fmt: "pct"   },
  { key: "volatility",         label: "Ann. Volatility",  fmt: "pct"   },
  { key: "beta",               label: "Beta (vs SPY)",    fmt: "ratio" },
  { key: "alpha",              label: "Alpha (ann.)",     fmt: "pct"   },
  { key: "information_ratio",  label: "Info Ratio",       fmt: "ratio" },
  { key: "hit_rate",           label: "Hit Rate",         fmt: "pct"   },
  { key: "avg_monthly_return", label: "Avg Monthly Ret",  fmt: "pct"   },
  { key: "best_month",         label: "Best Month",       fmt: "pct"   },
  { key: "worst_month",        label: "Worst Month",      fmt: "pct"   },
];

function fmt(v: number | undefined, type: "pct" | "num" | "ratio"): string {
  if (v === undefined || v === null) return "—";
  if (type === "pct") return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;
  return v.toFixed(3);
}

function isPositive(key: keyof BacktestStats, v: number): boolean {
  if (key === "max_drawdown" || key === "worst_month") return false; // always negative context
  return v >= 0;
}

interface Props { stats: BacktestStats }

export function StatsTable({ stats }: Props) {
  const left = METRICS.slice(0, 7);
  const right = METRICS.slice(7);

  function renderGroup(items: typeof METRICS) {
    return items.map(({ key, label, fmt: type }) => {
      const v = stats[key] as number | undefined;
      const display = fmt(v, type);
      const colored = v !== undefined;
      const positive = colored && isPositive(key, v!);
      return (
        <div key={key} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
          <span className="text-xs text-text-muted">{label}</span>
          <span
            className={cn(
              "text-xs font-mono font-medium",
              colored ? (positive ? "text-positive" : key === "max_drawdown" || key === "worst_month" ? "text-negative" : v! < 0 ? "text-negative" : "text-text-primary") : "text-text-muted"
            )}
          >
            {display}
          </span>
        </div>
      );
    });
  }

  return (
    <div className="grid grid-cols-2 gap-x-6">
      <div>{renderGroup(left)}</div>
      <div>{renderGroup(right)}</div>
    </div>
  );
}

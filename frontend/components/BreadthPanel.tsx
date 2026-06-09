import type { BreadthData } from "@/lib/api";

interface Props {
  data: BreadthData;
}

function GaugeBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  const color = pct >= 60 ? "#22c55e" : pct >= 40 ? "#eab308" : "#ef4444";

  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-text-muted">{label}</span>
        <span style={{ color }} className="font-semibold">
          {pct}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-2">
        <div
          className="h-1.5 rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export function BreadthPanel({ data }: Props) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="text-xs text-text-muted uppercase tracking-wider mb-4">
        Market Breadth <span className="text-text-muted/60">— S&P 500</span>
      </div>
      <div className="space-y-4">
        <GaugeBar value={data.above_50ma_pct} label="Above 50-day MA" />
        <GaugeBar value={data.above_200ma_pct} label="Above 200-day MA" />
      </div>
      <div className="mt-4 pt-3 border-t border-border text-xs text-text-muted">
        Universe: {data.sp500_count} stocks
      </div>
    </div>
  );
}

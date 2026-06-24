"use client";
import type { SectorReturn } from "@/lib/api";
import { formatPct } from "@/lib/utils";

interface Props {
  sectors: SectorReturn[];
  period?: "change_1d" | "change_1w" | "change_1m" | "change_3m" | "change_ytd";
}

function heatColor(value: number): string {
  const clamped = Math.max(-0.05, Math.min(0.05, value));
  if (clamped >= 0) {
    const intensity = Math.round((clamped / 0.05) * 180);
    return `rgb(${34 - Math.round(intensity * 0.1)}, ${Math.round(197 + intensity * 0.08)}, ${Math.round(94 - intensity * 0.2)})`;
  } else {
    const intensity = Math.abs(clamped) / 0.05;
    const r = Math.round(180 + intensity * 75);
    return `rgb(${r}, ${Math.round(68 - intensity * 30)}, ${Math.round(68 - intensity * 30)})`;
  }
}

const PERIOD_LABELS: Record<string, string> = {
  change_1d: "1D",
  change_1w: "1W",
  change_1m: "1M",
  change_3m: "3M",
  change_ytd: "YTD",
};

export function SectorHeatmap({ sectors, period = "change_1d" }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-text-muted uppercase tracking-wider">
          Sector Performance
        </span>
        <span className="text-xs text-text-muted">{PERIOD_LABELS[period]}</span>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 xl:grid-cols-11">
        {sectors.map((s) => {
          const val = s[period as keyof SectorReturn] as number;
          const bg = heatColor(val);
          return (
            <div
              key={s.ticker}
              className="rounded p-2 flex flex-col items-center gap-1 cursor-default"
              style={{ backgroundColor: bg + "22", border: `1px solid ${bg}44` }}
              title={s.sector}
            >
              <a
                href={`https://www.tradingview.com/chart/?symbol=${s.ticker}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-text-muted font-medium hover:text-accent transition-colors cursor-pointer"
                onClick={e => e.stopPropagation()}
              >
                {s.ticker}
              </a>
              <span className="text-xs font-semibold" style={{ color: bg }}>
                {formatPct(val)}
              </span>
              <span className="text-[9px] text-text-muted text-center leading-tight">
                {s.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

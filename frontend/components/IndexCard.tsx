import type { IndexCard as IndexCardData } from "@/lib/api";
import { cn, formatPct, formatPrice } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

interface Props {
  data: IndexCardData;
  onClick?: () => void;
  active?: boolean;
}

export function IndexCard({ data, onClick, active }: Props) {
  const up = data.change_1d >= 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg p-4 border transition-colors",
        active
          ? "bg-surface-2 border-accent"
          : "bg-surface border-border hover:border-accent/40"
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-text-muted mb-1">{data.name}</div>
          <div className="text-lg font-semibold tracking-tight">
            {formatPrice(data.price)}
          </div>
        </div>
        <div className={cn("flex items-center gap-1 text-sm font-medium mt-1", up ? "text-positive" : "text-negative")}>
          {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {formatPct(data.change_1d)}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        {[
          { label: "WTD", val: data.change_wtd },
          { label: "MTD", val: data.change_mtd },
          { label: "YTD", val: data.change_ytd },
        ].map(({ label, val }) => (
          <div key={label}>
            <div className="text-text-muted mb-0.5">{label}</div>
            <div className={val >= 0 ? "text-positive" : "text-negative"}>
              {formatPct(val)}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-1 text-[10px] text-text-muted font-mono">{data.ticker}</div>
    </button>
  );
}

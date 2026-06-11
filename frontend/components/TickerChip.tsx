"use client";
import { useChart } from "@/contexts/ChartContext";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  ticker: string;
  /** Show a small arrow-link to the full stock detail page. Default true. */
  showDetail?: boolean;
  className?: string;
}

export function TickerChip({ ticker, showDetail = true, className }: Props) {
  const { openChart } = useChart();

  return (
    <span className="inline-flex items-center gap-1 group">
      <button
        onClick={() => openChart(ticker)}
        className={cn(
          "font-mono font-semibold hover:text-accent transition-colors cursor-pointer",
          className
        )}
      >
        {ticker}
      </button>
      {showDetail && (
        <Link
          href={`/stock/${ticker}`}
          title={`Full detail — ${ticker}`}
          className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-text-muted transition-opacity"
          onClick={e => e.stopPropagation()}
        >
          <ExternalLink size={9} strokeWidth={1.5} />
        </Link>
      )}
    </span>
  );
}

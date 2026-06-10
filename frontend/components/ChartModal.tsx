"use client";
import { useEffect, useRef } from "react";
import { X, ExternalLink } from "lucide-react";
import { TradingViewWidget } from "@/components/charts/TradingViewWidget";
import Link from "next/link";

interface Props {
  ticker: string;
  onClose: () => void;
}

export function ChartModal({ ticker, onClose }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="relative w-full max-w-4xl mx-4 rounded-xl border border-border bg-surface shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="font-mono font-semibold text-sm">{ticker}</span>
          <div className="flex items-center gap-2">
            <Link
              href={`/stock/${ticker}`}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors"
            >
              <ExternalLink size={12} />
              Full detail
            </Link>
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text-primary transition-colors p-1"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        {/* Chart */}
        <div className="p-0">
          <TradingViewWidget symbol={ticker} height={480} hideSideToolbar={false} />
        </div>
      </div>
    </div>
  );
}

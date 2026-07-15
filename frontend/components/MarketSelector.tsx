"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { useMarket, MARKETS, type MarketKey, type MarketOption } from "@/contexts/MarketContext";
import { cn } from "@/lib/utils";

export function MarketSelector() {
  const { market, setMarket, marketOption } = useMarket();
  const [open, setOpen]   = useState(false);
  const ref               = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const usMarkets    = MARKETS.filter(m => m.region === "us");
  const indiaMarkets = MARKETS.filter(m => m.region === "india");

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "flex items-center gap-1.5 w-full px-2 py-1.5 rounded border transition-all text-left",
          open
            ? "border-accent/50 bg-accent/5"
            : "border-border bg-surface-2 hover:border-border-2",
        )}
      >
        <span className="text-[13px] leading-none">{marketOption.flag}</span>
        <span className="text-[10px] text-text-primary font-medium flex-1 font-sans leading-none">
          {marketOption.label}
        </span>
        <ChevronDown
          size={9}
          className={cn("text-text-faint transition-transform duration-150", open && "rotate-180")}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-[60] bg-surface border border-border rounded shadow-2xl overflow-hidden">

          {/* US markets */}
          <GroupLabel label="United States" />
          {usMarkets.map(m => (
            <MarketRow
              key={m.key}
              option={m}
              active={market === m.key}
              onSelect={() => { setMarket(m.key as MarketKey); setOpen(false); }}
            />
          ))}

          {/* India markets */}
          <div className="border-t border-border/50 mt-0.5" />
          <GroupLabel label="India" />
          {indiaMarkets.map(m => (
            <MarketRow
              key={m.key}
              option={m}
              active={market === m.key}
              onSelect={() => { setMarket(m.key as MarketKey); setOpen(false); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GroupLabel({ label }: { label: string }) {
  return (
    <div className="px-2.5 pt-1.5 pb-0.5 text-[8px] text-text-faint uppercase tracking-[0.15em] font-sans font-semibold">
      {label}
    </div>
  );
}

function MarketRow({
  option,
  active,
  onSelect,
}: {
  option:   MarketOption;
  active:   boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      disabled={option.disabled}
      className={cn(
        "flex items-center gap-2 w-full px-2.5 py-1.5 text-left transition-colors",
        active       ? "bg-accent/10"         : "hover:bg-surface-2",
        option.disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
      )}
    >
      <span className="text-[12px] leading-none shrink-0">{option.flag}</span>
      <div className="flex-1 min-w-0">
        <div className={cn(
          "text-[10px] font-sans leading-tight",
          active ? "text-accent font-semibold" : "text-text-primary",
        )}>
          {option.label}
        </div>
        <div className="text-[8px] text-text-faint leading-tight mt-0.5 font-sans truncate">
          {option.description}
        </div>
      </div>
      {active && <Check size={9} className="text-accent shrink-0" />}
    </button>
  );
}

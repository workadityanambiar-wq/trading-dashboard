"use client";
import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface Tab {
  value: string;
  label: string;
}

interface MobileTabBarProps {
  tabs: Tab[];
  active: string;
  onChange: (value: string) => void;
  accentColor?: string;
}

export function MobileTabBar({ tabs, active, onChange, accentColor = "#6366f1" }: MobileTabBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const el = activeRef.current;
      const scrollLeft = el.offsetLeft - container.offsetWidth / 2 + el.offsetWidth / 2;
      container.scrollTo({ left: scrollLeft, behavior: "smooth" });
    }
  }, [active]);

  return (
    <div
      ref={scrollRef}
      className="flex gap-2 overflow-x-auto px-4 py-2 -mx-4"
      style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" as any }}
    >
      <style>{`.mobile-tab-scroll::-webkit-scrollbar{display:none}`}</style>
      {tabs.map((tab) => {
        const isActive = tab.value === active;
        return (
          <button
            key={tab.value}
            ref={isActive ? activeRef : undefined}
            onClick={() => onChange(tab.value)}
            className={cn(
              "shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all whitespace-nowrap border",
              isActive
                ? "text-white border-transparent"
                : "text-[#6b6b80] border-[#2a2a38] bg-[#111118]"
            )}
            style={isActive ? { backgroundColor: accentColor, borderColor: accentColor } : {}}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

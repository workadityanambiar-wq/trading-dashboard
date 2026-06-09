"use client";
import { type ThemeGroup } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Props {
  themes: ThemeGroup[];
  selectedTheme: string;
  selectedSegment: string;
  onSelectTheme: (id: string) => void;
  onSelectSegment: (id: string) => void;
}

export function ThemeSelector({
  themes,
  selectedTheme,
  selectedSegment,
  onSelectTheme,
  onSelectSegment,
}: Props) {
  const group = themes.find((g) => g.id === selectedTheme);
  return (
    <div className="space-y-2">
      {/* Theme group row */}
      <div className="flex flex-wrap gap-1.5">
        {themes.map((g) => (
          <button
            key={g.id}
            onClick={() => { onSelectTheme(g.id); onSelectSegment(""); }}
            className={cn(
              "px-2.5 py-1 rounded text-xs transition-colors border",
              selectedTheme === g.id
                ? "text-white border-transparent"
                : "bg-surface border-border text-text-muted hover:text-text-primary"
            )}
            style={
              selectedTheme === g.id
                ? { backgroundColor: g.color, borderColor: g.color }
                : undefined
            }
          >
            {g.name}
          </button>
        ))}
      </div>

      {/* Segment row */}
      {group && (
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => onSelectSegment("")}
            className={cn(
              "px-2 py-0.5 rounded text-xs border transition-colors",
              selectedSegment === ""
                ? "text-white border-transparent"
                : "bg-surface border-border text-text-muted hover:text-text-primary"
            )}
            style={selectedSegment === "" ? { backgroundColor: group.color + "cc" } : undefined}
          >
            All {group.name}
          </button>
          {group.segments.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelectSegment(s.id)}
              className={cn(
                "px-2 py-0.5 rounded text-xs border transition-colors",
                selectedSegment === s.id
                  ? "text-white border-transparent"
                  : "bg-surface border-border text-text-muted hover:text-text-primary"
              )}
              style={
                selectedSegment === s.id
                  ? { backgroundColor: group.color + "99" }
                  : undefined
              }
            >
              {s.name}
              <span className="text-[9px] opacity-60 ml-1">({s.ticker_count})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

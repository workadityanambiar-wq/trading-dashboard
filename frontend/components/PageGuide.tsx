"use client";
import { useState } from "react";
import { ChevronDown, BookOpen, Cpu, Lightbulb, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface GuideStep {
  title: string;
  detail: string;
}

export interface GuideSection {
  title: string;
  detail: string;
}

export interface PageGuideProps {
  title: string;
  subtitle: string;
  steps: GuideStep[];
  howItWorks: GuideSection[];
  tips?: string[];
}

export function PageGuide({ title, subtitle, steps, howItWorks, tips }: PageGuideProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab]   = useState<"use" | "works">("use");

  return (
    <div className="mx-4 mb-5 rounded-2xl border border-border overflow-hidden" style={{ background: "var(--surface, #111827)" }}>

      {/* ── Always-visible header ──────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2"
      >
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)" }}>
          <BookOpen size={14} style={{ color: "#6366f1" }} />
        </div>

        <div className="flex-1 text-left min-w-0">
          <div className="text-[12px] font-semibold text-text-primary leading-tight">{title}</div>
          <div className="text-[10px] text-text-muted leading-tight mt-0.5 truncate">{subtitle}</div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[9px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full"
            style={{ background: "rgba(99,102,241,0.12)", color: "#6366f1" }}>
            Guide
          </span>
          <ChevronDown
            size={14}
            className="text-text-muted transition-transform duration-200"
            style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          />
        </div>
      </button>

      {/* ── Expandable content ─────────────────────────────────────────────────── */}
      {open && (
        <div className="border-t border-border">

          {/* Tab bar */}
          <div className="flex border-b border-border">
            {(["use", "works"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex-1 py-2.5 text-[11px] font-semibold tracking-wide transition-colors relative",
                  tab === t ? "text-accent" : "text-text-muted hover:text-text-primary"
                )}
              >
                {t === "use" ? "How to Use" : "How it Works"}
                {tab === t && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent rounded-full" />
                )}
              </button>
            ))}
          </div>

          {/* ── How to Use ─────────────────────────────────────────────────────── */}
          {tab === "use" && (
            <div className="p-4 space-y-4">
              {steps.map((s, i) => (
                <div key={i} className="flex gap-3">
                  <div
                    className="w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: "rgba(99,102,241,0.15)", color: "#6366f1", border: "1px solid rgba(99,102,241,0.3)" }}
                  >
                    {i + 1}
                  </div>
                  <div>
                    <div className="text-[12px] font-semibold text-text-primary">{s.title}</div>
                    <div className="text-[11px] text-text-muted mt-0.5 leading-relaxed">{s.detail}</div>
                  </div>
                </div>
              ))}

              {tips && tips.length > 0 && (
                <div className="mt-1 p-3.5 rounded-xl space-y-2"
                  style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.18)" }}>
                  <div className="flex items-center gap-1.5">
                    <Lightbulb size={11} style={{ color: "#6366f1" }} />
                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#6366f1" }}>Pro Tips</span>
                  </div>
                  <ul className="space-y-1.5">
                    {tips.map((tip, i) => (
                      <li key={i} className="text-[11px] text-text-muted flex gap-2 leading-relaxed">
                        <CheckCircle size={11} className="flex-shrink-0 mt-0.5" style={{ color: "#6366f1" }} />
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ── How it Works ───────────────────────────────────────────────────── */}
          {tab === "works" && (
            <div className="p-4 space-y-4">
              {howItWorks.map((w, i) => (
                <div key={i} className="flex gap-3">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}
                  >
                    <Cpu size={10} style={{ color: "#6366f1" }} />
                  </div>
                  <div>
                    <div className="text-[12px] font-semibold text-text-primary">{w.title}</div>
                    <div className="text-[11px] text-text-muted mt-0.5 leading-relaxed">{w.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      )}
    </div>
  );
}

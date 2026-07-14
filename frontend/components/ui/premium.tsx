"use client";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, AlertTriangle, ChevronRight, Info } from "lucide-react";
import { useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type Sentiment = "bullish" | "bearish" | "neutral" | "warning";

const SENTIMENT_STYLES: Record<Sentiment, { border: string; bg: string; text: string }> = {
  bullish: { border: "border-positive/20", bg: "bg-positive/5",  text: "text-positive" },
  bearish: { border: "border-negative/20", bg: "bg-negative/5",  text: "text-negative" },
  neutral: { border: "border-accent/20",   bg: "bg-accent/5",    text: "text-accent"   },
  warning: { border: "border-warning/20",  bg: "bg-warning/5",   text: "text-warning"  },
};

// ── GlassCard — institutional clean panel ─────────────────────────────────────

export function GlassCard({
  children,
  className,
  glow,
  hover = true,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: "green" | "red" | "accent" | "amber" | "purple";
  hover?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={cn(
        "bg-surface border border-border rounded",
        hover && "transition-colors duration-100 hover:border-border-2",
        onClick && "cursor-pointer",
        className,
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

// ── MetricKPI — institutional data card ───────────────────────────────────────

export function MetricKPI({
  label,
  value,
  change,
  sub,
  color,
  bar,
  size = "md",
  className,
}: {
  label: string;
  value: string;
  change?: number;
  sub?: string;
  color?: string;
  bar?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const isPos = change != null && change > 0;
  const isNeg = change != null && change < 0;

  const valueSize = size === "lg" ? "text-[22px]" : size === "sm" ? "text-[14px]" : "text-[18px]";

  return (
    <div className={cn("p-3", className)}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-text-muted mb-1.5 font-sans">
        {label}
      </div>
      <div
        className={cn("font-mono font-semibold tabular-nums leading-none mb-1", valueSize)}
        style={color ? { color } : undefined}
      >
        {value}
      </div>
      {change != null && (
        <div className={cn("flex items-center gap-1 text-[11px] font-mono font-medium",
          isPos ? "text-positive" : isNeg ? "text-negative" : "text-text-muted"
        )}>
          {isPos ? <TrendingUp size={10} /> : isNeg ? <TrendingDown size={10} /> : <Minus size={10} />}
          {isPos ? "+" : ""}{change.toFixed(2)}%
        </div>
      )}
      {sub && <div className="text-[10px] text-text-faint mt-0.5 font-sans">{sub}</div>}
      {bar != null && (
        <div className="mt-1.5 h-0.5 bg-surface-2 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(0, bar))}%`, backgroundColor: color ?? "rgb(var(--accent))" }}
          />
        </div>
      )}
    </div>
  );
}

// ── TrendBadge ────────────────────────────────────────────────────────────────

export function TrendBadge({
  value,
  label,
  sentiment,
}: {
  value?: string;
  label?: string;
  sentiment?: Sentiment;
}) {
  const s = SENTIMENT_STYLES[sentiment ?? "neutral"];
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border font-sans",
      s.border, s.bg, s.text,
    )}>
      {value}{label && <span className="opacity-70 font-normal">{label}</span>}
    </span>
  );
}

// ── AIInsightBanner — intelligence card ───────────────────────────────────────

export function AIInsightBanner({
  insight,
  bullCase,
  bearCase,
  risk,
  confidence,
  sentiment = "neutral",
  className,
}: {
  insight: string;
  bullCase?: string;
  bearCase?: string;
  risk?: string;
  confidence?: number;
  sentiment?: Sentiment;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const accentColor =
    sentiment === "bullish" ? "#16a34a"
    : sentiment === "bearish" ? "#dc2626"
    : sentiment === "warning" ? "#ca8a04"
    : "#3b82f6";

  return (
    <div
      className={cn("relative bg-surface border border-border rounded overflow-hidden", className)}
      style={{ borderLeftColor: accentColor, borderLeftWidth: 2 }}
    >
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 flex-1 min-w-0">
            <div className="w-1 h-1 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: accentColor }} />
            <p className="text-[12px] leading-relaxed text-text-primary font-sans insight-text">{insight}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {confidence != null && (
              <span className="text-[10px] text-text-muted font-mono border border-border rounded px-1.5 py-0.5">
                {Math.round(confidence * 100)}%
              </span>
            )}
            {(bullCase || bearCase || risk) && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-text-muted hover:text-text-primary transition-colors"
              >
                <ChevronRight size={13} className={cn("transition-transform duration-150", expanded && "rotate-90")} />
              </button>
            )}
          </div>
        </div>

        {expanded && (bullCase || bearCase || risk) && (
          <div className="mt-3 pt-3 border-t border-border grid grid-cols-3 gap-4">
            {bullCase && (
              <div>
                <div className="text-[9px] text-positive font-semibold uppercase tracking-widest mb-1">Bull</div>
                <div className="text-[11px] text-text-muted leading-snug font-sans">{bullCase}</div>
              </div>
            )}
            {bearCase && (
              <div>
                <div className="text-[9px] text-negative font-semibold uppercase tracking-widest mb-1">Bear</div>
                <div className="text-[11px] text-text-muted leading-snug font-sans">{bearCase}</div>
              </div>
            )}
            {risk && (
              <div>
                <div className="text-[9px] text-warning font-semibold uppercase tracking-widest mb-1">Risk</div>
                <div className="text-[11px] text-text-muted leading-snug font-sans">{risk}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── SectionHeader ─────────────────────────────────────────────────────────────

export function SectionHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between", className)}>
      <div>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted font-sans">{title}</h2>
        {subtitle && <p className="text-[11px] text-text-faint mt-0.5 font-sans">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ── StatRow ───────────────────────────────────────────────────────────────────

export function StatRow({
  label,
  value,
  valueColor,
  sub,
  divider = true,
}: {
  label: string;
  value: string;
  valueColor?: string;
  sub?: string;
  divider?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between py-2", divider && "border-b border-surface-2 last:border-0")}>
      <div>
        <span className="text-[11px] text-text-muted font-sans">{label}</span>
        {sub && <div className="text-[10px] text-text-faint font-sans">{sub}</div>}
      </div>
      <span className="text-[12px] font-semibold font-mono tabular-nums" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </span>
    </div>
  );
}

// ── PulsingDot ────────────────────────────────────────────────────────────────

export function PulsingDot({ color = "#16a34a", size = 7 }: { color?: string; size?: number }) {
  return (
    <span className="relative inline-flex">
      <span
        className="animate-ping absolute inline-flex rounded-full opacity-50"
        style={{ width: size, height: size, backgroundColor: color }}
      />
      <span
        className="relative inline-flex rounded-full live-dot"
        style={{ width: size, height: size, backgroundColor: color }}
      />
    </span>
  );
}

// ── SkeletonCard ──────────────────────────────────────────────────────────────

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("bg-surface border border-border rounded p-3 space-y-2", className)}>
      <div className="h-2 skeleton rounded w-16" />
      <div className="h-5 skeleton rounded w-24" />
      <div className="h-1.5 skeleton rounded w-full" />
    </div>
  );
}

export function SkeletonLine({ className }: { className?: string }) {
  return <div className={cn("h-2.5 skeleton rounded", className)} />;
}

// ── RegimeBadge ───────────────────────────────────────────────────────────────

const REGIME_COLORS: Record<string, string> = {
  "Strong Bull": "#16a34a",
  "Bull":        "#22c55e",
  "Early Bull":  "#4ade80",
  "Sideways":    "#ca8a04",
  "Early Bear":  "#f97316",
  "Bear":        "#dc2626",
  "Crisis":      "#b91c1c",
  "Risk-On":     "#16a34a",
  "Risk-Off":    "#dc2626",
  "Neutral":     "#3b82f6",
};

export function RegimeBadge({ label }: { label: string }) {
  const key   = Object.keys(REGIME_COLORS).find(k => label.toLowerCase().includes(k.toLowerCase()));
  const color = key ? REGIME_COLORS[key] : "#3b82f6";
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded border font-sans"
      style={{ color, borderColor: `${color}30`, backgroundColor: `${color}10` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

// ── ProgressRing ──────────────────────────────────────────────────────────────

export function ProgressRing({
  score,
  color,
  size = 80,
  strokeWidth = 5,
  label,
}: {
  score: number;
  color: string;
  size?: number;
  strokeWidth?: number;
  label?: string;
}) {
  const r    = (size / 2) - strokeWidth;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, score)) / 100) * circ;
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="rotate-[-90deg]">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={strokeWidth} />
        <circle
          cx={size/2} cy={size/2} r={r}
          fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s cubic-bezier(0.4,0,0.2,1)" }}
        />
      </svg>
      {label && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[12px] font-bold font-mono tabular-nums" style={{ color }}>{label}</span>
        </div>
      )}
    </div>
  );
}

// ── ScoreBadge ────────────────────────────────────────────────────────────────

export function ScoreBadge({ score, maxScore = 100 }: { score: number; maxScore?: number }) {
  const pct   = score / maxScore;
  const color = pct >= 0.7 ? "#16a34a" : pct >= 0.5 ? "#ca8a04" : pct >= 0.3 ? "#f97316" : "#dc2626";
  const label = pct >= 0.7 ? "Strong" : pct >= 0.5 ? "Moderate" : pct >= 0.3 ? "Weak" : "Poor";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[20px] font-bold font-mono tabular-nums" style={{ color }}>{Math.round(score)}</span>
      <div>
        <div className="text-[9px] font-semibold uppercase tracking-wider" style={{ color }}>{label}</div>
        <div className="text-[9px] text-text-faint">/ {maxScore}</div>
      </div>
    </div>
  );
}

// ── QuickLinkCard ─────────────────────────────────────────────────────────────

export function QuickLinkCard({
  icon: Icon,
  label,
  color,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  color: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 p-2.5 rounded border border-border bg-surface hover:bg-surface-2 hover:border-border-2 transition-all duration-100 w-full"
    >
      <div
        className="w-7 h-7 rounded flex items-center justify-center"
        style={{ backgroundColor: `${color}12`, border: `1px solid ${color}20` }}
      >
        <Icon size={13} style={{ color }} />
      </div>
      <span className="text-[10px] text-text-muted text-center leading-tight font-sans">{label}</span>
    </button>
  );
}

// ── TooltipInfo ───────────────────────────────────────────────────────────────

export function TooltipInfo({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="text-text-faint hover:text-text-muted transition-colors"
      >
        <Info size={11} />
      </button>
      {show && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-50 w-44 text-[10px] text-text-primary bg-surface-2 border border-border rounded px-2.5 py-2 shadow-card leading-snug pointer-events-none font-sans">
          {text}
        </span>
      )}
    </span>
  );
}

// ── AlertBanner ───────────────────────────────────────────────────────────────

export function AlertBanner({ message, type = "warning" }: { message: string; type?: "warning" | "danger" | "info" }) {
  const styles = {
    warning: "border-warning/25 bg-warning/5  text-warning",
    danger:  "border-negative/25 bg-negative/5 text-negative",
    info:    "border-accent/25   bg-accent/5   text-accent",
  };
  return (
    <div className={cn("flex items-center gap-2 rounded border p-2.5", styles[type])}>
      <AlertTriangle size={12} className="shrink-0" />
      <span className="text-[11px] font-medium font-sans">{message}</span>
    </div>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────

export function Divider({ className }: { className?: string }) {
  return <div className={cn("gradient-line my-3", className)} />;
}

// ── NumberTicker ──────────────────────────────────────────────────────────────

export function NumberTicker({ value, prefix = "", suffix = "", decimals = 1, color }: {
  value: number | null | undefined;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  color?: string;
}) {
  if (value == null) return <span className="text-text-muted font-mono">—</span>;
  const isPos = value > 0;
  const col = color ?? (isPos ? "#16a34a" : value < 0 ? "#dc2626" : "rgb(var(--text-primary))");
  return (
    <span className="font-mono tabular-nums font-semibold num-anim" style={{ color: col }}>
      {prefix}{isPos && !prefix.includes("+") ? "+" : ""}{value.toFixed(decimals)}{suffix}
    </span>
  );
}

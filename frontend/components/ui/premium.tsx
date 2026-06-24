"use client";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, Sparkles, AlertTriangle, ChevronRight, Info } from "lucide-react";
import { useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type Sentiment = "bullish" | "bearish" | "neutral" | "warning";

const SENTIMENT_STYLES: Record<Sentiment, { border: string; bg: string; text: string; icon: string }> = {
  bullish: { border: "border-positive/25", bg: "bg-positive/6",  text: "text-positive", icon: "text-positive" },
  bearish: { border: "border-negative/25", bg: "bg-negative/6",  text: "text-negative", icon: "text-negative" },
  neutral: { border: "border-accent/20",   bg: "bg-accent/5",    text: "text-accent",   icon: "text-accent"   },
  warning: { border: "border-warning/25",  bg: "bg-warning/6",   text: "text-warning",  icon: "text-warning"  },
};

// ── GlassCard ─────────────────────────────────────────────────────────────────

export function GlassCard({
  children,
  className,
  glow,
  hover = true,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: "green" | "red" | "accent" | "amber" | "purple";
  hover?: boolean;
}) {
  const glowClass = glow ? `glow-${glow}` : "";
  return (
    <div className={cn(
      "premium-card relative overflow-hidden",
      hover && "cursor-default transition-all duration-200 hover:translate-y-[-1px]",
      glowClass,
      className,
    )}>
      {/* Top highlight line */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />
      {children}
    </div>
  );
}

// ── MetricKPI ─────────────────────────────────────────────────────────────────

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
  value: string | React.ReactNode;
  change?: number | null;
  sub?: string;
  color?: string;
  bar?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const valueSize = { sm: "text-lg", md: "text-2xl", lg: "text-4xl" }[size];
  const isPos = (change ?? 0) > 0;
  const isNeg = (change ?? 0) < 0;

  return (
    <GlassCard className={cn("p-4 space-y-2", className)}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">{label}</div>
      <div className={cn("font-bold tabular-nums num-anim leading-none", valueSize)} style={color ? { color } : undefined}>
        {value}
      </div>
      {change != null && (
        <div className={cn("flex items-center gap-1 text-[11px] font-semibold", isPos ? "text-positive" : isNeg ? "text-negative" : "text-text-muted")}>
          {isPos ? <TrendingUp size={10} /> : isNeg ? <TrendingDown size={10} /> : <Minus size={10} />}
          {isPos ? "+" : ""}{(change * 100).toFixed(1)}%
        </div>
      )}
      {bar != null && (
        <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.min(100, Math.max(0, bar * 100))}%`, backgroundColor: color ?? (bar > 0.5 ? "#22c55e" : "#ef4444") }}
          />
        </div>
      )}
      {sub && <div className="text-[10px] text-text-muted leading-tight">{sub}</div>}
    </GlassCard>
  );
}

// ── TrendBadge ────────────────────────────────────────────────────────────────

export function TrendBadge({
  value,
  label,
  sentiment,
}: {
  value: string;
  label?: string;
  sentiment: Sentiment;
}) {
  const s = SENTIMENT_STYLES[sentiment];
  const Icon = sentiment === "bullish" ? TrendingUp : sentiment === "bearish" ? TrendingDown : Minus;
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border", s.border, s.bg, s.text)}>
      <Icon size={10} />
      {value}{label && <span className="opacity-70 font-normal">{label}</span>}
    </span>
  );
}

// ── AIInsightBanner ───────────────────────────────────────────────────────────

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
  const sentColor = sentiment === "bullish" ? "#22c55e" : sentiment === "bearish" ? "#ef4444" : sentiment === "warning" ? "#f59e0b" : "#6366f1";

  return (
    <div className={cn("relative rounded-xl overflow-hidden insight-gradient p-4", className)}>
      {/* Left accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-xl" style={{ backgroundColor: sentColor }} />

      <div className="pl-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 flex-1 min-w-0">
            <Sparkles size={14} className="shrink-0 mt-0.5" style={{ color: sentColor }} />
            <p className="text-[13px] leading-relaxed text-text-primary font-medium insight-text">{insight}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {confidence != null && (
              <span className="text-[10px] text-text-muted font-mono border border-border rounded px-1.5 py-0.5">
                {Math.round(confidence * 100)}% conf
              </span>
            )}
            {(bullCase || bearCase || risk) && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-text-muted hover:text-text-primary transition-colors"
              >
                <ChevronRight size={14} className={cn("transition-transform duration-200", expanded && "rotate-90")} />
              </button>
            )}
          </div>
        </div>

        {expanded && (bullCase || bearCase || risk) && (
          <div className="mt-3 pt-3 border-t border-white/8 grid grid-cols-3 gap-4 slide-up">
            {bullCase && (
              <div>
                <div className="text-[9px] text-positive font-semibold uppercase tracking-widest mb-1">Bull Case</div>
                <div className="text-[11px] text-text-muted leading-snug">{bullCase}</div>
              </div>
            )}
            {bearCase && (
              <div>
                <div className="text-[9px] text-negative font-semibold uppercase tracking-widest mb-1">Bear Case</div>
                <div className="text-[11px] text-text-muted leading-snug">{bearCase}</div>
              </div>
            )}
            {risk && (
              <div>
                <div className="text-[9px] text-warning font-semibold uppercase tracking-widest mb-1">Key Risk</div>
                <div className="text-[11px] text-text-muted leading-snug">{risk}</div>
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
    <div className={cn("flex items-end justify-between mb-3", className)}>
      <div>
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">{title}</h2>
        {subtitle && <p className="text-[10px] text-text-faint mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="text-[11px]">{action}</div>}
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
  value: React.ReactNode;
  valueColor?: string;
  sub?: string;
  divider?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between py-2.5", divider && "border-b border-surface-2 last:border-0")}>
      <div>
        <span className="text-[12px] text-text-muted">{label}</span>
        {sub && <div className="text-[10px] text-text-faint">{sub}</div>}
      </div>
      <span className="text-[13px] font-semibold tabular-nums" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </span>
    </div>
  );
}

// ── PulsingDot ────────────────────────────────────────────────────────────────

export function PulsingDot({ color = "#22c55e", size = 8 }: { color?: string; size?: number }) {
  return (
    <span className="relative inline-flex">
      <span
        className="animate-ping absolute inline-flex rounded-full opacity-75"
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
    <div className={cn("premium-card p-4 space-y-3", className)}>
      <div className="h-2.5 skeleton rounded w-20" />
      <div className="h-7 skeleton rounded w-28" />
      <div className="h-1.5 skeleton rounded w-full" />
    </div>
  );
}

export function SkeletonLine({ className }: { className?: string }) {
  return <div className={cn("h-3 skeleton rounded", className)} />;
}

// ── RegimeBadge ───────────────────────────────────────────────────────────────

const REGIME_PRESETS: Record<string, { color: string; sentiment: Sentiment }> = {
  "Strong Bull": { color: "#22c55e", sentiment: "bullish" },
  "Bull":        { color: "#84cc16", sentiment: "bullish" },
  "Early Bull":  { color: "#a3e635", sentiment: "bullish" },
  "Sideways":    { color: "#eab308", sentiment: "neutral" },
  "Early Bear":  { color: "#f97316", sentiment: "bearish" },
  "Bear":        { color: "#ef4444", sentiment: "bearish" },
  "Crisis":      { color: "#dc2626", sentiment: "bearish" },
  "Risk-On":     { color: "#22c55e", sentiment: "bullish" },
  "Risk-Off":    { color: "#ef4444", sentiment: "bearish" },
  "Neutral":     { color: "#6366f1", sentiment: "neutral" },
};

export function RegimeBadge({ label }: { label: string }) {
  const preset = Object.entries(REGIME_PRESETS).find(([k]) => label.toLowerCase().includes(k.toLowerCase()));
  const { color, sentiment } = preset?.[1] ?? { color: "#6366f1", sentiment: "neutral" as Sentiment };
  const s = SENTIMENT_STYLES[sentiment];
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-bold border", s.border, s.bg)} style={{ color }}>
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
  strokeWidth = 6,
  label,
}: {
  score: number;
  color: string;
  size?: number;
  strokeWidth?: number;
  label?: string;
}) {
  const r = (size / 2) - strokeWidth;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, score)) / 100) * circ;
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="rotate-[-90deg]">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={strokeWidth} />
        <circle
          cx={size/2} cy={size/2} r={r}
          fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)", filter: `drop-shadow(0 0 6px ${color}60)` }}
        />
      </svg>
      {label && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs font-bold tabular-nums" style={{ color }}>{label}</span>
        </div>
      )}
    </div>
  );
}

// ── ScoreBadge ────────────────────────────────────────────────────────────────

export function ScoreBadge({ score, maxScore = 100 }: { score: number; maxScore?: number }) {
  const pct = score / maxScore;
  const color = pct >= 0.7 ? "#22c55e" : pct >= 0.5 ? "#eab308" : pct >= 0.3 ? "#f97316" : "#ef4444";
  const label = pct >= 0.7 ? "Strong" : pct >= 0.5 ? "Moderate" : pct >= 0.3 ? "Weak" : "Poor";
  return (
    <div className="flex items-center gap-2">
      <span className="text-2xl font-bold tabular-nums" style={{ color }}>{Math.round(score)}</span>
      <div>
        <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color }}>{label}</div>
        <div className="text-[9px] text-text-muted">/ {maxScore}</div>
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
      className="flex flex-col items-center gap-2 p-3.5 rounded-xl border border-border bg-surface hover:bg-surface-2 hover:border-border-2 transition-all duration-200 hover:translate-y-[-1px] hover:shadow-card w-full"
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: `${color}15`, border: `1px solid ${color}25` }}
      >
        <Icon size={16} style={{ color }} />
      </div>
      <span className="text-[10px] text-text-muted text-center leading-tight font-medium">{label}</span>
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
        <Info size={12} />
      </button>
      {show && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 w-48 text-[11px] text-text-primary bg-surface-3 border border-border rounded-lg p-2.5 shadow-premium leading-snug scale-in pointer-events-none">
          {text}
        </span>
      )}
    </span>
  );
}

// ── AlertBanner ───────────────────────────────────────────────────────────────

export function AlertBanner({ message, type = "warning" }: { message: string; type?: "warning" | "danger" | "info" }) {
  const styles = {
    warning: "border-warning/30 bg-warning/6 text-warning",
    danger:  "border-negative/30 bg-negative/6 text-negative",
    info:    "border-accent/30   bg-accent/6   text-accent",
  };
  return (
    <div className={cn("flex items-center gap-2.5 rounded-xl border p-3", styles[type])}>
      <AlertTriangle size={13} className="shrink-0" />
      <span className="text-[12px] font-medium">{message}</span>
    </div>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────

export function Divider({ className }: { className?: string }) {
  return <div className={cn("gradient-line my-4", className)} />;
}

// ── NumberTicker ──────────────────────────────────────────────────────────────

export function NumberTicker({ value, prefix = "", suffix = "", decimals = 1, color }: {
  value: number | null | undefined;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  color?: string;
}) {
  if (value == null) return <span className="text-text-muted">—</span>;
  const isPos = value > 0;
  const col = color ?? (isPos ? "#22c55e" : value < 0 ? "#ef4444" : "rgb(var(--text-primary))");
  return (
    <span className="tabular-nums num-anim font-semibold" style={{ color: col }}>
      {prefix}{isPos && !prefix.includes("+") ? "+" : ""}{value.toFixed(decimals)}{suffix}
    </span>
  );
}

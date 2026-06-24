"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, X, ArrowRight, Command } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sparkles, Star, LayoutDashboard, Zap, RotateCcw, Crosshair, AlignCenter,
  TrendingUp, CalendarDays, BarChart3, Gauge, Radar, Landmark, Users, Milestone,
  Gem, Cpu, Globe, Droplets, CircleDollarSign, Mountain, Building2, Swords,
  Coins, Waves, FlameKindling, DollarSign, Percent, Network, ScanSearch,
  Target, Activity, BellRing, FileDown, Wand2, FlaskConical, PieChart,
  ShieldAlert, Layers, GitCompare, SigmaSquare, MonitorDot,
} from "lucide-react";

const ALL_PAGES = [
  { href: "/copilot",          label: "AI Copilot",          icon: Sparkles,        category: "AI",       keywords: ["ai", "copilot", "chat", "assistant"] },
  { href: "/watchlist",        label: "Watchlist",           icon: Star,            category: "Portfolio", keywords: ["watch", "favorites", "list"] },
  { href: "/",                 label: "Overview",            icon: LayoutDashboard, category: "Core",     keywords: ["home", "overview", "dashboard"] },
  { href: "/setups",           label: "Setups",              icon: Zap,             category: "Trading",  keywords: ["setup", "trade", "entry"] },
  { href: "/rotation",         label: "Sector Rotation",    icon: RotateCcw,       category: "Markets",  keywords: ["rotation", "sector", "rrg"] },
  { href: "/prebreakout",      label: "Pre-Breakout",       icon: Crosshair,       category: "Trading",  keywords: ["breakout", "scan", "momentum"] },
  { href: "/mtf",              label: "Multi-Timeframe",    icon: AlignCenter,     category: "Charts",   keywords: ["mtf", "timeframe", "multi"] },
  { href: "/ipo",              label: "IPO Intel",          icon: TrendingUp,      category: "Markets",  keywords: ["ipo", "new issue", "listing"] },
  { href: "/earnings",         label: "Earnings",           icon: CalendarDays,    category: "Events",   keywords: ["earnings", "eps", "calendar"] },
  { href: "/rs",               label: "RS Rankings",        icon: BarChart3,       category: "Analysis", keywords: ["rs", "relative strength", "rank"] },
  { href: "/breadth",          label: "Breadth Intel",      icon: Gauge,           category: "Markets",  keywords: ["breadth", "mcclellan", "advance", "decline"] },
  { href: "/regime",           label: "Market Regime",      icon: Radar,           category: "Macro",    keywords: ["regime", "bull", "bear", "trend"] },
  { href: "/institutional",    label: "Inst. Flow",         icon: Landmark,        category: "Flows",    keywords: ["institutional", "flow", "13f"] },
  { href: "/inst-tracker",     label: "Inst. Tracker",      icon: Users,           category: "Flows",    keywords: ["tracker", "fund", "holdings"] },
  { href: "/crowding",         label: "Crowding",           icon: Users,           category: "Positioning", keywords: ["crowd", "positioning", "hedge fund"] },
  { href: "/earnings-drift",   label: "PEAD / Earnings Drift", icon: Milestone,   category: "Analysis", keywords: ["pead", "drift", "post-earnings"] },
  { href: "/quality",          label: "Quality Factor",     icon: Gem,             category: "Factors",  keywords: ["quality", "roe", "factor"] },
  { href: "/ai-capex",         label: "AI CapEx",           icon: Cpu,             category: "Themes",   keywords: ["ai", "capex", "spending", "hyperscaler"] },
  { href: "/macro",            label: "Macro",              icon: Globe,           category: "Macro",    keywords: ["macro", "economy", "gdp", "inflation"] },
  { href: "/country-macro",    label: "Country Macro",      icon: Globe,           category: "Macro",    keywords: ["country", "global", "international"] },
  { href: "/oil",              label: "Oil Tracker",        icon: Droplets,        category: "Commodities", keywords: ["oil", "crude", "energy", "wti"] },
  { href: "/dollar",           label: "Dollar Tracker",     icon: CircleDollarSign, category: "Macro",  keywords: ["dollar", "dxy", "fx", "currency"] },
  { href: "/treasury",         label: "Treasury Yields",    icon: Landmark,        category: "Macro",    keywords: ["treasury", "yield", "bond", "rates"] },
  { href: "/metals",           label: "Metals",             icon: Gem,             category: "Commodities", keywords: ["gold", "silver", "metals", "gld"] },
  { href: "/memory",           label: "Memory Intel",       icon: Cpu,             category: "Themes",   keywords: ["memory", "semiconductor", "hbm", "dram"] },
  { href: "/ai-compute",       label: "AI Compute",         icon: Cpu,             category: "Themes",   keywords: ["compute", "gpu", "nvidia", "data center"] },
  { href: "/quantum",          label: "Quantum Intel",      icon: Cpu,             category: "Themes",   keywords: ["quantum", "computing", "qubit"] },
  { href: "/rare-earths",      label: "Rare Earths",        icon: Mountain,        category: "Themes",   keywords: ["rare earth", "mineral", "china"] },
  { href: "/congressional",    label: "Congress Intel",     icon: Building2,       category: "Intel",    keywords: ["congress", "senate", "trading", "insider"] },
  { href: "/defense",          label: "Defense Intel",      icon: Swords,          category: "Themes",   keywords: ["defense", "military", "aerospace"] },
  { href: "/space",            label: "Space Intel",        icon: Mountain,        category: "Themes",   keywords: ["space", "satellite", "launch"] },
  { href: "/crypto",           label: "Crypto Intel",       icon: Coins,           category: "Crypto",   keywords: ["crypto", "bitcoin", "btc", "ethereum"] },
  { href: "/volatility",       label: "Volatility",         icon: Waves,           category: "Risk",     keywords: ["vix", "vol", "volatility", "fear"] },
  { href: "/alpha-engine",     label: "Alpha Engine",       icon: FlameKindling,   category: "Trading",  keywords: ["alpha", "signal", "edge"] },
  { href: "/smart-money",      label: "Smart Money Flow",   icon: DollarSign,      category: "Flows",    keywords: ["smart money", "flow", "dark pool"] },
  { href: "/options-analytics",label: "Options Analytics",  icon: Percent,         category: "Options",  keywords: ["options", "gamma", "delta", "flow"] },
  { href: "/correlations",     label: "Correlations",       icon: Network,         category: "Analysis", keywords: ["correlation", "matrix", "diversification"] },
  { href: "/screener",         label: "Screener",           icon: ScanSearch,      category: "Tools",    keywords: ["screen", "filter", "scan", "search stocks"] },
  { href: "/factors",          label: "Factor Research",    icon: TrendingUp,      category: "Factors",  keywords: ["factor", "value", "momentum", "quality"] },
  { href: "/expected-return",  label: "Expected Return",    icon: Target,          category: "Analysis", keywords: ["expected", "return", "model"] },
  { href: "/intraday",         label: "ST Signals",         icon: Activity,        category: "Trading",  keywords: ["intraday", "short term", "signal", "scalp"] },
  { href: "/alerts",           label: "Alerts",             icon: BellRing,        category: "Tools",    keywords: ["alert", "notification", "watch"] },
  { href: "/reports",          label: "Reports",            icon: FileDown,        category: "Tools",    keywords: ["report", "export", "pdf"] },
  { href: "/strategy-builder", label: "Strategy Builder",   icon: Wand2,           category: "Tools",    keywords: ["strategy", "build", "backtest"] },
  { href: "/backtest",         label: "Backtester",         icon: FlaskConical,    category: "Tools",    keywords: ["backtest", "historical", "test"] },
  { href: "/portfolio",        label: "Portfolio",          icon: PieChart,        category: "Portfolio", keywords: ["portfolio", "holdings", "allocation"] },
  { href: "/risk",             label: "Risk",               icon: ShieldAlert,     category: "Risk",     keywords: ["risk", "var", "drawdown"] },
  { href: "/risk-engine",      label: "Risk Engine",        icon: Layers,          category: "Risk",     keywords: ["risk engine", "model", "factor"] },
  { href: "/pairs",            label: "Pair Trading",       icon: GitCompare,      category: "Strategies", keywords: ["pairs", "stat arb", "spread"] },
  { href: "/risk-model",       label: "PCA Risk Model",     icon: SigmaSquare,     category: "Risk",     keywords: ["pca", "risk model", "factor"] },
  { href: "/mt5",              label: "MT5 Terminal",       icon: MonitorDot,      category: "Execution", keywords: ["mt5", "metatrader", "execute", "broker"] },
];

const CATEGORY_ORDER = ["Core", "AI", "Markets", "Macro", "Flows", "Trading", "Analysis", "Factors", "Themes", "Options", "Risk", "Portfolio", "Execution", "Tools", "Intel", "Commodities", "Crypto", "Charts", "Events", "Positioning", "Strategies"];

type Page = typeof ALL_PAGES[number];

function groupByCategory(pages: Page[]) {
  const groups: Record<string, Page[]> = {};
  for (const p of pages) {
    if (!groups[p.category]) groups[p.category] = [];
    groups[p.category].push(p);
  }
  return groups;
}

function score(page: Page, q: string): number {
  const lower = q.toLowerCase().trim();
  if (page.label.toLowerCase().startsWith(lower)) return 3;
  if (page.label.toLowerCase().includes(lower)) return 2;
  if (page.keywords.some(k => k.includes(lower))) return 1;
  return 0;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose(): void }) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const results = query.trim()
    ? ALL_PAGES.map(p => ({ ...p, _score: score(p, query) }))
        .filter(p => p._score > 0)
        .sort((a, b) => b._score - a._score)
        .slice(0, 8)
    : ALL_PAGES.slice(0, 8);

  const navigate = useCallback((href: string) => {
    router.push(href);
    onClose();
    setQuery("");
    setActiveIndex(0);
  }, [router, onClose]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, results.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
      if (e.key === "Enter" && results[activeIndex]) navigate(results[activeIndex].href);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, activeIndex, results, navigate, onClose]);

  if (!open) return null;

  return (
    <div className="cmd-backdrop" onClick={onClose}>
      <div
        className="fixed top-[15vh] left-1/2 -translate-x-1/2 w-full max-w-xl z-[101] scale-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="glass-heavy rounded-2xl overflow-hidden shadow-premium-lg border border-border-2">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
            <Search size={15} className="text-text-muted shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => { setQuery(e.target.value); setActiveIndex(0); }}
              placeholder="Search pages, features, tools…"
              className="flex-1 bg-transparent text-[14px] text-text-primary placeholder:text-text-muted outline-none"
            />
            {query && (
              <button onClick={() => setQuery("")} className="text-text-muted hover:text-text-primary">
                <X size={13} />
              </button>
            )}
            <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] text-text-muted border border-border rounded px-1.5 py-0.5">
              <Command size={9} /> K
            </kbd>
          </div>

          {/* Results */}
          <div className="py-2 max-h-[55vh] overflow-y-auto">
            {results.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-text-muted">No results for "{query}"</div>
            ) : (
              results.map((page, i) => {
                const Icon = page.icon;
                return (
                  <button
                    key={page.href}
                    onClick={() => navigate(page.href)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={cn(
                      "flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors",
                      i === activeIndex ? "bg-accent/15" : "hover:bg-surface-2"
                    )}
                  >
                    <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", i === activeIndex ? "bg-accent/20" : "bg-surface-2")}>
                      <Icon size={13} className={i === activeIndex ? "text-accent" : "text-text-muted"} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-text-primary font-medium truncate">{page.label}</div>
                      <div className="text-[10px] text-text-muted">{page.category}</div>
                    </div>
                    <ArrowRight size={12} className={cn("shrink-0 transition-opacity", i === activeIndex ? "text-accent opacity-100" : "opacity-0")} />
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-border flex items-center gap-4 text-[10px] text-text-muted">
            <span className="flex items-center gap-1"><kbd className="border border-border rounded px-1">↑↓</kbd> navigate</span>
            <span className="flex items-center gap-1"><kbd className="border border-border rounded px-1">↵</kbd> open</span>
            <span className="flex items-center gap-1"><kbd className="border border-border rounded px-1">esc</kbd> close</span>
            <span className="ml-auto opacity-50">{ALL_PAGES.length} pages</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Trigger hook ──────────────────────────────────────────────────────────────

export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(o => !o);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return { open, setOpen };
}

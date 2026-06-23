"use client";
import { useState, useEffect } from "react";
import {
  FileText, Table2, Download, Loader2, ChevronDown,
  BarChart3, TrendingUp, ShieldAlert, GitCompare,
  FlaskConical, Layers, Radar, Percent, Users, Sparkles,
  Settings2, PlusCircle, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageGuide } from "@/components/PageGuide";

const ICONS: Record<string, React.ReactNode> = {
  portfolio: <BarChart3 size={14} />,
  backtest:  <FlaskConical size={14} />,
  stock:     <TrendingUp size={14} />,
  risk:      <ShieldAlert size={14} />,
  pair:      <GitCompare size={14} />,
  momentum:  <Layers size={14} />,
  factor:    <Sparkles size={14} />,
  regime:    <Radar size={14} />,
  options:   <Percent size={14} />,
  custom:    <Users size={14} />,
};

interface Template {
  id: string;
  label: string;
  description: string;
}

type Format = "pdf" | "excel";
type Theme  = "light" | "dark";

const today = new Date().toISOString().slice(0, 10);
const oneYearAgo = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);

export default function ReportsPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState("portfolio");
  const [format, setFormat] = useState<Format>("pdf");
  const [theme, setTheme]   = useState<Theme>("light");
  const [tickerInput, setTickerInput] = useState("AAPL,MSFT,GOOGL,NVDA,AMZN");
  const [reportName, setReportName] = useState("Q4 2024 Portfolio Report");
  const [startDate, setStartDate]   = useState(oneYearAgo);
  const [endDate, setEndDate]       = useState(today);
  const [benchmark, setBenchmark]   = useState("SPY");
  const [portfolioValue, setPortfolioValue] = useState("1000000");
  const [weights, setWeights] = useState<{ ticker: string; weight: string }[]>([]);
  const [showWeights, setShowWeights] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/reports/templates`)
      .then(r => r.ok ? r.json() : [])
      .then(setTemplates)
      .catch(() => {});
  }, []);

  const tickers = tickerInput.split(",").map(t => t.trim().toUpperCase()).filter(Boolean);

  function addWeight() {
    setWeights(prev => [...prev, { ticker: "", weight: "" }]);
  }

  function removeWeight(i: number) {
    setWeights(prev => prev.filter((_, idx) => idx !== i));
  }

  async function handleGenerate() {
    if (!tickers.length) {
      setError("Please enter at least one ticker.");
      return;
    }
    setError("");
    setGenerating(true);

    const weightsMap: Record<string, number> = {};
    if (showWeights && weights.length > 0) {
      weights.forEach(({ ticker, weight }) => {
        if (ticker && weight) weightsMap[ticker.toUpperCase()] = parseFloat(weight) / 100;
      });
    }

    const body = {
      report_type: templates.find(t => t.id === selected)?.label || "Portfolio Performance Report",
      report_name: reportName,
      tickers,
      weights: Object.keys(weightsMap).length > 0 ? weightsMap : null,
      start_date: startDate,
      end_date: endDate,
      benchmark: benchmark.toUpperCase(),
      portfolio_value: parseFloat(portfolioValue) || 1_000_000,
      theme,
      format,
    };

    try {
      const res = await fetch(`/api/reports/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Generation failed" }));
        throw new Error(err.detail || "Generation failed");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = format === "pdf" ? "pdf" : "xlsx";
      a.download = `${reportName.replace(/\s+/g, "_")}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message || "Unknown error");
    } finally {
      setGenerating(false);
    }
  }

  const selTpl = templates.find(t => t.id === selected);

  return (
    <div className="flex h-full gap-0">
      {/* Left: Template Picker */}
      <aside className="w-56 shrink-0 border-r border-border flex flex-col">
        <div className="px-4 py-4 border-b border-border">
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Report Type</h2>
        </div>
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {templates.map(tpl => (
            <button
              key={tpl.id}
              onClick={() => setSelected(tpl.id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs text-left transition-colors",
                selected === tpl.id
                  ? "bg-surface-2 text-text-primary"
                  : "text-text-muted hover:text-text-primary hover:bg-surface-2"
              )}
            >
              <span className={cn("shrink-0", selected === tpl.id ? "text-accent" : "text-text-muted")}>
                {ICONS[tpl.id]}
              </span>
              {tpl.label.replace(" Report", "")}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main: Config + Preview */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-text-primary flex items-center gap-2">
              <FileText size={16} className="text-accent" />
              Report Generator
            </h1>
            {selTpl && (
              <p className="text-xs text-text-muted mt-0.5">{selTpl.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Format toggle */}
            <div className="flex rounded-md border border-border overflow-hidden">
              {(["pdf", "excel"] as Format[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors",
                    format === f
                      ? "bg-accent text-white"
                      : "text-text-muted hover:text-text-primary"
                  )}
                >
                  {f === "pdf" ? <FileText size={12} /> : <Table2 size={12} />}
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
            {/* Theme toggle */}
            <div className="flex rounded-md border border-border overflow-hidden">
              {(["light", "dark"] as Theme[]).map(th => (
                <button
                  key={th}
                  onClick={() => setTheme(th)}
                  className={cn(
                    "px-3 py-1.5 text-xs transition-colors capitalize",
                    theme === th
                      ? "bg-surface-2 text-text-primary"
                      : "text-text-muted hover:text-text-primary"
                  )}
                >
                  {th}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 max-w-2xl space-y-5">

            <PageGuide
              title="Report Generator"
              subtitle="Generate institutional-quality PDF or Excel reports for any portfolio — covering performance, risk, attribution, and AI commentary."
              steps={[
                { title: "Choose Report Type", detail: "Use the left sidebar to select a report template: Portfolio Performance, Backtest Analysis, Stock Report, Risk Report, Pair Trading, Momentum, Factor, Regime, Options, or Custom. Each template includes a preset set of sections." },
                { title: "Set Output Format", detail: "Toggle between PDF (rich visual report with charts, cover page, and AI commentary) or Excel (raw data across 7 structured sheets for further analysis)." },
                { title: "Choose Theme", detail: "PDF reports can be rendered in Light (white background, professional look) or Dark (dark background, terminal aesthetic). Excel format ignores the theme setting." },
                { title: "Enter Report Details", detail: "Set a report name (used in the filename and cover page), comma-separated tickers, date range (start/end), benchmark ticker (default SPY), and total portfolio value in USD." },
                { title: "Add Custom Weights (Optional)", detail: "Expand 'Custom Portfolio Weights' to assign specific allocation percentages to each ticker. If left empty, equal-weight is assumed for all positions." },
                { title: "Generate and Download", detail: "Click 'Generate PDF' or 'Generate EXCEL'. The backend computes all metrics, renders charts, generates AI commentary, and returns the file for automatic download." },
              ]}
              howItWorks={[
                { title: "PDF Generation Pipeline", detail: "The backend fetches historical prices, computes 50+ performance and risk metrics, renders Matplotlib charts at 150 DPI, generates AI commentary via the configured LLM, then assembles everything into a multi-page PDF using ReportLab with Bloomberg/Morningstar-style layout." },
                { title: "Excel Generation Pipeline", detail: "Data is organized across 7 sheets: Trade History, Portfolio Statistics, Risk Metrics, Performance Metrics, Monthly Heatmap, Factor Exposure + Correlations, and Strategy Attribution. Each sheet is formatted with proper headers, number formatting, and conditional color coding." },
                { title: "AI Commentary", detail: "After computing metrics, the backend sends a structured data summary to the AI model (Anthropic Claude or local Ollama). The model returns 3–5 paragraphs of executive commentary that are embedded in the report's Executive Summary section." },
                { title: "Chart Rendering", detail: "All charts (equity curve, drawdown, annual returns bar, monthly heatmap, rolling Sharpe, attribution waterfall) are rendered server-side with Matplotlib and embedded as high-resolution images in the PDF." },
              ]}
              tips={[
                "Use the dark theme PDF for presentations on screens — it's much easier on the eyes in a dark conference room.",
                "For attribution accuracy, provide custom weights that reflect your actual allocation — equal-weight will misrepresent concentrated portfolios.",
                "The Excel format is ideal for further quant analysis: import Sheet 3 (Risk Metrics) into Python or R for custom calculations.",
              ]}
            />

            {/* Report name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-text-muted font-medium">Report Name</label>
              <input
                value={reportName}
                onChange={e => setReportName(e.target.value)}
                className="px-3 py-2 rounded bg-surface border border-border text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              />
            </div>

            {/* Tickers */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-text-muted font-medium">Tickers <span className="text-text-muted">(comma-separated)</span></label>
              <input
                value={tickerInput}
                onChange={e => setTickerInput(e.target.value)}
                placeholder="AAPL, MSFT, GOOGL, NVDA"
                className="px-3 py-2 rounded bg-surface border border-border text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent font-mono"
              />
              <div className="flex flex-wrap gap-1.5 mt-0.5">
                {tickers.slice(0, 10).map(t => (
                  <span key={t} className="text-[11px] bg-accent/10 text-accent px-2 py-0.5 rounded-full">{t}</span>
                ))}
                {tickers.length > 10 && (
                  <span className="text-[11px] text-text-muted">+{tickers.length - 10} more</span>
                )}
              </div>
            </div>

            {/* Date range + benchmark + value */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-text-muted font-medium">Start Date</label>
                <input type="date" value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="px-3 py-2 rounded bg-surface border border-border text-sm text-text-primary focus:outline-none focus:border-accent" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-text-muted font-medium">End Date</label>
                <input type="date" value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="px-3 py-2 rounded bg-surface border border-border text-sm text-text-primary focus:outline-none focus:border-accent" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-text-muted font-medium">Benchmark</label>
                <input value={benchmark}
                  onChange={e => setBenchmark(e.target.value)}
                  className="px-3 py-2 rounded bg-surface border border-border text-sm text-text-primary focus:outline-none focus:border-accent font-mono" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-text-muted font-medium">Portfolio Value ($)</label>
                <input type="number" value={portfolioValue}
                  onChange={e => setPortfolioValue(e.target.value)}
                  className="px-3 py-2 rounded bg-surface border border-border text-sm text-text-primary focus:outline-none focus:border-accent" />
              </div>
            </div>

            {/* Custom weights (collapsible) */}
            <div className="border border-border rounded-md overflow-hidden">
              <button
                onClick={() => setShowWeights(!showWeights)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-text-muted hover:text-text-primary transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Settings2 size={13} />
                  Custom Portfolio Weights (optional)
                </span>
                <ChevronDown size={13} className={cn("transition-transform", showWeights && "rotate-180")} />
              </button>
              {showWeights && (
                <div className="px-4 pb-4 pt-1 border-t border-border space-y-2">
                  <p className="text-[11px] text-text-muted">Leave empty for equal-weight. Values are in %.</p>
                  {weights.map((w, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={w.ticker}
                        onChange={e => setWeights(prev => prev.map((x, j) => j === i ? { ...x, ticker: e.target.value.toUpperCase() } : x))}
                        placeholder="AAPL"
                        className="flex-1 px-2 py-1.5 rounded bg-surface border border-border text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent font-mono"
                      />
                      <input
                        type="number"
                        value={w.weight}
                        onChange={e => setWeights(prev => prev.map((x, j) => j === i ? { ...x, weight: e.target.value } : x))}
                        placeholder="25"
                        className="w-20 px-2 py-1.5 rounded bg-surface border border-border text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                      />
                      <span className="text-xs text-text-muted">%</span>
                      <button onClick={() => removeWeight(i)} className="text-red-400 hover:text-red-300">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={addWeight}
                    className="flex items-center gap-1.5 text-xs text-accent hover:underline"
                  >
                    <PlusCircle size={12} /> Add Ticker
                  </button>
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="px-4 py-2.5 rounded border border-red-500/30 bg-red-500/10 text-xs text-red-400">
                {error}
              </div>
            )}

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 px-6 py-2.5 bg-accent text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {generating ? (
                <><Loader2 size={14} className="animate-spin" /> Generating…</>
              ) : (
                <><Download size={14} /> Generate {format.toUpperCase()}</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Right: Preview panel */}
      <aside className="w-64 shrink-0 border-l border-border flex flex-col">
        <div className="px-4 py-4 border-b border-border">
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Report Contents</h2>
        </div>
        <div className="flex-1 overflow-y-auto py-4 px-4 space-y-4">
          {format === "pdf" && (
            <div className="space-y-2">
              {[
                ["Cover Page", "Branding, watermark, date"],
                ["Executive Summary", "10 KPI cards + AI commentary"],
                ["Performance Analysis", "Returns, equity curve, annual bar"],
                ["Risk Analysis", "Drawdown, rolling Sharpe/vol"],
                ["Market Analysis", "Monthly heatmap, histogram"],
                ["Attribution", "Per-ticker, factor exposure"],
                ["Disclaimer", "Legal boilerplate"],
              ].map(([title, sub]) => (
                <div key={title} className="flex flex-col gap-0.5 px-3 py-2 rounded bg-surface border border-border">
                  <span className="text-xs font-medium text-text-primary">{title}</span>
                  <span className="text-[10px] text-text-muted">{sub}</span>
                </div>
              ))}
            </div>
          )}
          {format === "excel" && (
            <div className="space-y-2">
              {[
                ["Sheet 1", "Trade History"],
                ["Sheet 2", "Portfolio Statistics"],
                ["Sheet 3", "Risk Metrics"],
                ["Sheet 4", "Performance Metrics"],
                ["Sheet 5", "Monthly Heatmap"],
                ["Sheet 6", "Factor Exposure + Correlations"],
                ["Sheet 7", "Strategy Attribution"],
              ].map(([num, label]) => (
                <div key={num} className="flex items-center gap-2.5 px-3 py-2 rounded bg-surface border border-border">
                  <span className="text-[10px] text-accent font-mono font-bold">{num}</span>
                  <span className="text-xs text-text-primary">{label}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-[10px] text-text-muted leading-relaxed">
              AI commentary is auto-generated from computed metrics. Charts are rendered at 150 DPI.
              PDF uses {theme} theme. Reports resemble Bloomberg / Morningstar institutional format.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

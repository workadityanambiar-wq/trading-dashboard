"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageGuide } from "@/components/PageGuide";

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  cyan:   "#06b6d4", blue:   "#3b82f6", purple: "#a855f7",
  green:  "#22c55e", amber:  "#f59e0b", red:    "#ef4444",
  indigo: "#6366f1", rose:   "#f43f5e", orange: "#f97316",
  muted:  "var(--text-muted)", border: "var(--border, #2a2f3e)",
  surf2:  "var(--surface-2, #1a1f2e)",
};

const TABS = ["Chat", "Insights", "Opportunities", "PM Command"] as const;
type Tab = typeof TABS[number];

// ── Provider status bar ───────────────────────────────────────────────────────
const PROVIDER_ICONS: Record<string, string> = {
  anthropic: "◆", ollama: "⬡", vllm: "▣", lmstudio: "◉", openai: "◈",
};
const ROLE_INFO: Record<string, { label: string; desc: string; color: string }> = {
  primary:   { label: "Analyst",    desc: "Qwen3 32B — fast Q&A & analysis",         color: C.cyan   },
  reasoning: { label: "Reasoner",   desc: "DeepSeek-R1 32B — forecasting & scenarios", color: C.purple },
  reports:   { label: "Reporter",   desc: "Llama 3.3 70B — long-form report writing",  color: C.indigo },
};

function ProviderBar({ role, setRole }: { role: string; setRole: (r: string) => void }) {
  const { data } = useQuery({ queryKey: ["copilot-status"], queryFn: api.getCopilotStatus, staleTime: 30000, retry: false });

  const ready    = data?.ready ?? false;
  const provider = data?.provider ?? "…";
  const label    = data?.label ?? "Connecting…";
  const icon     = PROVIDER_ICONS[provider] ?? "◇";

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg text-[10px]"
      style={{ background: C.surf2, border: `1px solid ${ready ? C.cyan + "40" : C.amber + "40"}` }}>
      {/* Provider pill */}
      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: ready ? C.cyan : C.amber }} />
        <span className="font-bold" style={{ color: ready ? C.cyan : C.amber }}>{icon} {label}</span>
        {!ready && data?.error && <span style={{ color: C.amber }}>— {data.error}</span>}
      </div>

      <div className="flex-1" />

      {/* Model role selector */}
      <div className="flex items-center gap-1">
        <span style={{ color: C.muted }}>Mode:</span>
        {Object.entries(ROLE_INFO).map(([r, info]) => (
          <button key={r} onClick={() => setRole(r)}
            className="px-2 py-0.5 rounded font-bold transition-colors"
            title={info.desc}
            style={{
              background: role === r ? info.color + "20" : "transparent",
              color:       role === r ? info.color : C.muted,
              border:      `1px solid ${role === r ? info.color : "transparent"}`,
            }}>
            {info.label}
          </button>
        ))}
      </div>

      {/* Models */}
      {data?.models && (
        <div className="flex items-center gap-1 font-mono" style={{ color: C.muted }}>
          {data.models.primary && <span title="Primary model">{data.models.primary}</span>}
        </div>
      )}
    </div>
  );
}

// ── Setup guide (shown when not ready) ───────────────────────────────────────
function SetupGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl p-4" style={{ background: C.surf2, border: `1px solid ${C.amber}40` }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold" style={{ color: C.amber }}>⚡ Quick Setup — Choose a free local model or Anthropic Claude</span>
        <button onClick={() => setOpen(o => !o)} className="text-[10px]" style={{ color: C.muted }}>{open ? "Hide" : "Show"}</button>
      </div>
      {open && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
          {[
            {
              title: "⬡ Ollama (Free, Local)", color: C.green,
              steps: ["Install from ollama.com", "ollama pull qwen3:32b", "ollama pull deepseek-r1:32b", "ollama pull llama3.3:70b", "Set AI_PROVIDER=ollama in backend/.env"],
            },
            {
              title: "◉ LM Studio (Desktop)", color: C.blue,
              steps: ["Download from lmstudio.ai", "Load Qwen3-32B model", "Start Local Server (port 1234)", "Set AI_PROVIDER=lmstudio in .env"],
            },
            {
              title: "◆ Anthropic Claude", color: C.purple,
              steps: ["Get key at console.anthropic.com", "Set AI_PROVIDER=anthropic in .env", "Set ANTHROPIC_API_KEY=sk-ant-..."],
            },
          ].map(opt => (
            <div key={opt.title} className="rounded-lg p-3 space-y-1.5" style={{ background: "var(--surface)", border: `1px solid ${opt.color}30` }}>
              <div className="font-bold" style={{ color: opt.color }}>{opt.title}</div>
              {opt.steps.map((s, i) => (
                <div key={i} className="flex gap-1.5">
                  <span className="font-mono font-bold shrink-0" style={{ color: opt.color }}>{i + 1}.</span>
                  <span style={{ color: "var(--text-primary)" }}>{s}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Quick prompts ─────────────────────────────────────────────────────────────
const QUICK_PROMPTS = [
  "What is the highest conviction long right now?",
  "Build me a defense & space portfolio",
  "Why are AI stocks outperforming?",
  "What happens if the Fed cuts rates 50bps?",
  "Which rare earth stocks benefit from China restrictions?",
  "Is the AI capex cycle peaking or accelerating?",
  "What is the probability of a US recession?",
  "Explain the space economy investment opportunity",
];

// ── Markdown renderer ─────────────────────────────────────────────────────────
function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**"))
      return <strong key={i} style={{ color: "var(--text-primary)" }}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("`") && p.endsWith("`"))
      return <code key={i} className="text-[11px] px-1 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.3)", color: C.cyan }}>{p.slice(1, -1)}</code>;
    if (p.startsWith("*") && p.endsWith("*"))
      return <em key={i}>{p.slice(1, -1)}</em>;
    return p;
  });
}

function MdText({ content }: { content: string }) {
  const lines = content.split("\n");
  const out: React.ReactNode[] = [];
  let listBuf: React.ReactNode[] = [];
  const flushList = () => {
    if (listBuf.length) {
      out.push(<ul key={out.length} className="space-y-0.5 my-1 pl-3">{listBuf}</ul>);
      listBuf = [];
    }
  };
  lines.forEach((line, i) => {
    const l = line.trim();
    if (!l) { flushList(); out.push(<div key={i} className="h-1.5" />); return; }
    if (l.startsWith("### ")) { flushList(); out.push(<h4 key={i} className="text-xs font-bold uppercase tracking-widest mt-3 mb-1" style={{ color: C.cyan }}>{l.slice(4)}</h4>); return; }
    if (l.startsWith("## "))  { flushList(); out.push(<h3 key={i} className="text-sm font-bold mt-3 mb-1" style={{ color: "var(--text-primary)" }}>{l.slice(3)}</h3>); return; }
    if (l.startsWith("# "))   { flushList(); out.push(<h2 key={i} className="text-base font-bold mt-3 mb-1" style={{ color: C.cyan }}>{l.slice(2)}</h2>); return; }
    if (l.startsWith("- ") || l.startsWith("• ") || l.startsWith("* ")) {
      listBuf.push(<li key={i} className="flex gap-1.5 text-xs"><span style={{ color: C.cyan }}>▸</span><span>{renderInline(l.slice(2))}</span></li>);
      return;
    }
    if (/^\d+\.\s/.test(l)) {
      const match = l.match(/^(\d+)\.\s(.*)$/);
      if (match) listBuf.push(<li key={i} className="flex gap-1.5 text-xs"><span className="font-mono font-bold" style={{ color: C.cyan }}>{match[1]}.</span><span>{renderInline(match[2])}</span></li>);
      return;
    }
    flushList();
    out.push(<p key={i} className="text-xs leading-relaxed">{renderInline(l)}</p>);
  });
  flushList();
  return <div className="space-y-0.5">{out}</div>;
}

// ── Sub-components ────────────────────────────────────────────────────────────
function SH({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: C.muted }}>{children}</div>;
}

const SIG_C: Record<string, string> = {
  "STRONG BUY": C.green, BUY: "#86efac", HOLD: C.amber,
  SELL: "#fca5a5", "STRONG SELL": C.red,
};
function SigBadge({ sig }: { sig: string }) {
  const col = SIG_C[sig] ?? C.muted;
  return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ color: col, border: `1px solid ${col}` }}>{sig}</span>;
}

const ACT_C: Record<string, string> = { BUY: C.green, SELL: C.red, MONITOR: C.amber, AVOID: "#fca5a5" };
function ActBadge({ act }: { act: string }) {
  const col = ACT_C[act] ?? C.muted;
  return <span className="text-[9px] font-bold px-1.5 py.0.5 rounded" style={{ color: col, border: `1px solid ${col}` }}>{act}</span>;
}

const CAT_C: Record<string, string> = {
  Macro: C.blue, Sector: C.purple, Stock: C.cyan, Crypto: C.orange,
  Commodities: C.amber, Risk: C.red, Opportunity: C.green, Rotation: C.indigo,
};

// ── Chat Tab ──────────────────────────────────────────────────────────────────
interface Msg { role: "user" | "assistant"; content: string; topics?: string[]; model?: string; }

function ChatTab({ role }: { role: string }) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content: "## Welcome to AlphaEngine AI Copilot\n\nI'm your institutional-grade investment intelligence assistant. I have real-time access to all platform dashboards including Space Intel, Defense, Crypto, Oil, Treasury, Regime, and more.\n\n**Ask me anything:**\n- Trade ideas with specific entry/target/stop\n- Macro regime analysis and positioning\n- Sector rotation and factor performance\n- Scenario analysis (\"What if the Fed cuts 50bps?\")\n- Portfolio construction for any theme\n- Real-time dashboard data synthesis\n\nWhat would you like to explore?",
    },
  ]);
  const [input, setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Msg = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const res = await api.copilotChat(text, history, role);
      setMessages(prev => [...prev, { role: "assistant", content: res.response, topics: res.topics, model: res.model }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: "assistant", content: `⚠️ Error: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  }, [messages, loading]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] min-h-[500px]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 pb-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            {/* Avatar */}
            <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${m.role === "user" ? "bg-blue-600 text-white" : ""}`}
              style={m.role === "assistant" ? { background: C.surf2, border: `1px solid ${C.cyan}`, color: C.cyan } : {}}>
              {m.role === "user" ? "You" : "AI"}
            </div>
            {/* Bubble */}
            <div className={`max-w-[82%] rounded-xl px-3.5 py-2.5 text-xs ${m.role === "user" ? "rounded-tr-sm" : "rounded-tl-sm"}`}
              style={{
                background: m.role === "user" ? "#1e3a5f" : C.surf2,
                border: `1px solid ${m.role === "user" ? "#2563eb40" : C.border}`,
                color: "var(--text-primary)",
              }}>
              {m.role === "assistant" ? <MdText content={m.content} /> : <p className="text-xs leading-relaxed">{m.content}</p>}
              {(m.topics?.length || m.model) && (
                <div className="flex gap-1 flex-wrap mt-2 pt-1.5" style={{ borderTop: `1px solid ${C.border}` }}>
                  {m.model && <span className="text-[9px] px-1.5 py-0.5 rounded font-mono" style={{ background: "rgba(163,85,247,0.1)", color: C.purple }}>{m.model}</span>}
                  {m.topics?.map(t => (
                    <span key={t} className="text-[9px] px-1.5 py-0.5 rounded font-mono" style={{ background: "rgba(6,182,212,0.1)", color: C.cyan }}>{t}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
              style={{ background: C.surf2, border: `1px solid ${C.cyan}`, color: C.cyan }}>AI</div>
            <div className="rounded-xl rounded-tl-sm px-3.5 py-2.5" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
              <div className="flex gap-1 items-center">
                {[0,1,2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: C.cyan, animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick prompts */}
      <div className="flex gap-1.5 flex-wrap pb-2">
        {QUICK_PROMPTS.slice(0, 4).map(q => (
          <button key={q} onClick={() => send(q)}
            className="text-[10px] px-2.5 py-1 rounded-full transition-colors"
            style={{ background: C.surf2, border: `1px solid ${C.border}`, color: C.muted }}
            onMouseEnter={e => { (e.target as HTMLElement).style.color = C.cyan; (e.target as HTMLElement).style.borderColor = C.cyan; }}
            onMouseLeave={e => { (e.target as HTMLElement).style.color = C.muted; (e.target as HTMLElement).style.borderColor = C.border; }}>
            {q}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="flex gap-2 items-end" style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          rows={2}
          placeholder="Ask anything — trade ideas, macro analysis, sector rotation, scenario analysis…"
          className="flex-1 resize-none rounded-xl px-3.5 py-2.5 text-xs outline-none transition-colors"
          style={{
            background: C.surf2, border: `1px solid ${C.border}`,
            color: "var(--text-primary)", lineHeight: 1.5,
          }}
          onFocus={e => { e.target.style.borderColor = C.cyan; }}
          onBlur={e => { e.target.style.borderColor = C.border; }}
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || loading}
          className="px-4 py-2.5 rounded-xl text-xs font-bold transition-all"
          style={{
            background: !input.trim() || loading ? C.surf2 : C.cyan,
            color: !input.trim() || loading ? C.muted : "#000",
            border: `1px solid ${!input.trim() || loading ? C.border : C.cyan}`,
          }}>
          {loading ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}

// ── Insights Tab ──────────────────────────────────────────────────────────────
function InsightsTab() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["copilot-insights"],
    queryFn: api.getCopilotInsights,
    staleTime: 300000,
  });

  if (isLoading) return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-xl p-4 animate-pulse h-32" style={{ background: C.surf2, border: `1px solid ${C.border}` }} />
      ))}
    </div>
  );
  if (error) return <div className="text-sm text-red-500 p-4">Failed to load insights</div>;

  const insights = data?.insights ?? [];
  const genAt = data?.generated_at ? new Date(data.generated_at).toLocaleTimeString() : "";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs" style={{ color: C.muted }}>AI-generated insights · Updated {genAt}</div>
        <button onClick={() => refetch()} className="text-[10px] px-2.5 py-1 rounded" style={{ background: C.surf2, border: `1px solid ${C.border}`, color: C.cyan }}>Refresh</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {insights.map((ins: any, i: number) => (
          <div key={i} className="rounded-xl p-4 flex flex-col gap-2" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
            <div className="flex items-start justify-between gap-2">
              <div className="text-xs font-bold leading-tight" style={{ color: "var(--text-primary)" }}>{ins.title}</div>
              <ActBadge act={ins.action} />
            </div>
            <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-primary)" }}>{ins.insight}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${CAT_C[ins.category] ?? C.muted}20`, color: CAT_C[ins.category] ?? C.muted }}>{ins.category}</span>
              <span className="text-[9px] font-mono" style={{ color: C.muted }}>Confidence: {ins.confidence}%</span>
              <span className="text-[9px] font-mono" style={{ color: C.muted }}>{ins.horizon}</span>
              {ins.tickers?.map((t: string) => (
                <span key={t} className="text-[9px] font-mono font-bold px-1 rounded" style={{ color: C.cyan, background: "rgba(6,182,212,0.1)" }}>{t}</span>
              ))}
            </div>
            {/* Confidence bar */}
            <div className="h-1 rounded-full w-full" style={{ background: C.border }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${ins.confidence}%`, background: ins.confidence >= 80 ? C.green : ins.confidence >= 70 ? C.cyan : C.amber }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Opportunities Tab ─────────────────────────────────────────────────────────
function OpportunitiesTab() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["copilot-opportunities"],
    queryFn: api.getCopilotOpportunities,
    staleTime: 300000,
  });
  const [filter, setFilter] = useState<"ALL" | "LONG" | "SHORT">("ALL");

  if (isLoading) return <div className="flex items-center justify-center h-40 text-sm" style={{ color: C.muted }}>Generating opportunities…</div>;
  if (error) return <div className="text-sm text-red-500 p-4">Failed to load opportunities</div>;

  const opps: any[] = (data?.opportunities ?? []).filter((o: any) => filter === "ALL" || o.direction === filter);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1">
          {(["ALL", "LONG", "SHORT"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="text-[10px] px-2.5 py-1 rounded font-bold transition-colors"
              style={{ background: filter === f ? (f === "LONG" ? C.green : f === "SHORT" ? C.red : C.cyan) : C.surf2, color: filter === f ? "#000" : C.muted, border: `1px solid ${filter === f ? (f === "LONG" ? C.green : f === "SHORT" ? C.red : C.cyan) : C.border}` }}>
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px]" style={{ color: C.muted }}>{opps.length} opportunities</span>
          <button onClick={() => refetch()} className="text-[10px] px-2.5 py-1 rounded" style={{ background: C.surf2, border: `1px solid ${C.border}`, color: C.cyan }}>Refresh</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl" style={{ border: `1px solid ${C.border}` }}>
        <table className="w-full text-[11px]">
          <thead>
            <tr style={{ background: C.surf2, color: C.muted }}>
              {["#","Ticker","Name","Category","Signal","Thesis","Exp Ret","Conf","Horizon","Key Risk"].map(h => (
                <th key={h} className="text-left py-2 px-2.5 font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {opps.map((o: any, i: number) => (
              <tr key={i} className="border-t transition-colors" style={{ borderColor: C.border }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(6,182,212,0.04)")}
                onMouseLeave={e => (e.currentTarget.style.background = "")}>
                <td className="py-2 px-2.5 font-mono font-bold" style={{ color: C.muted }}>{o.rank}</td>
                <td className="py-2 px-2.5 font-mono font-bold" style={{ color: C.cyan }}>{o.ticker}</td>
                <td className="py-2 px-2.5" style={{ color: "var(--text-primary)" }}>{o.name}</td>
                <td className="py-2 px-2.5">
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: `${CAT_C[o.category] ?? C.muted}20`, color: CAT_C[o.category] ?? C.muted }}>{o.category}</span>
                </td>
                <td className="py-2 px-2.5"><SigBadge sig={o.signal} /></td>
                <td className="py-2 px-2.5 max-w-[200px]" style={{ color: "var(--text-primary)" }}>{o.thesis}</td>
                <td className="py-2 px-2.5 font-mono font-bold" style={{ color: o.expected_return >= 0 ? C.green : C.red }}>
                  {o.expected_return >= 0 ? "+" : ""}{o.expected_return?.toFixed(1)}%
                </td>
                <td className="py-2 px-2.5">
                  <div className="flex items-center gap-1">
                    <div className="w-8 h-1 rounded-full" style={{ background: C.border }}>
                      <div className="h-full rounded-full" style={{ width: `${o.confidence}%`, background: o.confidence >= 80 ? C.green : C.cyan }} />
                    </div>
                    <span className="font-mono text-[10px]" style={{ color: C.muted }}>{o.confidence}%</span>
                  </div>
                </td>
                <td className="py-2 px-2.5 font-mono" style={{ color: C.muted }}>{o.horizon}</td>
                <td className="py-2 px-2.5 text-[10px] max-w-[160px]" style={{ color: C.amber }}>{o.key_risk}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── PM Command Tab ────────────────────────────────────────────────────────────
function PMCommandTab() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["copilot-pm-command"],
    queryFn: api.getCopilotPMCommand,
    staleTime: 300000,
  });

  if (isLoading) return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-xl p-5 animate-pulse h-36" style={{ background: C.surf2, border: `1px solid ${C.border}` }} />
      ))}
    </div>
  );
  if (error) return <div className="text-sm text-red-500 p-4">Failed to load PM Command data</div>;
  if (!data) return null;

  const genAt = data.generated_at ? new Date(data.generated_at).toLocaleTimeString() : "";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold" style={{ color: C.cyan }}>⚡ PM Command Center</div>
        <div className="flex items-center gap-2">
          <span className="text-[10px]" style={{ color: C.muted }}>Updated {genAt}</span>
          <button onClick={() => refetch()} className="text-[10px] px-2.5 py-1 rounded" style={{ background: C.surf2, border: `1px solid ${C.border}`, color: C.cyan }}>Refresh</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* What Matters */}
        <div className="rounded-xl p-4 sm:col-span-2" style={{ background: C.surf2, border: `1px solid ${C.cyan}40` }}>
          <SH>📌 What Matters Most Today</SH>
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-primary)" }}>{data.what_matters}</p>
        </div>

        {/* Smart Money */}
        <div className="rounded-xl p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
          <SH>🏦 Smart Money Moving To</SH>
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-primary)" }}>{data.smart_money}</p>
        </div>

        {/* Top Trade */}
        <div className="rounded-xl p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
          <SH>🎯 Highest Conviction Trade</SH>
          {data.top_trade && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-base font-mono font-bold" style={{ color: C.cyan }}>{data.top_trade.ticker}</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: data.top_trade.direction === "LONG" ? "#16303320" : "#3f151520", color: data.top_trade.direction === "LONG" ? C.green : C.red, border: `1px solid ${data.top_trade.direction === "LONG" ? C.green : C.red}` }}>{data.top_trade.direction}</span>
                <span className="text-[10px] font-mono" style={{ color: C.muted }}>{data.top_trade.horizon}</span>
              </div>
              <p className="text-xs" style={{ color: "var(--text-primary)" }}>{data.top_trade.thesis}</p>
            </div>
          )}
        </div>

        {/* Top Risks */}
        <div className="rounded-xl p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
          <SH>⚠️ Top Risks To Watch</SH>
          <div className="space-y-1.5">
            {(data.top_risks ?? []).map((r: string, i: number) => (
              <div key={i} className="flex gap-2 text-xs">
                <span className="font-bold font-mono shrink-0" style={{ color: C.red }}>{i + 1}.</span>
                <span style={{ color: "var(--text-primary)" }}>{r}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Accelerating Trends */}
        <div className="rounded-xl p-4" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
          <SH>🚀 Accelerating Trends</SH>
          <div className="space-y-1.5">
            {(data.accelerating_trends ?? []).map((t: string, i: number) => (
              <div key={i} className="flex gap-2 text-xs">
                <span style={{ color: C.green }}>▸</span>
                <span style={{ color: "var(--text-primary)" }}>{t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Cycle Positioning */}
        <div className="rounded-xl p-4 sm:col-span-2" style={{ background: C.surf2, border: `1px solid ${C.border}` }}>
          <SH>📊 Cycle Positioning</SH>
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-primary)" }}>{data.cycle_positioning}</p>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CopilotPage() {
  const [activeTab, setActiveTab] = useState<Tab>("Chat");
  const [modelRole, setModelRole] = useState("primary");

  const { data: statusData } = useQuery({
    queryKey: ["copilot-status"],
    queryFn: api.getCopilotStatus,
    staleTime: 30000,
    retry: false,
  });
  const isReady = statusData?.ready ?? false;

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <PageGuide
        title="AI Copilot — Guide"
        subtitle="Institutional investment intelligence powered by local and cloud LLMs"
        steps={[
          { title: "Configure Your AI Provider", detail: "The provider bar at the top shows your connected LLM. If it shows 'Configuring', click Show on the setup guide and follow the instructions to connect Ollama (free, local), LM Studio, or Anthropic Claude." },
          { title: "Choose a Model Role", detail: "Three roles are available: Analyst (Qwen3 32B — fast Q&A), Reasoner (DeepSeek-R1 32B — deep forecasting and scenario analysis), and Reporter (Llama 3.3 70B — long-form report writing). Switch roles based on your task." },
          { title: "Use the Chat Tab", detail: "Type any investment question in the chat. The AI has context about all platform dashboards. Ask for trade ideas with specific entry/target/stop, macro regime analysis, sector rotation, or scenario analysis like 'What if the Fed cuts 50bps?'" },
          { title: "Browse AI Insights", detail: "The Insights tab shows AI-generated market insights updated periodically. Each insight includes a category, confidence score, time horizon, and action (BUY/SELL/MONITOR/AVOID) with related tickers." },
          { title: "Review Opportunities", detail: "The Opportunities tab ranks the highest-conviction trade ideas by expected return and confidence. Filter by LONG/SHORT. Each row shows thesis, expected return, confidence, horizon, and key risk." },
          { title: "Check the PM Command Center", detail: "The PM Command tab is your daily briefing: what matters most today, where smart money is moving, the highest conviction trade, top risks, accelerating trends, and cycle positioning — all in one screen." },
        ]}
        howItWorks={[
          { title: "Local LLM Integration", detail: "The backend connects to your local Ollama or LM Studio server. Conversations never leave your machine when using local models — full privacy. The AI uses Retrieval-Augmented Generation (RAG) to access real-time platform data." },
          { title: "Dashboard Context", detail: "The AI Copilot has access to regime data, breadth, volatility, sector rotation, factor scores, and more from the backend API. When you ask about market conditions, it queries live data rather than relying on training knowledge alone." },
          { title: "Streaming Responses", detail: "Chat responses stream token-by-token for a fast, responsive feel. The model tag on each assistant message shows which specific model generated the response." },
          { title: "Insight and Opportunity Generation", detail: "Insights and Opportunities are generated by querying the LLM with structured prompts and live market data on a schedule. They are cached for 5 minutes; click Refresh to regenerate with the latest data." },
          { title: "PM Command Synthesis", detail: "The PM Command tab runs a synthesis prompt that aggregates signals from all dashboards and asks the LLM to identify the single most important thing to focus on, the highest conviction trade, and the top risks — formatted for a portfolio manager morning brief." },
        ]}
        tips={[
          "Use the Reasoner role (DeepSeek-R1) for scenario analysis like 'What happens to tech if the 10Y hits 5.5%?' — it generates step-by-step reasoning chains.",
          "Quick prompts at the bottom of the chat are pre-written for the most common use cases — click them to see how the AI responds, then customize from there.",
          "The PM Command tab is best used first thing in the morning as a market briefing before diving into individual pages.",
          "If the AI gives an outdated answer, ask it to 'check the current regime dashboard data' — it will pull fresh readings from the backend.",
        ]}
      />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            ✦ AI Copilot
          </h1>
          <p className="text-xs mt-0.5" style={{ color: C.muted }}>
            Institutional investment intelligence · Qwen3 · DeepSeek-R1 · Llama 3.3 · Claude
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: isReady ? C.cyan : C.amber }} />
          <span className="text-[10px] font-mono" style={{ color: isReady ? C.cyan : C.amber }}>
            {isReady ? `${statusData?.provider?.toUpperCase()} Ready` : "Configuring…"}
          </span>
        </div>
      </div>

      {/* Provider status bar */}
      <ProviderBar role={modelRole} setRole={setModelRole} />

      {/* Setup guide (only if not ready) */}
      {!isReady && <SetupGuide />}

      {/* Tab bar */}
      <div className="flex gap-1 flex-wrap">
        {TABS.map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={{
              background: activeTab === t ? C.cyan : C.surf2,
              color: activeTab === t ? "#000" : C.muted,
              border: `1px solid ${activeTab === t ? C.cyan : C.border}`,
            }}>
            {t === "Chat" ? "💬 Chat" : t === "Insights" ? "💡 Insights" : t === "Opportunities" ? "🎯 Opportunities" : "⚡ PM Command"}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === "Chat"          && <ChatTab role={modelRole} />}
      {activeTab === "Insights"      && <InsightsTab />}
      {activeTab === "Opportunities" && <OpportunitiesTab />}
      {activeTab === "PM Command"    && <PMCommandTab />}
    </div>
  );
}

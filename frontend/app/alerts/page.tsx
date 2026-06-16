"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Bell, Plus, Trash2, CheckCheck, RefreshCw,
  TrendingUp, TrendingDown, Minus, AlertCircle,
  ShieldAlert, Zap, BarChart3, Brain,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── types ──────────────────────────────────────────────────────────────────────

interface AlertDef {
  id: string;
  ticker: string;
  name: string;
  category: string;
  condition: string;
  params: Record<string, unknown>;
  channels: string[];
  is_active: boolean;
  repeat: boolean;
  created_at: string;
}

interface Trigger {
  id: string;
  alert_id: string;
  ticker: string;
  category: string;
  condition: string;
  trigger_price: number;
  confidence: number;
  signal_type: string;
  explanation: string;
  suggestion: string;
  risk_level: string;
  success_rate: string;
  is_read: boolean;
  triggered_at: string;
}

interface ConditionDef {
  id: string;
  label: string;
  category: string;
  params: string[];
}

// ── helpers ────────────────────────────────────────────────────────────────────

function SignalBadge({ type }: { type: string }) {
  if (type === "bullish")
    return <span className="flex items-center gap-1 text-green-400 text-xs font-medium"><TrendingUp size={11} />Bullish</span>;
  if (type === "bearish")
    return <span className="flex items-center gap-1 text-red-400 text-xs font-medium"><TrendingDown size={11} />Bearish</span>;
  return <span className="flex items-center gap-1 text-text-muted text-xs font-medium"><Minus size={11} />Neutral</span>;
}

function RiskBadge({ level }: { level: string }) {
  const color =
    level.includes("High") ? "bg-red-500/15 text-red-400 border-red-500/30" :
    level.includes("Low")  ? "bg-green-500/15 text-green-400 border-green-500/30" :
                              "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
  return (
    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border", color)}>
      {level}
    </span>
  );
}

function ConfidenceMeter({ value }: { value: number }) {
  const color = value >= 70 ? "bg-green-500" : value >= 55 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 bg-surface-2 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-text-muted">{value}/100</span>
    </div>
  );
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  price:     <BarChart3 size={12} />,
  technical: <Zap size={12} />,
  momentum:  <TrendingUp size={12} />,
  composite: <Brain size={12} />,
};

// ── main page ─────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const [tab, setTab] = useState<"triggers" | "manage" | "create">("triggers");
  const [alerts, setAlerts]   = useState<AlertDef[]>([]);
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [conditions, setConditions] = useState<ConditionDef[]>([]);
  const [unread, setUnread]   = useState(0);
  const [loading, setLoading] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);

  // create form state
  const [form, setForm] = useState({
    ticker: "",
    name: "",
    category: "price",
    condition: "",
    params: {} as Record<string, string>,
    channels: ["in_app"] as string[],
    repeat: false,
  });
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState("");

  const USER_ID = "default";

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [a, t, c, u] = await Promise.all([
        fetch(`/api/alerts/?user_id=${USER_ID}`).then(r => r.ok ? r.json() : []),
        fetch(`/api/alerts/triggers?user_id=${USER_ID}&unread_only=${unreadOnly}&limit=200`).then(r => r.ok ? r.json() : []),
        fetch(`/api/alerts/conditions`).then(r => r.ok ? r.json() : []),
        fetch(`/api/alerts/unread-count?user_id=${USER_ID}`).then(r => r.ok ? r.json() : { count: 0 }),
      ]);
      setAlerts(a);
      setTriggers(t);
      setConditions(c);
      setUnread(u.count ?? 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [unreadOnly]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleMarkAllRead() {
    const ids = triggers.filter(t => !t.is_read).map(t => t.id);
    if (!ids.length) return;
    await fetch(`/api/alerts/triggers/mark-read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trigger_ids: ids }),
    });
    fetchAll();
  }

  async function handleDelete(alertId: string) {
    await fetch(`/api/alerts/${alertId}?user_id=${USER_ID}`, { method: "DELETE" });
    fetchAll();
  }

  async function handleMarkRead(triggerId: string) {
    await fetch(`/api/alerts/triggers/mark-read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trigger_ids: [triggerId] }),
    });
    setTriggers(prev => prev.map(t => t.id === triggerId ? { ...t, is_read: true } : t));
    setUnread(prev => Math.max(0, prev - 1));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.ticker || !form.condition) return;
    setCreating(true);
    setCreateMsg("");
    try {
      const res = await fetch(`/api/alerts/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          ticker: form.ticker.toUpperCase(),
          name: form.name || `${form.ticker.toUpperCase()} ${form.condition}`,
          user_id: USER_ID,
        }),
      });
      if (res.ok) {
        setCreateMsg("Alert created!");
        setForm({ ticker: "", name: "", category: "price", condition: "", params: {}, channels: ["in_app"], repeat: false });
        fetchAll();
        setTimeout(() => setTab("manage"), 800);
      } else {
        setCreateMsg("Error creating alert.");
      }
    } catch {
      setCreateMsg("Network error.");
    } finally {
      setCreating(false);
    }
  }

  const selectedCond = conditions.find(c => c.id === form.condition);

  return (
    <div className="flex flex-col h-full p-6 gap-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell size={20} className="text-accent" />
          <div>
            <h1 className="text-lg font-semibold text-text-primary">Alerts & Notifications</h1>
            <p className="text-xs text-text-muted">28 conditions · AI explanations · Multi-channel delivery</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {unread > 0 && (
            <span className="text-xs bg-red-500/15 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full">
              {unread} unread
            </span>
          )}
          <button onClick={fetchAll} className="p-1.5 rounded hover:bg-surface-2 text-text-muted hover:text-text-primary transition-colors">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(["triggers", "manage", "create"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm capitalize transition-colors border-b-2 -mb-px",
              tab === t
                ? "border-accent text-accent"
                : "border-transparent text-text-muted hover:text-text-primary"
            )}
          >
            {t === "triggers" ? `History${unread > 0 ? ` (${unread})` : ""}` : t === "manage" ? `Active (${alerts.length})` : "New Alert"}
          </button>
        ))}
      </div>

      {/* ── TRIGGERS TAB ───────────────────────────────────────────────────── */}
      {tab === "triggers" && (
        <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={e => { setUnreadOnly(e.target.checked); }}
                className="accent-accent"
              />
              Unread only
            </label>
            {unread > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
              >
                <CheckCheck size={13} /> Mark all read
              </button>
            )}
          </div>

          {triggers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-text-muted">
              <AlertCircle size={32} strokeWidth={1.2} />
              <p className="text-sm">No triggers yet. Set up alerts to see them here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {triggers.map(trig => (
                <div
                  key={trig.id}
                  className={cn(
                    "rounded-lg border p-4 transition-colors",
                    trig.is_read
                      ? "border-border bg-surface"
                      : "border-accent/30 bg-accent/5"
                  )}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-text-primary">{trig.ticker}</span>
                      <SignalBadge type={trig.signal_type} />
                      <span className="text-xs text-text-muted capitalize px-1.5 py-0.5 bg-surface-2 rounded">
                        {trig.category}
                      </span>
                      <RiskBadge level={trig.risk_level} />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-text-muted">
                        {new Date(trig.triggered_at).toLocaleString()}
                      </span>
                      {!trig.is_read && (
                        <button
                          onClick={() => handleMarkRead(trig.id)}
                          className="text-[10px] text-accent hover:underline"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-3 text-xs">
                    <div>
                      <span className="text-text-muted">Trigger price</span>
                      <p className="text-text-primary font-medium">${trig.trigger_price?.toFixed(2) ?? "—"}</p>
                    </div>
                    <div>
                      <span className="text-text-muted">Confidence</span>
                      <ConfidenceMeter value={trig.confidence ?? 0} />
                    </div>
                  </div>

                  <p className="text-xs text-text-muted mb-2 leading-relaxed">{trig.explanation}</p>

                  <div className="flex items-start gap-2 text-xs bg-surface-2 rounded px-3 py-2">
                    <ShieldAlert size={12} className="text-accent mt-0.5 shrink-0" />
                    <span className="text-text-muted">{trig.suggestion}</span>
                  </div>

                  <p className="text-[10px] text-text-muted mt-2 opacity-70">{trig.success_rate}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MANAGE TAB ─────────────────────────────────────────────────────── */}
      {tab === "manage" && (
        <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-text-muted">
              <Bell size={32} strokeWidth={1.2} />
              <p className="text-sm">No active alerts.</p>
              <button
                onClick={() => setTab("create")}
                className="flex items-center gap-1.5 text-xs text-accent hover:underline"
              >
                <Plus size={13} /> Create your first alert
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map(alert => (
                <div key={alert.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
                  <div className="flex items-center justify-center w-7 h-7 rounded bg-surface-2 text-accent shrink-0">
                    {CATEGORY_ICONS[alert.category] ?? <Bell size={12} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-text-primary text-sm">{alert.ticker}</span>
                      <span className="text-xs text-text-muted">—</span>
                      <span className="text-xs text-text-primary truncate">{alert.name}</span>
                      {alert.repeat && (
                        <span className="text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded">repeat</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-text-muted">{alert.condition.replace(/_/g, " ")}</span>
                      <span className="text-[10px] text-text-muted opacity-50">·</span>
                      <span className="text-[11px] text-text-muted">{alert.channels.join(", ")}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(alert.id)}
                    className="p-1.5 rounded text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── CREATE TAB ─────────────────────────────────────────────────────── */}
      {tab === "create" && (
        <form onSubmit={handleCreate} className="flex flex-col gap-5 max-w-lg">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-text-muted">Ticker *</label>
              <input
                value={form.ticker}
                onChange={e => setForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                placeholder="AAPL"
                className="px-3 py-2 rounded bg-surface border border-border text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-text-muted">Alert name</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Optional display name"
                className="px-3 py-2 rounded bg-surface border border-border text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-text-muted">Category</label>
            <div className="flex gap-2">
              {["price", "technical", "momentum", "composite"].map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, category: cat, condition: "" }))}
                  className={cn(
                    "flex-1 py-1.5 text-xs rounded border capitalize transition-colors",
                    form.category === cat
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border text-text-muted hover:text-text-primary"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-text-muted">Condition *</label>
            <select
              value={form.condition}
              onChange={e => setForm(f => ({ ...f, condition: e.target.value, params: {} }))}
              className="px-3 py-2 rounded bg-surface border border-border text-sm text-text-primary focus:outline-none focus:border-accent"
              required
            >
              <option value="">Select condition…</option>
              {conditions
                .filter(c => c.category === form.category)
                .map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))
              }
            </select>
          </div>

          {/* Dynamic params */}
          {selectedCond && selectedCond.params.length > 0 && (
            <div className="flex flex-col gap-3">
              <label className="text-xs text-text-muted">Parameters</label>
              <div className="grid grid-cols-2 gap-3">
                {selectedCond.params.map(p => (
                  <div key={p} className="flex flex-col gap-1">
                    <label className="text-[11px] text-text-muted capitalize">{p.replace(/_/g, " ")}</label>
                    <input
                      type="number"
                      step="any"
                      value={(form.params[p] as string) || ""}
                      onChange={e => setForm(f => ({
                        ...f,
                        params: { ...f.params, [p]: e.target.value },
                      }))}
                      className="px-2 py-1.5 rounded bg-surface border border-border text-sm text-text-primary focus:outline-none focus:border-accent"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-text-muted">Channels</label>
            <div className="flex flex-wrap gap-2">
              {["in_app", "email", "telegram", "discord", "slack"].map(ch => {
                const on = form.channels.includes(ch);
                return (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => setForm(f => ({
                      ...f,
                      channels: on
                        ? f.channels.filter(c => c !== ch)
                        : [...f.channels, ch],
                    }))}
                    className={cn(
                      "px-3 py-1 text-xs rounded border transition-colors",
                      on
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border text-text-muted hover:text-text-primary"
                    )}
                  >
                    {ch.replace("_", " ")}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.repeat}
              onChange={e => setForm(f => ({ ...f, repeat: e.target.checked }))}
              className="accent-accent"
            />
            <span className="text-xs text-text-muted">Repeat — keep alert active after trigger</span>
          </label>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={creating}
              className="flex items-center gap-2 px-5 py-2 bg-accent text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              <Plus size={14} />
              {creating ? "Creating…" : "Create Alert"}
            </button>
            {createMsg && (
              <span className={cn("text-xs", createMsg.includes("Error") || createMsg.includes("error") ? "text-red-400" : "text-green-400")}>
                {createMsg}
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

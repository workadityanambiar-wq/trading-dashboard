"""AI Copilot — institutional-grade investment intelligence.

Supported providers (set AI_PROVIDER env var):
  anthropic   → Claude via Anthropic API          (default)
  ollama      → Qwen3/DeepSeek-R1/Llama3.3 local  (http://localhost:11434)
  vllm        → vLLM production server             (OPENAI_COMPAT_URL)
  lmstudio    → LM Studio desktop                  (http://localhost:1234)
  openai      → OpenAI or any compat endpoint

Model roles (configure independently per provider):
  primary    → Qwen3:32B  / claude-sonnet-4-6      (analysis, Q&A)
  reasoning  → DeepSeek-R1:32B / claude-opus-4-7   (forecasting, scenarios)
  reports    → Llama3.3:70B / claude-opus-4-7       (long-form reports)
"""
import os
import time
import json
import asyncio
import httpx
from datetime import datetime
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["copilot"])

# ── Provider config ───────────────────────────────────────────────────────────
PROVIDER     = os.environ.get("AI_PROVIDER", "anthropic").lower()
SELF_URL     = os.environ.get("INTERNAL_API_URL", "http://localhost:8000")

# Anthropic
ANTHROPIC_KEY   = os.environ.get("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL    = os.environ.get("COPILOT_MODEL", "claude-sonnet-4-6")

# Ollama (OpenAI-compat at /v1)
OLLAMA_URL      = os.environ.get("OLLAMA_URL", "http://localhost:11434")

# vLLM / LM Studio / generic OpenAI-compat
OPENAI_COMPAT_URL = os.environ.get("OPENAI_COMPAT_URL",
    "http://localhost:1234" if PROVIDER == "lmstudio" else
    "http://localhost:8080" if PROVIDER == "vllm" else
    OLLAMA_URL)
OPENAI_COMPAT_KEY = os.environ.get("OPENAI_COMPAT_KEY", "ollama")

# Model roles — defaults match recommended stack
_MODEL_DEFAULTS = {
    "ollama":    {"primary": "qwen3:32b",          "reasoning": "deepseek-r1:32b",      "reports": "llama3.3:70b"},
    "vllm":      {"primary": "Qwen/Qwen3-32B",     "reasoning": "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B", "reports": "meta-llama/Llama-3.3-70B-Instruct"},
    "lmstudio":  {"primary": "qwen3-32b",          "reasoning": "deepseek-r1-distill-qwen-32b", "reports": "llama-3.3-70b"},
    "openai":    {"primary": "gpt-4o",             "reasoning": "o1-preview",           "reports": "gpt-4o"},
    "anthropic": {"primary": "claude-sonnet-4-6",  "reasoning": "claude-opus-4-7",      "reports": "claude-opus-4-7"},
}

def _model(role: str = "primary") -> str:
    defaults = _MODEL_DEFAULTS.get(PROVIDER, _MODEL_DEFAULTS["anthropic"])
    env_key  = f"AI_{role.upper()}_MODEL"
    return os.environ.get(env_key, defaults.get(role, defaults["primary"]))

def _provider_url() -> str:
    if PROVIDER == "ollama":    return OLLAMA_URL
    if PROVIDER == "openai":    return "https://api.openai.com"
    return OPENAI_COMPAT_URL

def _provider_label() -> str:
    labels = {
        "anthropic": f"Anthropic · {_model('primary')}",
        "ollama":    f"Ollama · {_model('primary')} / {_model('reasoning')}",
        "vllm":      f"vLLM · {_model('primary')}",
        "lmstudio":  f"LM Studio · {_model('primary')}",
        "openai":    f"OpenAI · {_model('primary')}",
    }
    return labels.get(PROVIDER, PROVIDER)

_cache: dict = {}
_CACHE_TTL = 300  # 5 min

def _cache_get(k: str):
    e = _cache.get(k)
    if e and time.time() - e["t"] < _CACHE_TTL:
        return e["v"]
    return None

def _cache_set(k: str, v):
    _cache[k] = {"v": v, "t": time.time()}


async def _safe_fetch(client: httpx.AsyncClient, path: str) -> dict:
    cached = _cache_get(path)
    if cached is not None:
        return cached
    try:
        r = await client.get(f"{SELF_URL}{path}", timeout=6.0)
        if r.status_code == 200:
            data = r.json()
            _cache_set(path, data)
            return data
    except Exception:
        pass
    return {}


async def _call_ai(messages: list[dict], system: str,
                   max_tokens: int = 1800, role: str = "primary") -> str:
    """Dispatch to the configured AI provider."""
    if PROVIDER == "anthropic":
        return await _call_anthropic(messages, system, max_tokens, role)
    if PROVIDER == "ollama":
        return await _call_ollama_native(messages, system, max_tokens, role)
    return await _call_openai_compat(messages, system, max_tokens, role)


async def _call_anthropic(messages: list[dict], system: str,
                           max_tokens: int, role: str) -> str:
    if not ANTHROPIC_KEY:
        return _not_configured_msg()
    model = _model(role) if role != "primary" else CLAUDE_MODEL
    async with httpx.AsyncClient() as client:
        try:
            r = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": ANTHROPIC_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={"model": model, "max_tokens": max_tokens, "system": system, "messages": messages},
                timeout=90.0,
            )
            data = r.json()
            if "content" in data and data["content"]:
                return data["content"][0]["text"]
            return f"Anthropic error: {data.get('error', {}).get('message', 'Unknown')}"
        except Exception as e:
            return f"Anthropic unreachable: {e}"


async def _call_openai_compat(messages: list[dict], system: str,
                               max_tokens: int, role: str) -> str:
    """Call any OpenAI-compatible endpoint (vLLM, LM Studio, OpenAI)."""
    model    = _model(role)
    base_url = _provider_url()
    api_key  = os.environ.get("OPENAI_API_KEY", "") if PROVIDER == "openai" else OPENAI_COMPAT_KEY
    all_msgs = [{"role": "system", "content": system}] + messages

    async with httpx.AsyncClient() as client:
        try:
            r = await client.post(
                f"{base_url}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key or 'ollama'}",
                    "Content-Type":  "application/json",
                },
                json={"model": model, "messages": all_msgs, "max_tokens": max_tokens,
                      "temperature": 0.7},
                timeout=240.0,
            )
            data = r.json()
            if "choices" in data and data["choices"]:
                content = data["choices"][0]["message"]["content"]
                import re
                content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
                return content
            return f"{PROVIDER} error: {data.get('error', {}).get('message', str(data)[:200])}"
        except httpx.ConnectError:
            return _not_running_msg()
        except Exception as e:
            return f"{PROVIDER} unreachable: {e}"


async def _call_ollama_native(messages: list[dict], system: str,
                               max_tokens: int, role: str) -> str:
    """Use Ollama's native /api/chat — handles Qwen3 thinking tokens correctly."""
    model    = _model(role)
    all_msgs = [{"role": "system", "content": system}] + messages

    async with httpx.AsyncClient() as client:
        try:
            r = await client.post(
                f"{OLLAMA_URL}/api/chat",
                json={
                    "model":   model,
                    "messages": all_msgs,
                    "stream":  False,
                    "options": {
                        "num_predict": max_tokens + 400,  # extra budget for Qwen3 thinking phase
                        "temperature": 0.7,
                    },
                },
                timeout=300.0,
            )
            data = r.json()
            if "message" in data:
                return data["message"].get("content", "").strip()
            return f"Ollama error: {data.get('error', str(data)[:200])}"
        except httpx.ConnectError:
            return _not_running_msg()
        except Exception as e:
            return f"Ollama unreachable: {e}"


def _not_configured_msg() -> str:
    return (
        "## AI Copilot — Configuration Required\n\n"
        "No AI provider is configured. Choose one:\n\n"
        "**Option 1 — Ollama (free, local)**\n"
        "```\n# Install: https://ollama.com\nollama pull qwen3:32b\nollama pull deepseek-r1:32b\n"
        "ollama pull llama3.3:70b\n```\n"
        "Then set in `backend/.env`:\n"
        "```\nAI_PROVIDER=ollama\nOLLAMA_URL=http://localhost:11434\n```\n\n"
        "**Option 2 — Anthropic Claude**\n"
        "```\nAI_PROVIDER=anthropic\nANTHROPIC_API_KEY=sk-ant-...\n```\n\n"
        "**Option 3 — LM Studio**\n"
        "```\nAI_PROVIDER=lmstudio\nOPENAI_COMPAT_URL=http://localhost:1234\n```\n\n"
        "Restart the backend after editing `.env`."
    )

def _not_running_msg() -> str:
    tips = {
        "ollama":   "Run `ollama serve` and pull your models with `ollama pull qwen3:32b`.",
        "vllm":     f"Start vLLM: `python -m vllm.entrypoints.openai.api_server --model {_model()} --port 8080`",
        "lmstudio": "Open LM Studio → Local Server tab → Start Server (port 1234).",
    }
    tip = tips.get(PROVIDER, f"Start your {PROVIDER} server at {_provider_url()}")
    return f"## {PROVIDER.title()} server not reachable\n\n{tip}"


# Legacy alias so existing call-sites still work
async def _call_claude(messages: list[dict], system: str, max_tokens: int = 1800) -> str:
    return await _call_ai(messages, system, max_tokens, role="primary")


SYSTEM_BASE = """You are an institutional-grade AI investment copilot for QuantDesk, a professional quant research platform.

You combine the expertise of:
• Bloomberg Research Analyst — real-time data synthesis
• Goldman Sachs Equity Research — fundamental + earnings analysis
• Point72 Portfolio Manager — actionable high-conviction trade ideas
• Bridgewater Macro Strategist — global macro regime analysis
• Renaissance Technologies Quant — cross-asset statistical patterns

QuantDesk Platform dashboards: Watchlist, Overview, Setups, Rotation, Pre-Breakout, Multi-TF, IPO Intel, Earnings, RS Rankings, Regime, Institutional Flow, Institutional Tracker, Crowding, PEAD, Quality Factor, AI CapEx, Macro, Country Macro, Oil Tracker, Dollar Tracker, Treasury Yields, Metals, Memory Intel, AI Compute Infra, Quantum Intel, Rare Earths, Congress Intel, Defense Intel, Space Intel, Crypto Intel, Breadth, Volatility, Alpha Engine, Smart Money Flow, Options Analytics, Correlations, Screener, Factors, Expected Return, Intraday, Alerts, Reports, Strategy Builder, Backtester, Portfolio, Risk Engine, PCA Risk Model, MT5.

Response format rules:
- Lead with the key insight (first line = executive summary)
- Use **bold** for tickers, key metrics, and action words
- Structure with ## headers for multi-part responses
- Bullet points for lists, numbered for ranked items
- For forecasts: state probability/confidence as "(Confidence: X%)"
- For trade ideas: Ticker | Direction | Entry | Target | Stop | Horizon
- End actionable answers with "**Recommendation:** [specific action]"
- Keep concise — max 400 words unless explicitly asked for detailed report
- Never hedge to the point of being useless; give a clear directional view
"""


def _detect_topics(q: str) -> list[str]:
    q = q.lower()
    kw_map = {
        "space":         ["space", "rocket", "satellite", "rklb", "spacex", "lunar", "orbit"],
        "oil":           ["oil", "crude", "wti", "brent", "opec", "energy", "petroleum"],
        "crypto":        ["crypto", "bitcoin", "ethereum", "btc", "eth", "defi", "altcoin", "coin"],
        "defense":       ["defense", "military", "weapon", "lockheed", "raytheon", "northrop", "geopolit", "nato"],
        "rare-earths":   ["rare earth", "critical mineral", "lithium", "cobalt", "neodymium", "tungsten", "china restrict"],
        "memory":        ["memory", "hbm", "dram", "nand", "flash", "micron", "samsung", "sk hynix", "hynix"],
        "ai-capex":      ["ai capex", "ai infrastructure", "data center", "datacenter", "hyperscaler", "gpu", "nvidia capex"],
        "treasury":      ["treasury", "yield", "bond", "10-year", "yield curve", "duration", "t-bill", "rate"],
        "dollar":        ["dollar", "dxy", "usd", "forex", "currency", "dollar index", "em currency"],
        "metals":        ["gold", "silver", "copper", "platinum", "metal", "precious"],
        "regime":        ["regime", "risk-on", "risk-off", "market cycle", "expansion", "recession", "cycle"],
        "earnings":      ["earnings", "eps", "revenue", "guidance", "quarter", "estimate"],
        "ipo":           ["ipo", "going public", "listing", "spac", "roadshow"],
        "macro":         ["gdp", "inflation", "fed", "interest rate", "recession", "unemployment", "cpi", "pce", "macro"],
        "rare-earths":   ["rare earth", "critical mineral", "china restrict", "supply chain"],
        "volatility":    ["volatility", "vix", "fear", "options flow", "put", "call"],
        "portfolio":     ["portfolio", "allocation", "weight", "diversif", "position"],
    }
    topics = []
    for topic, keywords in kw_map.items():
        if any(kw in q for kw in keywords) and topic not in topics:
            topics.append(topic)
    return topics[:5] or ["regime", "macro"]


TOPIC_ENDPOINTS: dict[str, list[str]] = {
    "space":       ["/api/space/overview"],
    "oil":         ["/api/oil/overview"],
    "crypto":      ["/api/crypto/overview"],
    "defense":     ["/api/defense/overview"],
    "rare-earths": ["/api/rare-earths/overview"],
    "memory":      ["/api/memory/overview"],
    "ai-capex":    ["/api/ai-capex/dashboard"],
    "treasury":    ["/api/treasury/overview"],
    "dollar":      ["/api/dollar/overview"],
    "metals":      ["/api/metals/overview"],
    "regime":      ["/api/regime/current"],
    "earnings":    ["/api/earnings/calendar"],
    "ipo":         ["/api/ipo/overview"],
}


async def _gather_context(topics: list[str]) -> str:
    seen: list[str] = []
    for t in topics:
        for ep in TOPIC_ENDPOINTS.get(t, []):
            if ep not in seen:
                seen.append(ep)
    if not seen:
        return ""
    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(*[_safe_fetch(client, ep) for ep in seen], return_exceptions=True)
    parts = []
    for ep, res in zip(seen, results):
        if isinstance(res, dict) and res:
            label = ep.split("/")[2].upper()
            parts.append(f"=== {label} DASHBOARD ===\n{json.dumps(res, indent=2)[:1800]}")
    return "\n\n".join(parts)


# ── Pydantic models ───────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    history: list = []
    role: str = "primary"   # primary | reasoning | reports


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/status")
async def get_status():
    """Return current provider config and connectivity."""
    ready = False
    error = ""
    if PROVIDER == "anthropic":
        ready = bool(ANTHROPIC_KEY)
        error = "" if ready else "ANTHROPIC_API_KEY not set"
    else:
        try:
            async with httpx.AsyncClient() as client:
                url = f"{_provider_url()}/v1/models"
                r   = await client.get(url, timeout=3.0,
                                       headers={"Authorization": f"Bearer {OPENAI_COMPAT_KEY or 'ollama'}"})
                ready = r.status_code == 200
        except Exception as e:
            error = str(e)

    return {
        "provider":       PROVIDER,
        "label":          _provider_label(),
        "ready":          ready,
        "error":          error,
        "models": {
            "primary":   _model("primary"),
            "reasoning": _model("reasoning"),
            "reports":   _model("reports"),
        },
        "provider_url":   _provider_url() if PROVIDER != "anthropic" else "https://api.anthropic.com",
    }


@router.get("/models")
async def list_models():
    """List available models from Ollama / vLLM / LM Studio."""
    if PROVIDER == "anthropic":
        return {"models": [
            {"id": "claude-sonnet-4-6", "role": "primary"},
            {"id": "claude-opus-4-7",   "role": "reasoning"},
            {"id": "claude-opus-4-7",   "role": "reports"},
        ]}
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{_provider_url()}/v1/models",
                headers={"Authorization": f"Bearer {OPENAI_COMPAT_KEY or 'ollama'}"},
                timeout=5.0,
            )
            if r.status_code == 200:
                data = r.json()
                models = [m["id"] for m in data.get("data", [])]
                return {"models": models, "provider": PROVIDER}
    except Exception as e:
        return {"models": [], "error": str(e)}
    return {"models": []}


@router.post("/chat")
async def chat(req: ChatRequest):
    topics   = _detect_topics(req.message)
    ctx      = await _gather_context(topics)
    system   = SYSTEM_BASE + (f"\n\n--- LIVE DASHBOARD DATA ---\n{ctx}" if ctx else "")
    msgs     = (req.history or [])[-6:]   # fewer history turns = faster on local models
    msgs.append({"role": "user", "content": req.message})
    # Cap tokens lower for local CPU inference to keep response times reasonable
    max_tok = 600 if PROVIDER in ("ollama", "vllm", "lmstudio") else 1800
    response = await _call_ai(msgs, system, max_tokens=max_tok, role=req.role)
    return {"response": response, "topics": topics, "model": _model(req.role), "provider": PROVIDER}


@router.get("/insights")
async def get_insights():
    cached = _cache_get("auto_insights")
    if cached:
        return cached

    async with httpx.AsyncClient() as client:
        space, crypto, defense, oil, regime, treasury, metals = await asyncio.gather(
            _safe_fetch(client, "/api/space/overview"),
            _safe_fetch(client, "/api/crypto/overview"),
            _safe_fetch(client, "/api/defense/overview"),
            _safe_fetch(client, "/api/oil/overview"),
            _safe_fetch(client, "/api/regime/current"),
            _safe_fetch(client, "/api/treasury/overview"),
            _safe_fetch(client, "/api/metals/overview"),
            return_exceptions=True,
        )

    def _s(d) -> str:
        if isinstance(d, dict):
            return json.dumps(d, indent=2)[:900]
        return "{}"

    ctx = (
        f"=== SPACE ===\n{_s(space)}\n\n"
        f"=== CRYPTO ===\n{_s(crypto)}\n\n"
        f"=== DEFENSE ===\n{_s(defense)}\n\n"
        f"=== OIL ===\n{_s(oil)}\n\n"
        f"=== REGIME ===\n{_s(regime)}\n\n"
        f"=== TREASURY ===\n{_s(treasury)}\n\n"
        f"=== METALS ===\n{_s(metals)}"
    )

    prompt = f"""Current dashboard data:
{ctx}

Generate exactly 10 investment insights for today. Return ONLY a valid JSON array — no markdown, no explanation.
Each object must have:
  "title"      : string, max 12 words
  "insight"    : string, 2-3 sentences with specific data
  "category"   : one of ["Macro","Sector","Stock","Crypto","Commodities","Risk","Opportunity","Rotation"]
  "tickers"    : array of 0-3 ticker strings
  "action"     : "BUY" | "SELL" | "MONITOR" | "AVOID"
  "confidence" : integer 60-95
  "horizon"    : "1W" | "1M" | "3M" | "6M"
"""
    raw = await _call_claude(
        [{"role": "user", "content": prompt}],
        "You are a quantitative research analyst. Return only valid JSON array — no other text.",
        max_tokens=2200,
    )
    try:
        txt = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        insights = json.loads(txt)
    except Exception:
        insights = _fallback_insights()

    result = {"insights": insights[:10], "generated_at": datetime.utcnow().isoformat()}
    _cache_set("auto_insights", result)
    return result


@router.get("/pm-command")
async def get_pm_command():
    cached = _cache_get("pm_command")
    if cached:
        return cached

    async with httpx.AsyncClient() as client:
        space, regime, defense, crypto = await asyncio.gather(
            _safe_fetch(client, "/api/space/overview"),
            _safe_fetch(client, "/api/regime/current"),
            _safe_fetch(client, "/api/defense/overview"),
            _safe_fetch(client, "/api/crypto/overview"),
            return_exceptions=True,
        )

    def _s(d) -> str:
        if isinstance(d, dict):
            return json.dumps(d, indent=2)[:600]
        return "{}"

    ctx = f"Space:{_s(space)}\nRegime:{_s(regime)}\nDefense:{_s(defense)}\nCrypto:{_s(crypto)}"

    prompt = f"""Dashboard context:
{ctx}

You are the CIO of a top hedge fund starting your morning. Answer 6 PM command questions based on current market conditions. Return ONLY valid JSON with exactly these keys:
  "what_matters"        : string, 2-3 sentences, most important market development right now
  "smart_money"         : string, 2-3 sentences, where institutional money is moving
  "top_trade"           : object with "ticker", "direction" ("LONG"/"SHORT"), "thesis" (1 sentence), "horizon"
  "top_risks"           : array of exactly 3 risk strings (specific, not generic)
  "accelerating_trends" : array of exactly 3 trend strings (specific, quantified where possible)
  "cycle_positioning"   : string, 2-3 sentences on market cycle phase and recommended positioning
"""
    raw = await _call_claude(
        [{"role": "user", "content": prompt}],
        "You are a hedge fund CIO. Return only valid JSON — no other text.",
        max_tokens=900,
    )
    try:
        txt = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        pm = json.loads(txt)
    except Exception:
        pm = _fallback_pm()

    result = {**pm, "generated_at": datetime.utcnow().isoformat()}
    _cache_set("pm_command", result)
    return result


@router.get("/opportunities")
async def get_opportunities():
    cached = _cache_get("opportunities")
    if cached:
        return cached

    async with httpx.AsyncClient() as client:
        space, defense, crypto, metals = await asyncio.gather(
            _safe_fetch(client, "/api/space/stocks"),
            _safe_fetch(client, "/api/defense/composite"),
            _safe_fetch(client, "/api/crypto/overview"),
            _safe_fetch(client, "/api/metals/overview"),
            return_exceptions=True,
        )

    def _s(d) -> str:
        if isinstance(d, dict):
            return json.dumps(d, indent=2)[:700]
        return "{}"

    ctx = f"Space:{_s(space)}\nDefense:{_s(defense)}\nCrypto:{_s(crypto)}\nMetals:{_s(metals)}"

    prompt = f"""Dashboard data:
{ctx}

Generate 12 ranked investment opportunities across all asset classes. Return ONLY a valid JSON array.
Each object:
  "rank"            : integer 1-12
  "ticker"          : symbol string
  "name"            : full name string
  "category"        : e.g. "Space","Defense","Crypto","AI Infra","Commodities","Macro Trade","ETF"
  "direction"       : "LONG" | "SHORT"
  "signal"          : "STRONG BUY" | "BUY" | "HOLD" | "SELL" | "STRONG SELL"
  "thesis"          : string, 1-2 sentences
  "expected_return" : float (e.g. 18.5 for 18.5%)
  "confidence"      : integer 60-95
  "horizon"         : "1W" | "1M" | "3M" | "6M" | "12M"
  "key_risk"        : string, 1 sentence
"""
    raw = await _call_claude(
        [{"role": "user", "content": prompt}],
        "You are a quant PM. Return only valid JSON array — no other text.",
        max_tokens=2200,
    )
    try:
        txt = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        opps = json.loads(txt)
    except Exception:
        opps = _fallback_opportunities()

    result = {"opportunities": opps[:12], "generated_at": datetime.utcnow().isoformat()}
    _cache_set("opportunities", result)
    return result


# ── Fallbacks (if Claude unavailable) ────────────────────────────────────────

def _fallback_insights():
    return [
        {"title":"AI CapEx Cycle Continues to Accelerate","insight":"Hyperscaler capex guidance elevated — Microsoft, Google, Meta all raised 2025 budgets. GPU demand outpaces supply through H2 2025 with Blackwell ramp.","category":"Sector","tickers":["NVDA","MSFT","META"],"action":"BUY","confidence":82,"horizon":"3M"},
        {"title":"Space Economy Entering Supercycle Phase","insight":"Space economy score 72/100 (Bullish). Starlink subscribers hit 4.2M at $8B+ annual run rate. USSF budget +15% YoY driving defense LEO demand.","category":"Sector","tickers":["RKLB","NOC","PL"],"action":"BUY","confidence":78,"horizon":"6M"},
        {"title":"Defense Spending Structurally Elevated Post-Ukraine","insight":"NATO members accelerating toward 2% GDP defense target. US USSF FY2026 request $30B. Space domain awareness a primary beneficiary.","category":"Sector","tickers":["LMT","NOC","RTX"],"action":"BUY","confidence":80,"horizon":"12M"},
        {"title":"HBM Memory Demand Outpacing Supply Through 2026","insight":"High Bandwidth Memory demand driven by AI training workloads. SK Hynix, Samsung, Micron all at or near capacity. Pricing inflecting higher.","category":"Stock","tickers":["MU","INTC"],"action":"BUY","confidence":75,"horizon":"3M"},
        {"title":"Gold Breaking Out on Central Bank Demand","insight":"Central bank gold purchases hit multi-decade highs as de-dollarization accelerates. Gold above $3,000 with technical breakout on weekly chart.","category":"Commodities","tickers":["GLD","GDX","NEM"],"action":"BUY","confidence":72,"horizon":"6M"},
        {"title":"Yield Curve Re-Steepening Signals Regime Shift","insight":"2s10s spread moving toward positive territory as long-end yields rise. Historically signals late-cycle transition; favor value over growth.","category":"Macro","tickers":["TLT","IWD"],"action":"MONITOR","confidence":68,"horizon":"3M"},
        {"title":"Bitcoin ETF Inflows Accelerating Post-Approval","insight":"Spot Bitcoin ETFs accumulating over $10B net inflows. Institutional adoption curve following gold ETF playbook from 2004-2007.","category":"Crypto","tickers":["BTC","IBIT","GBTC"],"action":"BUY","confidence":70,"horizon":"6M"},
        {"title":"Rare Earth Supply Chain Risk Elevated by China Policy","insight":"China controlling 80%+ of rare earth processing. Export restriction signals increasing. US/Australia/Canada onshoring critical minerals.","category":"Opportunity","tickers":["MP","UUUU","NMP"],"action":"BUY","confidence":74,"horizon":"12M"},
        {"title":"Congressional Buying Concentrated in Defense Contractors","insight":"Recent 13F and congressional disclosure data shows concentrated buying in defense names ahead of supplemental spending bills.","category":"Rotation","tickers":["LMT","RTX","NOC"],"action":"MONITOR","confidence":65,"horizon":"3M"},
        {"title":"Dollar Strength Headwind Fading — EM Opportunity","insight":"DXY appears to be forming a cyclical top as Fed pivot expectations grow. EM equity and currency exposure historically outperforms in dollar downtrends.","category":"Macro","tickers":["EEM","FXI","VWO"],"action":"MONITOR","confidence":63,"horizon":"6M"},
    ]


def _fallback_pm():
    return {
        "what_matters": "AI infrastructure spending continues to dominate the market narrative. Hyperscaler capex revisions are moving higher while GPU supply remains constrained through H2 2025, creating a favorable environment for semiconductor and data center names.",
        "smart_money": "13F data and options flow indicate institutional accumulation in defense, space, and AI infrastructure. RKLB, NOC, and NVDA seeing unusual call activity. Energy sector seeing some rotation out.",
        "top_trade": {"ticker": "RKLB", "direction": "LONG", "thesis": "Neutron development on track, backlog growing 45% YoY, DoD preferred provider; revenue inflection 2026-2027.", "horizon": "12M"},
        "top_risks": [
            "Fed policy error — rates higher for longer compresses growth multiples beyond consensus expectations",
            "AI capex deceleration — if hyperscaler revenue from AI fails to meet projections, capex cuts follow",
            "China geopolitical escalation — Taiwan scenario triggers broad risk-off and supply chain disruption",
        ],
        "accelerating_trends": [
            "Space defense LEO proliferation — USSF SDA Tranche 2 accelerating (+15% YoY)",
            "HBM memory pricing inflection — AI training demand overwhelming supply through 2026",
            "Critical minerals onshoring — US/AU/CA rare earth processing capacity expanding rapidly",
        ],
        "cycle_positioning": "Markets in late-cycle expansion with an AI supercycle overlay. The regime favors quality growth with strong earnings visibility. Positioning: overweight Defense, Space, AI Infrastructure; underweight rate-sensitive Consumer Discretionary and speculative growth.",
    }


def _fallback_opportunities():
    return [
        {"rank":1,"ticker":"RKLB","name":"Rocket Lab USA","category":"Space","direction":"LONG","signal":"STRONG BUY","thesis":"Neutron development on track; backlog +45% YoY; DoD preferred provider entering revenue inflection.","expected_return":38.0,"confidence":88,"horizon":"12M","key_risk":"Neutron development delay or launch failure"},
        {"rank":2,"ticker":"NVDA","name":"NVIDIA Corp","category":"AI Infra","direction":"LONG","signal":"BUY","thesis":"Blackwell GPU ramp driving data center ASP higher; inference demand creating second secular growth leg.","expected_return":22.0,"confidence":82,"horizon":"6M","key_risk":"AI capex deceleration by hyperscalers"},
        {"rank":3,"ticker":"NOC","name":"Northrop Grumman","category":"Defense","direction":"LONG","signal":"BUY","thesis":"USSF #1 space contractor; SDA + OPIR + B-21 backlog growing at 12% annually.","expected_return":16.0,"confidence":84,"horizon":"12M","key_risk":"Defense budget sequestration"},
        {"rank":4,"ticker":"GLD","name":"SPDR Gold Trust","category":"Commodities","direction":"LONG","signal":"BUY","thesis":"Central bank buying at multi-decade highs; technical breakout above $3,000; de-dollarization tailwind.","expected_return":14.0,"confidence":78,"horizon":"6M","key_risk":"Dollar strengthening on Fed hawkishness"},
        {"rank":5,"ticker":"MU","name":"Micron Technology","category":"Stock","direction":"LONG","signal":"BUY","thesis":"HBM3E supply constrained with NVIDIA sole customer; DRAM pricing in upcycle; EPS estimates moving higher.","expected_return":28.0,"confidence":76,"horizon":"6M","key_risk":"China market access restrictions"},
        {"rank":6,"ticker":"IBIT","name":"iShares Bitcoin ETF","category":"Crypto","direction":"LONG","signal":"BUY","thesis":"Institutional ETF inflows following gold ETF playbook; halving supply reduction; macro tailwind from dollar weakness.","expected_return":45.0,"confidence":65,"horizon":"6M","key_risk":"Regulatory crackdown or exchange failure"},
        {"rank":7,"ticker":"MP","name":"MP Materials","category":"Commodities","direction":"LONG","signal":"BUY","thesis":"Only US rare earth miner; China export restriction beneficiary; DoD offtake agreement provides floor.","expected_return":32.0,"confidence":72,"horizon":"12M","key_risk":"Rare earth price decline or Chinese retaliation"},
        {"rank":8,"ticker":"PL","name":"Planet Labs","category":"Space","direction":"LONG","signal":"BUY","thesis":"Daily Earth observation monopoly; AI analytics revenue layer; government surveillance contract expansion.","expected_return":35.0,"confidence":70,"horizon":"12M","key_risk":"Competition from commercial constellations"},
        {"rank":9,"ticker":"LMT","name":"Lockheed Martin","category":"Defense","direction":"LONG","signal":"BUY","thesis":"F-35 multi-decade production; hypersonic missile backlog; NATO spend catch-up beneficiary.","expected_return":13.0,"confidence":82,"horizon":"12M","key_risk":"Cost overrun on fixed-price contracts"},
        {"rank":10,"ticker":"IRDM","name":"Iridium Communications","category":"Space","direction":"LONG","signal":"BUY","thesis":"Sole L-Band LEO provider; Apple/IoT subscription moat; 3x PE re-rate as direct-to-device launches.","expected_return":22.0,"confidence":74,"horizon":"12M","key_risk":"SpaceX LEO subscription competition"},
        {"rank":11,"ticker":"TLT","name":"iShares 20yr Treasury","category":"Macro Trade","direction":"SHORT","signal":"SELL","thesis":"Long-end yield pressure from fiscal deficit + term premium normalization; duration risk underpriced.","expected_return":12.0,"confidence":65,"horizon":"3M","key_risk":"Fed pivot + flight-to-safety from risk-off"},
        {"rank":12,"ticker":"GDX","name":"VanEck Gold Miners","category":"Commodities","direction":"LONG","signal":"BUY","thesis":"Leveraged play on gold breakout; miners trading at multi-year discount to spot; margin expansion from lower energy costs.","expected_return":25.0,"confidence":68,"horizon":"6M","key_risk":"Operational disruption and cost inflation"},
    ]

"""AI Compute Infrastructure Intelligence Platform — GPU, CPU, Hyperscaler, Memory, Foundry, Signals"""
from fastapi import APIRouter
import yfinance as yf
import pandas as np_pd
import numpy as np
from datetime import datetime
import time, logging

logger = logging.getLogger(__name__)
router = APIRouter()

_cache: dict = {}
CACHE_TTL = 1800  # 30 min


def _get(k):
    v = _cache.get(k)
    return v["data"] if v and time.time() - v["ts"] < CACHE_TTL else None


def _set(k, data):
    _cache[k] = {"ts": time.time(), "data": data}


# ── Universe ──────────────────────────────────────────────────────────────────

AI_STOCKS = {
    "NVDA": {"name": "NVIDIA",            "cat": "GPU",         "sub": "AI GPU Leader"},
    "AMD":  {"name": "AMD",               "cat": "GPU",         "sub": "GPU / CPU"},
    "INTC": {"name": "Intel",             "cat": "CPU",         "sub": "CPU / IFS"},
    "ARM":  {"name": "Arm Holdings",      "cat": "CPU",         "sub": "CPU Architecture IP"},
    "QCOM": {"name": "Qualcomm",          "cat": "CPU",         "sub": "Edge AI / Mobile"},
    "TSM":  {"name": "TSMC",              "cat": "Foundry",     "sub": "Leading-Edge Foundry"},
    "AVGO": {"name": "Broadcom",          "cat": "Networking",  "sub": "AI Networking / ASIC"},
    "ANET": {"name": "Arista Networks",   "cat": "Networking",  "sub": "Cloud Networking"},
    "MRVL": {"name": "Marvell",           "cat": "Networking",  "sub": "Custom AI Silicon"},
    "SMCI": {"name": "Super Micro",       "cat": "Servers",     "sub": "AI Server Systems"},
    "DELL": {"name": "Dell",              "cat": "Servers",     "sub": "Enterprise AI Servers"},
    "HPE":  {"name": "HPE",               "cat": "Servers",     "sub": "Server Infrastructure"},
    "MU":   {"name": "Micron",            "cat": "Memory",      "sub": "HBM / DRAM / NAND"},
    "MSFT": {"name": "Microsoft",         "cat": "Hyperscaler", "sub": "Azure / OpenAI"},
    "AMZN": {"name": "Amazon",            "cat": "Hyperscaler", "sub": "AWS"},
    "GOOGL":{"name": "Alphabet",          "cat": "Hyperscaler", "sub": "Google Cloud / TPU"},
    "META": {"name": "Meta",              "cat": "Hyperscaler", "sub": "AI Infrastructure"},
    "ORCL": {"name": "Oracle",            "cat": "Hyperscaler", "sub": "OCI Cloud"},
    "LRCX": {"name": "Lam Research",      "cat": "Equipment",   "sub": "Etch / Deposition"},
    "AMAT": {"name": "Applied Materials", "cat": "Equipment",   "sub": "Semiconductor Equip"},
    "KLAC": {"name": "KLA Corp",          "cat": "Equipment",   "sub": "Process Control"},
    "ASML": {"name": "ASML",              "cat": "Equipment",   "sub": "EUV Lithography"},
}

CATEGORY_WEIGHTS = {
    "GPU": 0.25, "Hyperscaler": 0.20, "Networking": 0.15,
    "Memory": 0.10, "Foundry": 0.10, "Servers": 0.10,
    "CPU": 0.05, "Equipment": 0.05,
}

BENCHMARK = "SPY"

# ── Hyperscaler Capex (from public earnings reports) ─────────────────────────

HYPERSCALER_CAPEX = {
    "MSFT": {
        "name": "Microsoft Azure", "color": "#0078d4",
        "quarters": ["Q1-24","Q2-24","Q3-24","Q4-24","Q1-25","Q2-25","Q3-25","Q4-25","Q1-26","Q2-26"],
        "capex":    [11.5,   13.9,   14.0,   19.0,   21.4,   22.6,   21.4,   16.0,   20.5,  22.0],
        "ai_pct":  [55,     60,     62,     65,     70,     72,     70,     70,     72,    74],
        "capex_guide_2025_bn": 80.0, "capex_guide_2026_bn": 88.0,
        "gpu_vendor": "NVDA primary; Azure-custom ASIC in development",
    },
    "AMZN": {
        "name": "Amazon AWS", "color": "#ff9900",
        "quarters": ["Q1-24","Q2-24","Q3-24","Q4-24","Q1-25","Q2-25","Q3-25","Q4-25","Q1-26","Q2-26"],
        "capex":    [14.9,   17.6,   22.6,   26.3,   24.3,   26.5,   27.5,   29.0,   28.0,  30.0],
        "ai_pct":  [50,     55,     58,     62,     65,     68,     70,     72,     74,    75],
        "capex_guide_2025_bn": 105.0, "capex_guide_2026_bn": 115.0,
        "gpu_vendor": "NVDA + Trainium2 (custom) + Inferentia3",
    },
    "GOOGL": {
        "name": "Google Cloud", "color": "#4285f4",
        "quarters": ["Q1-24","Q2-24","Q3-24","Q4-24","Q1-25","Q2-25","Q3-25","Q4-25","Q1-26","Q2-26"],
        "capex":    [12.0,   13.2,   13.1,   14.3,   17.2,   17.1,   18.0,   17.0,   18.5,  19.5],
        "ai_pct":  [50,     55,     58,     62,     65,     68,     70,     70,     72,    74],
        "capex_guide_2025_bn": 75.0, "capex_guide_2026_bn": 80.0,
        "gpu_vendor": "NVDA + TPUv5/v6 (custom); heaviest custom silicon use",
    },
    "META": {
        "name": "Meta AI Infra", "color": "#0668e1",
        "quarters": ["Q1-24","Q2-24","Q3-24","Q4-24","Q1-25","Q2-25","Q3-25","Q4-25","Q1-26","Q2-26"],
        "capex":    [6.7,    8.4,    9.2,    11.0,   13.7,   14.8,   15.0,   15.5,   17.0,  18.5],
        "ai_pct":  [60,     65,     68,     72,     75,     78,     80,     82,     84,    86],
        "capex_guide_2025_bn": 62.0, "capex_guide_2026_bn": 72.0,
        "gpu_vendor": "NVDA H100/B200; Llama MTIA custom ASIC (future)",
    },
    "ORCL": {
        "name": "Oracle OCI", "color": "#c74634",
        "quarters": ["Q1-24","Q2-24","Q3-24","Q4-24","Q1-25","Q2-25","Q3-25","Q4-25","Q1-26","Q2-26"],
        "capex":    [1.8,    2.1,    2.4,    3.1,    4.2,    5.0,    5.4,    5.8,    6.5,   7.2],
        "ai_pct":  [55,     60,     65,     70,     75,     78,     80,     82,     84,    86],
        "capex_guide_2025_bn": 22.0, "capex_guide_2026_bn": 28.0,
        "gpu_vendor": "NVDA GB200 NVL72 clusters; fastest growing hyperscaler",
    },
}

# ── GPU Product Intelligence ──────────────────────────────────────────────────

GPU_PRODUCTS = {
    "NVDA": {
        "name": "NVIDIA", "color": "#76b900", "gpu_score": 88, "supply_tightness": 74,
        "products": [
            {"name":"H100 SXM5",   "status":"Production","asp_k":30,"lead_wk":4,  "demand":"Moderate",    "note":"Volume shipment; transitioning to Blackwell"},
            {"name":"H200 SXM5",   "status":"Production","asp_k":35,"lead_wk":8,  "demand":"Strong",      "note":"Primary MSFT/Google H2 2024 choice"},
            {"name":"B100",        "status":"Production","asp_k":35,"lead_wk":12, "demand":"Strong",      "note":"Blackwell mainstream; replacing H100"},
            {"name":"B200",        "status":"Production","asp_k":40,"lead_wk":16, "demand":"Very Strong", "note":"Leading hyperscaler AI training GPU"},
            {"name":"GB200 NVL72", "status":"Ramping",   "asp_k":60,"lead_wk":20, "demand":"Constrained", "note":"CoWoS-L limited; rack-scale system; sold out"},
            {"name":"GB300 NVL72", "status":"Announced", "asp_k":80,"lead_wk":None,"demand":"Future",     "note":"2026 launch; HBM4 upgrade; 1.5× perf vs GB200"},
        ],
    },
    "AMD": {
        "name": "AMD", "color": "#ed1c24", "gpu_score": 62, "supply_tightness": 40,
        "products": [
            {"name":"MI300X",  "status":"Production","asp_k":15,"lead_wk":8,  "demand":"Strong",  "note":"MSFT & Meta deployments; strong inferencing perf"},
            {"name":"MI325X",  "status":"Production","asp_k":17,"lead_wk":10, "demand":"Strong",  "note":"HBM3E upgrade; 288GB capacity; competitive pricing"},
            {"name":"MI350X",  "status":"Ramping",   "asp_k":20,"lead_wk":14, "demand":"Growing", "note":"CDNA 4; TSMC N3; 2× AI perf vs MI300X"},
            {"name":"MI400",   "status":"Announced", "asp_k":25,"lead_wk":None,"demand":"Future", "note":"2026; HBM4; targeting NVDA Blackwell successor"},
        ],
    },
    "INTC": {
        "name": "Intel Gaudi", "color": "#0071c5", "gpu_score": 18, "supply_tightness": 12,
        "products": [
            {"name":"Gaudi 2", "status":"Production","asp_k":9, "lead_wk":4, "demand":"Weak",     "note":"Limited ecosystem; ~5% AI accelerator market share"},
            {"name":"Gaudi 3", "status":"Production","asp_k":12,"lead_wk":6, "demand":"Moderate", "note":"Perf improved; losing ground to NVDA/AMD rapidly"},
        ],
    },
}

# ── Memory Intelligence ────────────────────────────────────────────────────────

MEMORY_TIERS = [
    {"name":"HBM3E",    "cat":"HBM",  "status":"Production",  "supplier":"SK Hynix dominant","util":96,"tightness":"Very Tight","price_trend":"Rising",   "note":"Sold out through 2025; $35-40/GB; constraining NVDA B200"},
    {"name":"HBM3",     "cat":"HBM",  "status":"Production",  "supplier":"SK Hynix/Micron/Samsung","util":88,"tightness":"Tight","price_trend":"Stable",   "note":"Transitioning; GPU transition to HBM3E accelerating"},
    {"name":"HBM4",     "cat":"HBM",  "status":"Dev/Sample",  "supplier":"SK Hynix / Samsung","util":None,"tightness":"N/A","price_trend":"Future",   "note":"2026 ramp; 4× bandwidth vs HBM3E; NVDA GB300 target"},
    {"name":"DDR5 32GB","cat":"DRAM", "status":"Production",  "supplier":"Micron/Samsung/SK Hynix","util":72,"tightness":"Balanced","price_trend":"Stable","note":"Server refresh cycle ongoing; AI server uplift"},
    {"name":"DDR4 16GB","cat":"DRAM", "status":"Production",  "supplier":"All vendors",        "util":64,"tightness":"Loose","price_trend":"Declining","note":"Legacy; migrating to DDR5 for AI deployments"},
    {"name":"LPDDR5X",  "cat":"DRAM", "status":"Production",  "supplier":"Samsung/SK Hynix",   "util":68,"tightness":"Balanced","price_trend":"Stable","note":"Mobile/edge AI push; Apple M-series demand driver"},
    {"name":"TLC NAND", "cat":"NAND", "status":"Production",  "supplier":"Samsung/Kioxia/Micron","util":72,"tightness":"Balanced","price_trend":"Recovering","note":"AI training data lakes + vector DB driving enterprise demand"},
]

# ── Foundry Intelligence ──────────────────────────────────────────────────────

FOUNDRY_NODES = {
    "TSM": {
        "name": "TSMC",
        "constraint_score": 86,
        "nodes": [
            {"node":"N3/N3E",    "util":95,"clients":"Apple, NVDA Blackwell, AMD EPYC",   "status":"Sold Out",        "cowos":False},
            {"node":"N4/N4P",    "util":90,"clients":"NVDA, AMD, QCOM, MediaTek",         "status":"Very Tight",      "cowos":False},
            {"node":"N5",        "util":85,"clients":"Apple, AMD RDNA, QCOM",             "status":"Tight",           "cowos":False},
            {"node":"N2",        "util":80,"clients":"Apple (lead), NVDA Rubin (future)", "status":"Ramping",         "cowos":False},
            {"node":"CoWoS-S",   "util":98,"clients":"NVDA H100/H200/B100, AMD MI300",    "status":"Critically Tight","cowos":True},
            {"node":"CoWoS-L",   "util":94,"clients":"NVDA GB200 NVL72",                  "status":"Very Tight",      "cowos":True},
            {"node":"SoIC (3D)", "util":82,"clients":"Apple SiP, NVDA HBM stacking",      "status":"Tight",           "cowos":True},
        ],
    },
}

# ── Scenarios ─────────────────────────────────────────────────────────────────

SCENARIOS = [
    {
        "id":"ai_surge", "name":"AI Demand Surge", "color":"#22c55e", "prob":25,
        "desc":"GenAI adoption accelerates 2× faster than consensus; enterprise AI capex doubles in 2025-26",
        "impacts":{"NVDA":{"rev":+35,"eps":+40,"stk":+50},"AMD":{"rev":+25,"eps":+30,"stk":+35},
                   "TSM":{"rev":+18,"eps":+22,"stk":+25},"MU":{"rev":+40,"eps":+60,"stk":+45},
                   "AVGO":{"rev":+20,"eps":+25,"stk":+28},"SMCI":{"rev":+45,"eps":+50,"stk":+55},
                   "ANET":{"rev":+22,"eps":+27,"stk":+28},"MRVL":{"rev":+30,"eps":+35,"stk":+38}},
    },
    {
        "id":"capex_up", "name":"Hyperscaler Capex +30%", "color":"#6366f1", "prob":30,
        "desc":"Cloud providers raise AI capex 30% above current consensus through 2026",
        "impacts":{"NVDA":{"rev":+20,"eps":+25,"stk":+30},"AMD":{"rev":+15,"eps":+18,"stk":+20},
                   "TSM":{"rev":+10,"eps":+12,"stk":+15},"MU":{"rev":+25,"eps":+35,"stk":+28},
                   "AVGO":{"rev":+18,"eps":+22,"stk":+20},"ANET":{"rev":+22,"eps":+25,"stk":+25},
                   "SMCI":{"rev":+28,"eps":+32,"stk":+30},"LRCX":{"rev":+12,"eps":+14,"stk":+15}},
    },
    {
        "id":"china_ban", "name":"Full China Export Ban", "color":"#ef4444", "prob":35,
        "desc":"US eliminates all AI chip exports to China; NVDA loses ~$12B annual revenue",
        "impacts":{"NVDA":{"rev":-15,"eps":-18,"stk":-20},"AMD":{"rev":-8,"eps":-10,"stk":-12},
                   "INTC":{"rev":-5,"eps":-6,"stk":-8},"LRCX":{"rev":-20,"eps":-25,"stk":-22},
                   "AMAT":{"rev":-18,"eps":-22,"stk":-20},"KLAC":{"rev":-15,"eps":-18,"stk":-16},
                   "ASML":{"rev":-12,"eps":-14,"stk":-15},"TSM":{"rev":-3,"eps":-4,"stk":-5}},
    },
    {
        "id":"hbm_shortage", "name":"Severe HBM3E Shortage", "color":"#f59e0b", "prob":20,
        "desc":"HBM3E supply falls 30% short of demand; GPU shipments constrained through H1-2026",
        "impacts":{"NVDA":{"rev":-8,"eps":-10,"stk":-12},"AMD":{"rev":-12,"eps":-15,"stk":-15},
                   "MU":{"rev":+30,"eps":+50,"stk":+40},"TSM":{"rev":+5,"eps":+6,"stk":+8},
                   "SMCI":{"rev":-15,"eps":-18,"stk":-20},"DELL":{"rev":-8,"eps":-10,"stk":-12}},
    },
    {
        "id":"ai_slowdown", "name":"AI ROI Disappointment", "color":"#f87171", "prob":20,
        "desc":"Enterprise AI ROI fails to materialize; hyperscalers cut 2026 capex by 20%",
        "impacts":{"NVDA":{"rev":-25,"eps":-30,"stk":-35},"AMD":{"rev":-18,"eps":-22,"stk":-25},
                   "SMCI":{"rev":-30,"eps":-35,"stk":-40},"MU":{"rev":-20,"eps":-30,"stk":-28},
                   "ANET":{"rev":-12,"eps":-15,"stk":-18},"DELL":{"rev":-15,"eps":-18,"stk":-20},
                   "AVGO":{"rev":-10,"eps":-12,"stk":-14},"TSM":{"rev":-8,"eps":-10,"stk":-12}},
    },
    {
        "id":"recession", "name":"Global Recession", "color":"#dc2626", "prob":15,
        "desc":"Economic slowdown forces enterprise IT budget cuts and delayed AI deployment cycles",
        "impacts":{"NVDA":{"rev":-15,"eps":-18,"stk":-25},"AMD":{"rev":-20,"eps":-25,"stk":-30},
                   "INTC":{"rev":-18,"eps":-22,"stk":-25},"SMCI":{"rev":-25,"eps":-30,"stk":-35},
                   "MU":{"rev":-30,"eps":-50,"stk":-40},"DELL":{"rev":-15,"eps":-18,"stk":-20},
                   "AMAT":{"rev":-22,"eps":-28,"stk":-25},"LRCX":{"rev":-25,"eps":-32,"stk":-28}},
    },
]

KEY_RISKS = [
    "HBM3E supply critically tight through H2 2025 — constraining Blackwell GPU shipments",
    "CoWoS packaging capacity limiting NVDA GB200 NVL72 rack shipment velocity",
    "China AI chip export restriction expansion risk (AI chips rule tightening)",
    "Hyperscaler ROI debate — could trigger 2026 capex guidance cuts",
    "NVDA Blackwell yield improvement risk at TSMC N3E — execution critical",
    "AMD MI350 ramp velocity vs NVDA Blackwell installed base lock-in",
    "Data center power grid constraints in US/EU limiting new builds",
    "SMCI accounting/supply-chain execution concerns",
    "Potential antitrust scrutiny of NVDA CUDA + NVLink ecosystem lock-in",
    "ASML EUV delivery schedule delays to TSMC could slow N2 node ramp",
]


# ── Computation helpers ───────────────────────────────────────────────────────

def _rsi(prices: list, period: int = 14) -> float:
    if len(prices) < period + 1:
        return 50.0
    deltas = [prices[i] - prices[i - 1] for i in range(1, len(prices))]
    recent = deltas[-period:]
    avg_g = sum(d for d in recent if d > 0) / period
    avg_l = sum(-d for d in recent if d < 0) / period
    if avg_l == 0:
        return 100.0
    return round(100 - 100 / (1 + avg_g / avg_l), 1)


def _ret(prices: list, n: int) -> float:
    if len(prices) < n + 1:
        return 0.0
    ref = prices[-(n + 1)]
    return 0.0 if ref == 0 else (prices[-1] - ref) / ref


def _momentum_score(rel_3m: float) -> float:
    return round(min(100, max(0, 50 + rel_3m * 167)), 1)


def _signal(rsi: float, above_50: bool, above_200: bool, rel_3m: float):
    if rsi < 35 and above_200 and rel_3m > -0.05:
        return "Strong Buy", "#22c55e", 85
    if rsi < 50 and above_200 and rel_3m > -0.10:
        return "Buy",        "#86efac", 72
    if rsi > 72 and not above_200:
        return "Sell",       "#ef4444", 68
    if rsi > 72:
        return "Reduce",     "#f87171", 62
    if not above_200:
        return "Avoid",      "#f87171", 60
    if not above_50:
        return "Caution",    "#f59e0b", 55
    return "Hold",           "#94a3b8", 50


def _regime(score: float):
    if score >= 80: return "AI Supercycle", "#22c55e"
    if score >= 65: return "AI Boom",       "#86efac"
    if score >= 50: return "Expansion",     "#6366f1"
    if score >= 38: return "Normalization", "#f59e0b"
    if score >= 25: return "Slowdown",      "#f87171"
    return "Contraction", "#ef4444"


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.get("/overview")
def get_ai_compute_overview():
    cached = _get("ai_compute_overview")
    if cached:
        return cached

    tickers = list(AI_STOCKS.keys()) + [BENCHMARK]
    try:
        import pandas as pd
        raw = yf.download(tickers, period="1y", auto_adjust=True, progress=False, threads=True)
        closes = raw["Close"] if "Close" in raw.columns else raw
        if not isinstance(closes, pd.DataFrame):
            closes = pd.DataFrame()
    except Exception as e:
        logger.error(f"AI Compute yfinance error: {e}")
        import pandas as pd
        closes = pd.DataFrame()

    spy_prices = closes[BENCHMARK].dropna().tolist() if BENCHMARK in closes.columns else []

    stocks = []
    cat_scores: dict = {k: [] for k in CATEGORY_WEIGHTS}

    for ticker, meta in AI_STOCKS.items():
        if ticker not in closes.columns:
            continue
        prices = closes[ticker].dropna().tolist()
        if len(prices) < 10:
            continue

        cur   = float(prices[-1])
        ma50  = float(np.mean(prices[-50:])) if len(prices) >= 50 else cur
        ma200 = float(np.mean(prices[-200:])) if len(prices) >= 200 else cur
        above_50  = cur > ma50
        above_200 = cur > ma200

        rsi_v = _rsi(prices)
        d1  = _ret(prices, 1)
        w1  = _ret(prices, 5)
        m1  = _ret(prices, 21)
        m3  = _ret(prices, 63)
        ytd = _ret(prices, min(len(prices) - 1, 125))

        spy_m3 = _ret(spy_prices, 63) if len(spy_prices) >= 64 else 0.0
        rel_3m = m3 - spy_m3

        sig, sig_col, conf = _signal(rsi_v, above_50, above_200, rel_3m)
        strength = _momentum_score(rel_3m)

        cat = meta["cat"]
        if cat in cat_scores:
            cat_scores[cat].append(strength)

        if sig in ("Strong Buy", "Buy"):
            stop   = round(cur * 0.92, 2)
            upside_r = min(0.40, max(0.10, rel_3m + 0.20))
            target = round(cur * (1 + upside_r), 2)
            upside = round(upside_r * 100, 1)
        else:
            stop = target = upside = None

        stocks.append({
            "ticker": ticker, "name": meta["name"],
            "cat": cat, "sub": meta["sub"],
            "price": round(cur, 2),
            "d1": round(d1, 4), "w1": round(w1, 4),
            "m1": round(m1, 4), "m3": round(m3, 4), "ytd": round(ytd, 4),
            "rsi": rsi_v, "above_50": above_50, "above_200": above_200,
            "rel_3m": round(rel_3m, 4),
            "signal": sig, "sig_color": sig_col, "conf": conf,
            "strength": strength,
            "stop": stop, "target": target, "upside": upside,
            "ma50": round(ma50, 2), "ma200": round(ma200, 2),
        })

    sub_scores = {
        cat: round(float(np.mean(vals)), 1) if vals else 50.0
        for cat, vals in cat_scores.items()
    }
    composite = round(min(100, max(0, sum(sub_scores.get(c, 50) * w for c, w in CATEGORY_WEIGHTS.items()))), 1)
    regime_label, regime_color = _regime(composite)

    best_longs = sorted(
        [s for s in stocks if s["signal"] in ("Strong Buy", "Buy")],
        key=lambda x: x["strength"], reverse=True
    )[:6]

    result = {
        "score": composite,
        "regime": regime_label,
        "regime_color": regime_color,
        "sub_scores": sub_scores,
        "stocks": sorted(stocks, key=lambda x: x["strength"], reverse=True),
        "best_longs": best_longs,
        "key_risks": KEY_RISKS,
        "hyperscaler_capex": HYPERSCALER_CAPEX,
        "gpu_products": GPU_PRODUCTS,
        "memory_tiers": MEMORY_TIERS,
        "foundry_nodes": FOUNDRY_NODES,
        "scenarios": SCENARIOS,
        "as_of": datetime.today().strftime("%Y-%m-%d"),
    }
    _set("ai_compute_overview", result)
    return result

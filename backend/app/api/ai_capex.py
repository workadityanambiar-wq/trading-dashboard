"""GET /api/ai-capex — AI CapEx Intelligence Dashboard."""
from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import yfinance as yf
from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter()

_CACHE: Dict[str, Tuple[float, Any]] = {}
_CACHE_TTL = 6 * 3600


def _cache_get(key: str) -> Optional[Any]:
    if key in _CACHE:
        ts, v = _CACHE[key]
        if time.time() - ts < _CACHE_TTL:
            return v
    return None


def _cache_set(key: str, v: Any) -> None:
    _CACHE[key] = (time.time(), v)


# ── Universe ──────────────────────────────────────────────────────────────────

HYPERSCALERS: Dict[str, Dict] = {
    "MSFT": {"name": "Microsoft",  "cloud": "Azure / AI Cloud"},
    "AMZN": {"name": "Amazon",     "cloud": "AWS"},
    "GOOGL": {"name": "Alphabet",  "cloud": "Google Cloud / TPU"},
    "META": {"name": "Meta",       "cloud": "AI Data Centers"},
    "ORCL": {"name": "Oracle",     "cloud": "OCI"},
}

AI_STOCKS: Dict[str, Dict] = {
    "NVDA": {"name": "Nvidia",              "sector": "Compute",    "ai_pct": 95, "sub": "H100/H200/B200 GPU"},
    "AMD":  {"name": "AMD",                 "sector": "Compute",    "ai_pct": 50, "sub": "MI300X/MI350 GPU"},
    "AVGO": {"name": "Broadcom",            "sector": "Networking", "ai_pct": 65, "sub": "AI ASIC / XPU"},
    "MU":   {"name": "Micron",              "sector": "Memory",     "ai_pct": 70, "sub": "HBM3E / DRAM"},
    "TSM":  {"name": "TSMC",                "sector": "Foundry",    "ai_pct": 75, "sub": "N3 / N2 Advanced Node"},
    "AMAT": {"name": "Applied Materials",   "sector": "Equipment",  "ai_pct": 55, "sub": "CVD / Etch Systems"},
    "LRCX": {"name": "Lam Research",        "sector": "Equipment",  "ai_pct": 55, "sub": "Etch / Deposition"},
    "ASML": {"name": "ASML",                "sector": "Equipment",  "ai_pct": 70, "sub": "EUV / High-NA"},
    "ANET": {"name": "Arista Networks",     "sector": "Networking", "ai_pct": 70, "sub": "DC Ethernet 800G"},
    "MRVL": {"name": "Marvell",             "sector": "Networking", "ai_pct": 75, "sub": "Custom AI ASIC"},
    "CSCO": {"name": "Cisco",               "sector": "Networking", "ai_pct": 30, "sub": "Enterprise / AI Net"},
    "VRT":  {"name": "Vertiv",              "sector": "Power",      "ai_pct": 85, "sub": "Cooling / UPS / PDU"},
    "ETN":  {"name": "Eaton",               "sector": "Power",      "ai_pct": 40, "sub": "Power Management"},
    "SMCI": {"name": "Supermicro",          "sector": "Servers",    "ai_pct": 90, "sub": "AI Servers / DGX"},
    "DELL": {"name": "Dell Technologies",   "sector": "Servers",    "ai_pct": 45, "sub": "PowerEdge AI Servers"},
}

BENCHMARK = "SMH"


def _safe(v, default=None):
    try:
        f = float(v)
        return None if (pd.isna(f) or np.isinf(f)) else f
    except Exception:
        return default


def _pct(a, b):
    if a is not None and b is not None and b != 0:
        return (a - b) / abs(b) * 100.0
    return None


# ── Per-ticker data fetch ─────────────────────────────────────────────────────

def _fetch_one(sym: str) -> Dict:
    out: Dict[str, Any] = {"sym": sym}
    try:
        t = yf.Ticker(sym)

        # Price history
        hist = t.history(period="1y")
        if not hist.empty:
            closes = hist["Close"]
            n = len(closes)
            px = _safe(closes.iloc[-1])
            out["price"] = px
            out["chg_1m"]   = _pct(px, _safe(closes.iloc[-22])  if n >= 22  else None)
            out["chg_3m"]   = _pct(px, _safe(closes.iloc[-66])  if n >= 66  else None)
            out["chg_6m"]   = _pct(px, _safe(closes.iloc[-126]) if n >= 126 else None)
            out["chg_1y"]   = _pct(px, _safe(closes.iloc[0]))
            out["high_52w"] = _safe(hist["High"].max())
            out["low_52w"]  = _safe(hist["Low"].min())

        # Fundamentals
        info = t.info or {}
        out["mktcap_bn"]    = (_safe(info.get("marketCap", 0), 0)) / 1e9
        out["pe_fwd"]       = _safe(info.get("forwardPE"))
        out["pe_ttm"]       = _safe(info.get("trailingPE"))
        out["rev_growth"]   = _safe(info.get("revenueGrowth"))
        out["eps_growth"]   = _safe(info.get("earningsGrowth"))
        out["short_pct"]    = _safe(info.get("shortPercentOfFloat"))
        out["target_price"] = _safe(info.get("targetMeanPrice"))
        out["analyst_rec"]  = info.get("recommendationKey", "")

        # Quarterly CapEx from cash flow statement
        try:
            cf = t.quarterly_cashflow
            if cf is not None and not cf.empty:
                capex_key = next(
                    (r for r in cf.index if "capital" in r.lower()
                     and ("expend" in r.lower() or "expenditure" in r.lower())),
                    None,
                )
                if capex_key:
                    s = cf.loc[capex_key]
                    dates = sorted(s.index)
                    vals = [(str(d)[:10], _safe(s[d])) for d in dates]
                    vals = [(d, abs(v)) for d, v in vals if v is not None]
                    out["capex_quarterly"] = [{"date": d, "capex_bn": v / 1e9} for d, v in vals]
                    if vals:
                        out["capex_latest_bn"] = vals[-1][1] / 1e9
                        if len(vals) >= 5:
                            out["capex_yoy"] = _pct(vals[-1][1], vals[-5][1])
                        last4 = [v for _, v in vals[-4:]]
                        if len(last4) == 4:
                            out["capex_annual_bn"] = sum(last4) / 1e9
        except Exception as e:
            logger.debug(f"CapEx {sym}: {e}")

        # Quarterly revenue from income statement
        try:
            fin = t.quarterly_financials
            if fin is not None and not fin.empty:
                rev_key = next(
                    (r for r in fin.index if "total revenue" in r.lower()),
                    None,
                )
                if not rev_key:
                    rev_key = next((r for r in fin.index if "revenue" in r.lower()), None)
                if rev_key:
                    s = fin.loc[rev_key]
                    dates = sorted(s.index)
                    vals = [(str(d)[:10], _safe(s[d])) for d in dates]
                    vals = [(d, v) for d, v in vals if v is not None]
                    out["rev_quarterly"] = [{"date": d, "rev_bn": v / 1e9} for d, v in vals]
                    if vals:
                        out["rev_latest_bn"] = vals[-1][1] / 1e9
                        if len(vals) >= 5:
                            out["rev_yoy"] = _pct(vals[-1][1], vals[-5][1])
        except Exception as e:
            logger.debug(f"Revenue {sym}: {e}")

    except Exception as e:
        logger.warning(f"Fetch failed {sym}: {e}")
        out["error"] = str(e)

    return out


def _fetch_all(tickers: List[str]) -> Dict[str, Dict]:
    results: Dict[str, Dict] = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        futs = {pool.submit(_fetch_one, sym): sym for sym in tickers}
        for fut in as_completed(futs):
            sym = futs[fut]
            try:
                results[sym] = fut.result()
            except Exception as e:
                logger.warning(f"Future {sym}: {e}")
                results[sym] = {"sym": sym}
    return results


# ── Score engine ──────────────────────────────────────────────────────────────

def _growth(d: Dict, fallback: float) -> float:
    g = d.get("capex_yoy") or d.get("rev_yoy") or (d.get("rev_growth") or 0) * 100
    return float(g) if g else fallback


def _capex_score(raw: Dict[str, Dict]) -> Dict:
    # Component 1 – Hyperscaler CapEx growth (30 pts)
    hyper_yoy = float(np.mean([_growth(raw.get(s, {}), 50) for s in ["MSFT", "AMZN", "GOOGL", "META"]]))
    h_score = min(30.0, max(0.0, hyper_yoy / 100.0 * 30.0))

    # Component 2 – GPU demand via NVDA revenue (20 pts)
    nvda_g = _growth(raw.get("NVDA", {}), 120)
    g_score = min(20.0, max(0.0, nvda_g / 200.0 * 20.0))

    # Component 3 – Data center infra (15 pts)
    dc_yoy = float(np.mean([_growth(raw.get(s, {}), 40) for s in ["VRT", "SMCI", "DELL"]]))
    d_score = min(15.0, max(0.0, dc_yoy / 80.0 * 15.0))

    # Component 4 – Memory via MU (10 pts)
    mu_g = _growth(raw.get("MU", {}), 60)
    m_score = min(10.0, max(0.0, mu_g / 100.0 * 10.0))

    # Component 5 – Cloud via MSFT+GOOGL revenue (10 pts)
    cloud_yoy = float(np.mean([_growth(raw.get(s, {}), 15) for s in ["MSFT", "GOOGL"]]))
    c_score = min(10.0, max(0.0, cloud_yoy / 25.0 * 10.0))

    # Component 6 – Power infra (5 pts)
    power_yoy = float(np.mean([_growth(raw.get(s, {}), 20) for s in ["VRT", "ETN"]]))
    p_score = min(5.0, max(0.0, power_yoy / 40.0 * 5.0))

    # Component 7 – Institutional flow via SMH momentum (10 pts)
    smh_6m = raw.get(BENCHMARK, {}).get("chg_6m") or 15.0
    i_score = min(10.0, max(0.0, float(smh_6m) / 30.0 * 10.0))

    composite = round(min(100.0, max(0.0, h_score + g_score + d_score + m_score + c_score + p_score + i_score)), 1)

    if composite >= 80:   regime = "AI Supercycle"
    elif composite >= 60: regime = "Strong Expansion"
    elif composite >= 40: regime = "Normal Growth"
    elif composite >= 20: regime = "Weak Growth"
    else:                 regime = "Contraction"

    if hyper_yoy > 60 and nvda_g > 100:  cycle = "Hypergrowth"
    elif hyper_yoy > 30:                  cycle = "Expansion"
    elif hyper_yoy > 5:                   cycle = "Early Buildout"
    elif hyper_yoy > -10:                 cycle = "Peak Spending"
    else:                                 cycle = "Normalization"

    return {
        "composite": composite,
        "regime": regime,
        "cycle": cycle,
        "components": {
            "hyperscaler":   {"score": round(h_score, 1), "max": 30, "weight": "30%", "input": round(hyper_yoy, 1), "label": "Hyperscaler CapEx YoY"},
            "gpu_demand":    {"score": round(g_score, 1), "max": 20, "weight": "20%", "input": round(nvda_g, 1),    "label": "NVDA Revenue Growth"},
            "datacenter":    {"score": round(d_score, 1), "max": 15, "weight": "15%", "input": round(dc_yoy, 1),    "label": "DC Infra Revenue Growth"},
            "memory":        {"score": round(m_score, 1), "max": 10, "weight": "10%", "input": round(mu_g, 1),      "label": "Micron Revenue Growth"},
            "cloud":         {"score": round(c_score, 1), "max": 10, "weight": "10%", "input": round(cloud_yoy, 1), "label": "Cloud Revenue Growth"},
            "power":         {"score": round(p_score, 1), "max": 5,  "weight": "5%",  "input": round(power_yoy, 1), "label": "Power Infra Growth"},
            "institutional": {"score": round(i_score, 1), "max": 10, "weight": "10%", "input": round(smh_6m, 1),   "label": "SMH 6m Momentum"},
        },
    }


# ── Section builders ──────────────────────────────────────────────────────────

def _build_hyperscalers(raw: Dict[str, Dict]) -> List[Dict]:
    out = []
    for sym, meta in HYPERSCALERS.items():
        d = raw.get(sym, {})
        chart = [{"q": x["date"][:7], "capex": round(x["capex_bn"], 2)}
                 for x in (d.get("capex_quarterly") or [])][-8:]
        rev_chart = [{"q": x["date"][:7], "rev": round(x["rev_bn"], 2)}
                     for x in (d.get("rev_quarterly") or [])][-8:]
        out.append({
            "sym": sym,
            "name": meta["name"],
            "cloud": meta["cloud"],
            "capex_latest_bn": d.get("capex_latest_bn"),
            "capex_annual_bn": d.get("capex_annual_bn"),
            "capex_yoy": d.get("capex_yoy"),
            "rev_latest_bn": d.get("rev_latest_bn"),
            "rev_yoy": d.get("rev_yoy"),
            "mktcap_bn": d.get("mktcap_bn"),
            "price": d.get("price"),
            "chg_6m": d.get("chg_6m"),
            "chg_1y": d.get("chg_1y"),
            "capex_chart": chart,
            "rev_chart": rev_chart,
        })
    return out


def _build_signals(raw: Dict[str, Dict]) -> List[Dict]:
    signals = []
    for sym, meta in AI_STOCKS.items():
        d = raw.get(sym, {})
        ai_pct = meta["ai_pct"]
        chg_6m = d.get("chg_6m")
        chg_3m = d.get("chg_3m")
        rev_yoy = d.get("rev_yoy") or (d.get("rev_growth") or 0) * 100
        pe_fwd = d.get("pe_fwd")
        price = d.get("price")
        low_52w = d.get("low_52w")
        target_price = d.get("target_price")

        score = 0.0
        if chg_6m is not None:
            score += min(40.0, max(-20.0, chg_6m * 0.4))
        if rev_yoy is not None:
            score += min(30.0, max(-10.0, rev_yoy * 0.15))
        score += (ai_pct / 100.0) * 20.0
        if pe_fwd is not None:
            if pe_fwd < 25:   score += 10.0
            elif pe_fwd < 40: score += 5.0
            elif pe_fwd > 70: score -= 5.0
        score = max(0.0, min(100.0, score + 25.0))

        if score >= 78:   signal = "Strong Buy"
        elif score >= 62: signal = "Buy"
        elif score >= 42: signal = "Hold"
        elif score >= 25: signal = "Reduce"
        else:             signal = "Sell"

        stop = None
        if low_52w and price and low_52w < price:
            stop = round(low_52w * 1.03, 2)
        elif price:
            stop = round(price * 0.87, 2)

        if target_price and price:
            upside = (target_price - price) / price * 100
            tgt = round(target_price, 2)
        else:
            upside = 25 if signal == "Strong Buy" else (15 if signal == "Buy" else 5)
            tgt = round(price * (1 + upside / 100), 2) if price else None

        factors = []
        if chg_6m and chg_6m > 20:   factors.append(f"+{chg_6m:.0f}% 6m momentum")
        elif chg_6m and chg_6m < -15: factors.append(f"{chg_6m:.0f}% 6m momentum")
        if rev_yoy and rev_yoy > 30:   factors.append(f"+{rev_yoy:.0f}% revenue YoY")
        elif rev_yoy and rev_yoy < 0:  factors.append(f"{rev_yoy:.0f}% revenue YoY")
        if ai_pct >= 75: factors.append(f"{ai_pct}% AI exposure")

        signals.append({
            "sym": sym,
            "name": meta["name"],
            "sector": meta["sector"],
            "sub": meta["sub"],
            "ai_pct": ai_pct,
            "signal": signal,
            "score": round(score, 1),
            "price": price,
            "entry": round(price, 2) if price else None,
            "stop_loss": stop,
            "target": tgt,
            "upside_pct": round(upside, 1),
            "confidence": round(score, 0),
            "factors": factors,
            "chg_3m": chg_3m,
            "chg_6m": chg_6m,
            "chg_1y": d.get("chg_1y"),
            "rev_yoy": rev_yoy,
            "mktcap_bn": d.get("mktcap_bn"),
            "pe_fwd": pe_fwd,
            "analyst_rec": d.get("analyst_rec"),
        })

    signals.sort(key=lambda x: x["score"], reverse=True)
    return signals


def _build_heatmap(raw: Dict[str, Dict]) -> List[Dict]:
    rows = []
    combined = {**HYPERSCALERS, **AI_STOCKS}
    for sym, meta in combined.items():
        d = raw.get(sym, {})
        chg_6m = d.get("chg_6m")
        rev_yoy = d.get("rev_yoy") or (d.get("rev_growth") or 0) * 100
        ai_pct = meta.get("ai_pct", 60)
        if chg_6m and chg_6m > 15:       momentum = "Accelerating"
        elif chg_6m and chg_6m > -5:     momentum = "Stable"
        else:                             momentum = "Slowing"
        rows.append({
            "sym": sym,
            "name": meta.get("name", sym),
            "sector": meta.get("sector", "Hyperscaler"),
            "ai_pct": ai_pct,
            "chg_3m": d.get("chg_3m"),
            "chg_6m": chg_6m,
            "chg_1y": d.get("chg_1y"),
            "rev_yoy": rev_yoy,
            "mktcap_bn": d.get("mktcap_bn"),
            "momentum": momentum,
        })
    rows.sort(key=lambda x: (x.get("chg_6m") or -999), reverse=True)
    return rows


def _relative_value(sym_a: str, sym_b: str, raw: Dict, stocks: List[Dict]) -> Dict:
    a, b = raw.get(sym_a, {}), raw.get(sym_b, {})
    sa = next((s["score"] for s in stocks if s["sym"] == sym_a), 50)
    sb = next((s["score"] for s in stocks if s["sym"] == sym_b), 50)
    na = AI_STOCKS.get(sym_a, HYPERSCALERS.get(sym_a, {})).get("name", sym_a)
    nb = AI_STOCKS.get(sym_b, HYPERSCALERS.get(sym_b, {})).get("name", sym_b)
    return {
        "pair": f"{sym_a} vs {sym_b}",
        "sym_a": sym_a, "name_a": na,
        "sym_b": sym_b, "name_b": nb,
        "score_a": sa, "score_b": sb,
        "chg_6m_a": a.get("chg_6m"), "chg_6m_b": b.get("chg_6m"),
        "rev_yoy_a": a.get("rev_yoy"), "rev_yoy_b": b.get("rev_yoy"),
        "pe_fwd_a": a.get("pe_fwd"), "pe_fwd_b": b.get("pe_fwd"),
        "mktcap_a": a.get("mktcap_bn"), "mktcap_b": b.get("mktcap_bn"),
        "preferred": sym_a if sa > sb else sym_b,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/dashboard")
def get_dashboard():
    cached = _cache_get("ai_capex_dashboard")
    if cached:
        return cached

    logger.info("Building AI CapEx dashboard...")
    all_tickers = list(set(list(HYPERSCALERS.keys()) + list(AI_STOCKS.keys()) + [BENCHMARK]))
    raw = _fetch_all(all_tickers)

    score_data   = _capex_score(raw)
    hyperscalers = _build_hyperscalers(raw)
    stocks       = _build_signals(raw)
    heatmap      = _build_heatmap(raw)

    # Estimate global AI CapEx from hyperscaler annuals + industry multiplier
    annual_caps = [h["capex_annual_bn"] for h in hyperscalers if h.get("capex_annual_bn")]
    hyper_total = sum(annual_caps) if annual_caps else 190.0
    global_ai_capex = round(hyper_total / 0.60, 1)  # hyperscalers ≈ 60% of total

    infra_breakdown = [
        {"category": "Compute",    "pct": 45, "bn": round(global_ai_capex * 0.45, 1), "label": "GPU / CPU / AI Accelerators"},
        {"category": "Networking", "pct": 20, "bn": round(global_ai_capex * 0.20, 1), "label": "InfiniBand / Ethernet / Optical"},
        {"category": "Power",      "pct": 15, "bn": round(global_ai_capex * 0.15, 1), "label": "Power Equipment / Cooling"},
        {"category": "Storage",    "pct": 10, "bn": round(global_ai_capex * 0.10, 1), "label": "SSD / Enterprise Storage"},
        {"category": "Memory",     "pct": 10, "bn": round(global_ai_capex * 0.10, 1), "label": "HBM / DRAM / NAND"},
    ]

    relative_value = [
        _relative_value("NVDA", "AMD",  raw, stocks),
        _relative_value("NVDA", "AVGO", raw, stocks),
        _relative_value("MU",   "AMAT", raw, stocks),
        _relative_value("ANET", "CSCO", raw, stocks),
        _relative_value("VRT",  "ETN",  raw, stocks),
    ]

    # Cloud revenue proxies (quarterly)
    cloud_data = []
    for sym, label in [("MSFT", "Azure"), ("AMZN", "AWS"), ("GOOGL", "Google Cloud"), ("ORCL", "OCI")]:
        d = raw.get(sym, {})
        cloud_data.append({
            "sym": sym, "label": label,
            "rev_latest_bn": d.get("rev_latest_bn"),
            "rev_yoy": d.get("rev_yoy"),
            "rev_chart": [{"q": x["date"][:7], "rev": round(x["rev_bn"], 2)}
                          for x in (d.get("rev_quarterly") or [])][-8:],
        })

    # GPU / compute proxy data
    gpu_data = []
    for sym in ["NVDA", "AMD", "AVGO"]:
        d = raw.get(sym, {})
        meta = AI_STOCKS.get(sym, {})
        gpu_data.append({
            "sym": sym,
            "name": meta.get("name", sym),
            "sub": meta.get("sub", ""),
            "ai_pct": meta.get("ai_pct", 50),
            "rev_latest_bn": d.get("rev_latest_bn"),
            "rev_yoy": d.get("rev_yoy"),
            "chg_6m": d.get("chg_6m"),
            "chg_1y": d.get("chg_1y"),
            "mktcap_bn": d.get("mktcap_bn"),
            "pe_fwd": d.get("pe_fwd"),
            "rev_chart": [{"q": x["date"][:7], "rev": round(x["rev_bn"], 2)}
                          for x in (d.get("rev_quarterly") or [])][-8:],
        })

    result = {
        "as_of": str(date.today()),
        "capex_score": score_data,
        "global_ai_capex_annual_bn": global_ai_capex,
        "hyperscalers": hyperscalers,
        "stocks": stocks,
        "heatmap": heatmap,
        "infra_breakdown": infra_breakdown,
        "top_longs": [s for s in stocks if s["signal"] in ("Strong Buy", "Buy")][:5],
        "relative_value": relative_value,
        "cloud_data": cloud_data,
        "gpu_data": gpu_data,
    }

    _cache_set("ai_capex_dashboard", result)
    logger.info("AI CapEx dashboard cached.")
    return result


@router.post("/refresh")
def refresh_dashboard():
    _CACHE.pop("ai_capex_dashboard", None)
    return {"status": "cache_cleared"}

"""
IPO Intelligence API — real yfinance data + curated universe.

GET /api/ipo/overview     market health score, KPIs, market conditions, cycle
GET /api/ipo/performance  post-IPO returns for tracked universe (real prices)
GET /api/ipo/calendar     upcoming IPO pipeline
GET /api/ipo/lockup       lockup expiration monitor
GET /api/ipo/valuation    fundamental multiples for recent IPOs
GET /api/ipo/sectors      sector aggregation
GET /api/ipo/screener     hedge-fund screener signals + composite scores
GET /api/ipo/private      private market candidates
"""
from __future__ import annotations

import asyncio
import concurrent.futures
import logging
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import yfinance as yf
from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter()
_EXEC = concurrent.futures.ThreadPoolExecutor(max_workers=6)

# ── Curated IPO Universe (real tickers, real IPO prices / dates) ──────────────
IPO_UNIVERSE: list[dict] = [
    # 2023
    {"ticker": "CAVA",  "company": "CAVA Group",        "ipo_date": "2023-06-15", "ipo_price": 22.00, "exchange": "NYSE",   "sector": "Consumer",       "raise_m": 318,  "val_b": 4.5,  "vc": "SWK Holdings",   "vc_pct": 12.0, "insider_pct": 28.0},
    {"ticker": "ARM",   "company": "Arm Holdings",       "ipo_date": "2023-09-14", "ipo_price": 51.00, "exchange": "NASDAQ", "sector": "Semiconductors", "raise_m": 4870, "val_b": 54.5, "vc": "SoftBank",        "vc_pct": 86.0, "insider_pct": 5.0},
    {"ticker": "KVYO",  "company": "Klaviyo",            "ipo_date": "2023-09-20", "ipo_price": 30.00, "exchange": "NYSE",   "sector": "Technology",     "raise_m": 576,  "val_b": 9.2,  "vc": "Summit Partners", "vc_pct": 18.0, "insider_pct": 32.0},
    {"ticker": "CART",  "company": "Instacart",          "ipo_date": "2023-09-19", "ipo_price": 30.00, "exchange": "NASDAQ", "sector": "Technology",     "raise_m": 660,  "val_b": 9.9,  "vc": "Sequoia/a16z",   "vc_pct": 24.0, "insider_pct": 18.0},
    {"ticker": "BIRK",  "company": "Birkenstock",        "ipo_date": "2023-10-11", "ipo_price": 46.00, "exchange": "NYSE",   "sector": "Consumer",       "raise_m": 1481, "val_b": 8.6,  "vc": "L Catterton PE", "vc_pct": 51.0, "insider_pct": 10.0},
    # 2024
    {"ticker": "RDDT",  "company": "Reddit",             "ipo_date": "2024-03-21", "ipo_price": 34.00, "exchange": "NYSE",   "sector": "Technology",     "raise_m": 748,  "val_b": 6.4,  "vc": "Andreessen",     "vc_pct": 14.0, "insider_pct": 42.0},
    {"ticker": "ALAB",  "company": "Astera Labs",        "ipo_date": "2024-03-20", "ipo_price": 36.00, "exchange": "NASDAQ", "sector": "Semiconductors", "raise_m": 713,  "val_b": 5.2,  "vc": "Intel Capital",  "vc_pct": 22.0, "insider_pct": 38.0},
    {"ticker": "RBRK",  "company": "Rubrik",             "ipo_date": "2024-04-25", "ipo_price": 32.00, "exchange": "NYSE",   "sector": "Technology",     "raise_m": 752,  "val_b": 5.9,  "vc": "Lightspeed",     "vc_pct": 19.0, "insider_pct": 31.0},
    # 2025
    {"ticker": "VG",    "company": "Venture Global LNG", "ipo_date": "2025-01-24", "ipo_price": 25.00, "exchange": "NYSE",   "sector": "Energy",         "raise_m": 1750, "val_b": 60.0, "vc": "PE Consortium",  "vc_pct": 44.0, "insider_pct": 22.0},
    {"ticker": "CRWV",  "company": "CoreWeave",          "ipo_date": "2025-03-28", "ipo_price": 40.00, "exchange": "NASDAQ", "sector": "Technology",     "raise_m": 1500, "val_b": 23.0, "vc": "Magnetar/GS",    "vc_pct": 31.0, "insider_pct": 28.0},
]

UPCOMING_IPOS: list[dict] = [
    {"company": "Klarna",    "ticker": "KLAR",  "exchange": "NYSE",   "expected_date": "2025-07-10", "sector": "Fintech",           "val_b": 15.0, "raise_m": 1000, "interest": 91},
    {"company": "Chime",     "ticker": "CHME",  "exchange": "NASDAQ", "expected_date": "2025-07-18", "sector": "Fintech",           "val_b": 25.0, "raise_m": 1200, "interest": 84},
    {"company": "Cerebras",  "ticker": "CBRS",  "exchange": "NASDAQ", "expected_date": "2025-07-22", "sector": "AI Hardware",       "val_b": 7.0,  "raise_m": 600,  "interest": 88},
    {"company": "Medline",   "ticker": "MEDL",  "exchange": "NYSE",   "expected_date": "2025-08-05", "sector": "Healthcare",        "val_b": 34.0, "raise_m": 3000, "interest": 74},
    {"company": "StubHub",   "ticker": "STUB",  "exchange": "NASDAQ", "expected_date": "2025-08-14", "sector": "Consumer Tech",     "val_b": 16.5, "raise_m": 1500, "interest": 79},
    {"company": "Navan",     "ticker": "NVNA",  "exchange": "NASDAQ", "expected_date": "2025-08-21", "sector": "Travel Tech",       "val_b": 9.2,  "raise_m": 750,  "interest": 67},
    {"company": "Shein",     "ticker": "SHEI",  "exchange": "NYSE",   "expected_date": "2025-09-10", "sector": "Consumer",          "val_b": 45.0, "raise_m": 2000, "interest": 82},
    {"company": "Waymo",     "ticker": "WAYMO", "exchange": "NASDAQ", "expected_date": "2025-09-25", "sector": "Autonomous Driving","val_b": 45.0, "raise_m": 3500, "interest": 96},
    {"company": "eToro",     "ticker": "ETOR",  "exchange": "NASDAQ", "expected_date": "2025-10-08", "sector": "Fintech",           "val_b": 5.5,  "raise_m": 500,  "interest": 71},
    {"company": "Genesys",   "ticker": "GNSY",  "exchange": "NYSE",   "expected_date": "2025-10-22", "sector": "Enterprise SaaS",   "val_b": 21.0, "raise_m": 1800, "interest": 63},
]

PRIVATE_CANDIDATES: list[dict] = [
    {"name": "Stripe",     "val_b": 70,  "round": "Series I", "raised_b": 2.2,  "stage": "Pre-IPO",   "ipo_prob": 78, "timeline": "2025–26"},
    {"name": "Databricks", "val_b": 62,  "round": "Series J", "raised_b": 10.0, "stage": "Pre-IPO",   "ipo_prob": 71, "timeline": "2025–26"},
    {"name": "SpaceX",     "val_b": 350, "round": "Secondary","raised_b": 1.8,  "stage": "Monitoring","ipo_prob": 24, "timeline": "2028+"},
    {"name": "OpenAI",     "val_b": 300, "round": "Series E", "raised_b": 40.0, "stage": "Monitoring","ipo_prob": 31, "timeline": "2027–28"},
    {"name": "Anthropic",  "val_b": 61,  "round": "Series E", "raised_b": 4.0,  "stage": "Monitoring","ipo_prob": 28, "timeline": "2027+"},
]

EXCHANGE_DATA: list[dict] = [
    {"name": "NASDAQ",        "region": "Americas", "ipos": 47, "cap_b": 118.7},
    {"name": "NYSE",          "region": "Americas", "ipos": 34, "cap_b": 82.4},
    {"name": "Shanghai STAR", "region": "Asia",     "ipos": 31, "cap_b": 28.6},
    {"name": "NSE India",     "region": "S. Asia",  "ipos": 29, "cap_b": 12.4},
    {"name": "HKEX",          "region": "Asia",     "ipos": 24, "cap_b": 31.8},
    {"name": "BSE India",     "region": "S. Asia",  "ipos": 22, "cap_b": 8.9},
    {"name": "LSE",           "region": "Europe",   "ipos": 18, "cap_b": 23.1},
    {"name": "DFM",           "region": "MENA",     "ipos": 9,  "cap_b": 6.8},
]


# ── Data fetchers (blocking, run in executor) ─────────────────────────────────

def _safe_float(val, default=None):
    try:
        f = float(val)
        return None if (f != f) else f  # NaN check
    except Exception:
        return default


def _fetch_performance_data() -> list[dict]:
    tickers = [i["ticker"] for i in IPO_UNIVERSE]
    earliest = min(i["ipo_date"] for i in IPO_UNIVERSE)
    today = datetime.today().strftime("%Y-%m-%d")

    try:
        raw = yf.download(tickers, start=earliest, end=today, progress=False, auto_adjust=True, threads=True)
        if isinstance(raw.columns, pd.MultiIndex):
            close = raw["Close"]
        else:
            close = raw.rename(columns={"Close": tickers[0]}) if len(tickers) == 1 else raw
    except Exception as e:
        logger.warning(f"IPO price download failed: {e}")
        return []

    results = []
    for ipo in IPO_UNIVERSE:
        tk = ipo["ticker"]
        if tk not in close.columns:
            continue
        px = close[tk].dropna()
        if px.empty:
            continue

        ipo_dt = pd.Timestamp(ipo["ipo_date"])
        after = px.index[px.index >= ipo_dt]
        if len(after) < 2:
            continue

        ipo_px = ipo["ipo_price"]
        cur_px = _safe_float(px.iloc[-1])

        def ret(n: int):
            if len(after) <= n:
                return None
            v = _safe_float(px[after[n]])
            return round((v / ipo_px - 1) * 100, 1) if v else None

        results.append({
            "ticker":        tk,
            "company":       ipo["company"],
            "ipo_date":      ipo["ipo_date"],
            "ipo_price":     ipo_px,
            "current_price": round(cur_px, 2) if cur_px else None,
            "exchange":      ipo["exchange"],
            "sector":        ipo["sector"],
            "raise_m":       ipo["raise_m"],
            "val_b":         ipo["val_b"],
            "vc":            ipo["vc"],
            "vc_pct":        ipo["vc_pct"],
            "insider_pct":   ipo["insider_pct"],
            "d1":  ret(1),
            "w1":  ret(5),
            "m1":  ret(21),
            "m3":  ret(63),
            "m6":  ret(126),
            "y1":  ret(252),
        })

    return sorted(results, key=lambda x: x["ipo_date"], reverse=True)


def _fetch_market_conditions() -> dict:
    ytd_start = f"{datetime.today().year}-01-01"
    today = datetime.today().strftime("%Y-%m-%d")
    fallback = {"vix": 18.0, "spy_ytd": 12.0, "qqq_ytd": 14.0, "ten_yr": 4.30,
                "spy_price": None, "qqq_price": None}
    try:
        raw = yf.download(["SPY", "QQQ", "^VIX", "^TNX"],
                          start=ytd_start, end=today,
                          progress=False, auto_adjust=True, threads=True)
        if isinstance(raw.columns, pd.MultiIndex):
            cl = raw["Close"]
        else:
            cl = raw

        def ytd_ret(tk):
            s = cl[tk].dropna()
            if len(s) < 2:
                return None
            return round((float(s.iloc[-1]) / float(s.iloc[0]) - 1) * 100, 1)

        vix_s = cl["^VIX"].dropna()
        tnx_s = cl["^TNX"].dropna()
        spy_s = cl["SPY"].dropna()
        qqq_s = cl["QQQ"].dropna()

        return {
            "vix":       round(float(vix_s.iloc[-1]), 2) if not vix_s.empty else 18.0,
            "spy_ytd":   ytd_ret("SPY") or 0.0,
            "qqq_ytd":   ytd_ret("QQQ") or 0.0,
            "ten_yr":    round(float(tnx_s.iloc[-1]), 2) if not tnx_s.empty else 4.3,
            "spy_price": round(float(spy_s.iloc[-1]), 2) if not spy_s.empty else None,
            "qqq_price": round(float(qqq_s.iloc[-1]), 2) if not qqq_s.empty else None,
        }
    except Exception as e:
        logger.warning(f"Market conditions fetch failed: {e}")
        return fallback


def _fetch_valuation(tickers: list[str]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for tk in tickers:
        try:
            info = yf.Ticker(tk).info
            out[tk] = {
                "ev_sales":   _safe_float(info.get("enterpriseToRevenue")),
                "fwd_pe":     _safe_float(info.get("forwardPE")),
                "ev_ebitda":  _safe_float(info.get("enterpriseToEbitda")),
                "price_book": _safe_float(info.get("priceToBook")),
                "rev_growth": _safe_float(info.get("revenueGrowth")),
                "gross_mgn":  _safe_float(info.get("grossMargins")),
                "mkt_cap_b":  _safe_float(info.get("marketCap", 0)) / 1e9 if info.get("marketCap") else None,
            }
        except Exception:
            out[tk] = {}
    return out


# ── Health score computation ──────────────────────────────────────────────────

def _compute_health(mkt: dict, perf: list[dict]) -> dict:
    vix    = mkt.get("vix", 20.0)
    spy    = mkt.get("spy_ytd", 0.0)
    ten_yr = mkt.get("ten_yr", 4.5)

    # VIX component: VIX 10 → 30pts, VIX 30 → 0pts
    vix_score = max(0.0, min(30.0, (30 - vix) / 20 * 30))
    # Market component: SPY +20% → 25pts, 0% → 12.5pts, -10% → 0
    mkt_score = max(0.0, min(25.0, (spy + 10) / 30 * 25))
    # IPO first-day sentiment
    d1s = [p["d1"] for p in perf if p.get("d1") is not None]
    avg_d1 = float(np.mean(d1s)) if d1s else 5.0
    ipo_score = max(0.0, min(25.0, (avg_d1 + 5) / 30 * 25))
    # Rate environment: 3% → 20pts, 5.5% → 0pts
    rate_score = max(0.0, min(20.0, (5.5 - ten_yr) / 2.5 * 20))

    total = int(round(vix_score + mkt_score + ipo_score + rate_score))
    total = max(0, min(100, total))

    if total < 20:   cycle = "Closed Market"
    elif total < 40: cycle = "Recovery"
    elif total < 55: cycle = "Reopening"
    elif total < 75: cycle = "Expansion"
    else:            cycle = "IPO Mania"

    return {
        "score":  total,
        "cycle":  cycle,
        "components": {
            "vix_score":   round(vix_score, 1),
            "mkt_score":   round(mkt_score, 1),
            "ipo_score":   round(ipo_score, 1),
            "rate_score":  round(rate_score, 1),
        }
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/performance")
async def get_performance():
    """Post-IPO returns for all tracked tickers — real yfinance prices."""
    loop = asyncio.get_event_loop()
    perf = await loop.run_in_executor(_EXEC, _fetch_performance_data)
    return {"performance": perf, "count": len(perf), "as_of": datetime.today().strftime("%Y-%m-%d")}


@router.get("/overview")
async def get_overview():
    """Market health score, KPIs, conditions, cycle."""
    loop = asyncio.get_event_loop()
    perf_fut = loop.run_in_executor(_EXEC, _fetch_performance_data)
    mkt_fut  = loop.run_in_executor(_EXEC, _fetch_market_conditions)
    perf, mkt = await asyncio.gather(perf_fut, mkt_fut)

    health = _compute_health(mkt, perf)

    d1s = [p["d1"] for p in perf if p.get("d1") is not None]
    ytd_ipos = len(perf)
    total_raised = sum(p["raise_m"] for p in perf) / 1000  # $B

    return {
        "health":          health,
        "market":          mkt,
        "kpis": {
            "ipos_ytd":       ytd_ipos,
            "capital_raised_b": round(total_raised, 1),
            "avg_d1_return":  round(float(np.mean(d1s)), 1) if d1s else None,
            "unicorn_ipos":   sum(1 for p in perf if p["val_b"] >= 1.0),
            "avg_d1_positive": round(sum(1 for d in d1s if d > 0) / len(d1s) * 100) if d1s else None,
        },
        "as_of": datetime.today().strftime("%Y-%m-%d %H:%M"),
    }


@router.get("/calendar")
async def get_calendar():
    """Upcoming IPO pipeline."""
    today = datetime.today().date()
    upcoming = []
    for ipo in UPCOMING_IPOS:
        exp = datetime.strptime(ipo["expected_date"], "%Y-%m-%d").date()
        days_to = (exp - today).days
        upcoming.append({**ipo, "days_to_ipo": days_to})
    upcoming.sort(key=lambda x: x["days_to_ipo"])
    anticipated = sorted(upcoming, key=lambda x: x["interest"], reverse=True)[:5]
    return {"upcoming": upcoming, "anticipated": anticipated, "count": len(upcoming)}


@router.get("/lockup")
async def get_lockup():
    """Lockup expiration monitor — 180d after IPO date for tracked universe."""
    loop = asyncio.get_event_loop()
    perf = await loop.run_in_executor(_EXEC, _fetch_performance_data)

    today = datetime.today().date()
    lockups = []
    for p in perf:
        ipo_dt = datetime.strptime(p["ipo_date"], "%Y-%m-%d").date()
        expiry = ipo_dt + timedelta(days=180)
        days_left = (expiry - today).days

        if days_left < -30:  # skip very old expirations
            continue

        vc_pct = next((i["vc_pct"] for i in IPO_UNIVERSE if i["ticker"] == p["ticker"]), 0)
        ins_pct = next((i["insider_pct"] for i in IPO_UNIVERSE if i["ticker"] == p["ticker"]), 0)
        vc_name = next((i["vc"] for i in IPO_UNIVERSE if i["ticker"] == p["ticker"]), "")

        if days_left < 0:
            risk = "EXPIRED"
        elif days_left <= 30:
            risk = "CRITICAL"
        elif days_left <= 60:
            risk = "HIGH"
        elif days_left <= 90:
            risk = "MEDIUM"
        else:
            risk = "LOW"

        # Rough shares unlocking: (vc_pct + insider_pct) * est market cap / current price
        cur = p.get("current_price") or 0
        mkt_cap = p["val_b"] * 1e9
        unlock_shares_m = round((vc_pct + ins_pct) / 100 * mkt_cap / cur / 1e6, 1) if cur > 0 else None

        lockups.append({
            "ticker":       p["ticker"],
            "company":      p["company"],
            "ipo_date":     p["ipo_date"],
            "expiry_date":  expiry.isoformat(),
            "days_left":    days_left,
            "insider_pct":  ins_pct,
            "vc_pct":       vc_pct,
            "vc":           vc_name,
            "unlock_shares_m": unlock_shares_m,
            "current_price":   p.get("current_price"),
            "risk":         risk,
        })

    lockups.sort(key=lambda x: x["days_left"])

    # Lockup risk score: weighted by proximity and size
    active = [l for l in lockups if l["risk"] != "EXPIRED"]
    risk_score = 0
    for l in active:
        w = max(0, 1 - l["days_left"] / 180) if l["days_left"] >= 0 else 1.0
        ownership_weight = (l["vc_pct"] + l["insider_pct"]) / 100
        risk_score += w * ownership_weight * 20
    lockup_risk_score = int(min(100, risk_score))

    return {
        "lockups":    lockups,
        "risk_score": lockup_risk_score,
        "as_of":      today.isoformat(),
    }


@router.get("/valuation")
async def get_valuation():
    """Real fundamental multiples via yfinance.info."""
    tickers = [i["ticker"] for i in IPO_UNIVERSE]
    loop = asyncio.get_event_loop()
    val_data = await loop.run_in_executor(_EXEC, _fetch_valuation, tickers)

    results = []
    for ipo in IPO_UNIVERSE:
        tk = ipo["ticker"]
        v = val_data.get(tk, {})

        ev_s = v.get("ev_sales")
        fpe  = v.get("fwd_pe")

        # Crude peer premium: compare EV/Sales to sector median
        sector_medians = {"Technology": 8.0, "Semiconductors": 12.0, "Consumer": 2.5,
                          "Energy": 3.0, "Healthcare": 5.0}
        peer_med = sector_medians.get(ipo["sector"], 7.0)
        vs_peer = round((ev_s / peer_med - 1) * 100, 1) if ev_s and peer_med else None

        if vs_peer is None:
            rating = "N/A"
        elif vs_peer > 40:
            rating = "RICH"
        elif vs_peer > 10:
            rating = "FAIR+"
        elif vs_peer > -15:
            rating = "FAIR"
        elif vs_peer > -30:
            rating = "DISCOUNT"
        else:
            rating = "DEEP VALUE"

        results.append({
            "ticker":       tk,
            "company":      ipo["company"],
            "sector":       ipo["sector"],
            "ev_sales":     round(ev_s, 1) if ev_s else None,
            "fwd_pe":       round(fpe, 1)  if fpe  else None,
            "ev_ebitda":    round(v.get("ev_ebitda"), 1) if v.get("ev_ebitda") else None,
            "price_book":   round(v.get("price_book"), 1) if v.get("price_book") else None,
            "rev_growth":   round(v.get("rev_growth") * 100, 1) if v.get("rev_growth") else None,
            "gross_margin": round(v.get("gross_mgn") * 100, 1) if v.get("gross_mgn") else None,
            "vs_peer_pct":  vs_peer,
            "rating":       rating,
        })

    return {"valuation": results, "as_of": datetime.today().strftime("%Y-%m-%d")}


@router.get("/sectors")
async def get_sectors():
    """Sector aggregation from tracked IPO universe + real returns."""
    loop = asyncio.get_event_loop()
    perf = await loop.run_in_executor(_EXEC, _fetch_performance_data)

    from collections import defaultdict
    sectors: dict[str, list] = defaultdict(list)
    for p in perf:
        sectors[p["sector"]].append(p)

    results = []
    for sec, items in sorted(sectors.items()):
        d1s = [i["d1"] for i in items if i.get("d1") is not None]
        m3s = [i["m3"] for i in items if i.get("m3") is not None]
        results.append({
            "sector":       sec,
            "ipo_count":    len(items),
            "capital_b":    round(sum(i["raise_m"] for i in items) / 1000, 1),
            "avg_d1":       round(float(np.mean(d1s)), 1) if d1s else None,
            "avg_m3":       round(float(np.mean(m3s)), 1) if m3s else None,
        })

    results.sort(key=lambda x: (x.get("avg_d1") or -999), reverse=True)
    for i, r in enumerate(results):
        r["rank"] = i + 1

    return {"sectors": results}


@router.get("/screener")
async def get_screener():
    """Composite scores + hedge-fund screener signals."""
    loop = asyncio.get_event_loop()
    perf = await loop.run_in_executor(_EXEC, _fetch_performance_data)
    mkt  = await loop.run_in_executor(_EXEC, _fetch_market_conditions)

    health = _compute_health(mkt, perf)
    mkt_score_norm = health["score"] / 100

    scored = []
    for p in perf:
        tk = p["ticker"]
        d1 = p.get("d1") or 0
        m3 = p.get("m3") or 0

        # Component scores (0–100 each)
        momentum  = max(0, min(100, 50 + m3 * 1.5))
        market    = health["score"]
        lockup_dt = datetime.strptime(p["ipo_date"], "%Y-%m-%d").date() + timedelta(days=180)
        days_lock = (lockup_dt - datetime.today().date()).days
        lockup_s  = max(0, min(100, days_lock / 180 * 100)) if days_lock >= 0 else 0
        insider_s = max(0, min(100, (50 - p["insider_pct"]) * 1.5 + 50))
        demand_s  = max(0, min(100, 50 + d1 * 2))
        val_b     = p.get("val_b", 5)
        val_s     = max(0, min(100, 100 - (val_b / 50) * 40))

        # Weighted composite (matches spec weights)
        composite = int(round(
            demand_s   * 0.20 +
            val_s      * 0.15 +
            momentum   * 0.20 +
            market     * 0.10 +
            insider_s  * 0.10 +
            lockup_s   * 0.10 +
            (d1 > 0) * 5 * 0.05 +
            demand_s   * 0.10
        ))
        composite = max(0, min(100, composite))

        if composite >= 80:   rating = "EXCEPTIONAL"
        elif composite >= 60: rating = "ATTRACTIVE"
        elif composite >= 40: rating = "NEUTRAL"
        elif composite >= 20: rating = "HIGH RISK"
        else:                  rating = "AVOID"

        scored.append({
            **p,
            "scores": {
                "demand":   int(demand_s),
                "momentum": int(momentum),
                "market":   int(market),
                "lockup":   int(lockup_s),
                "insider":  int(insider_s),
                "value":    int(val_s),
            },
            "composite": composite,
            "rating":    rating,
            "lockup_days": days_lock,
        })

    scored.sort(key=lambda x: x["composite"], reverse=True)

    best_longs    = [s for s in scored if s["composite"] >= 60][:5]
    lockup_shorts = sorted([s for s in scored if s["lockup_days"] < 60 and s["lockup_days"] >= 0],
                           key=lambda x: x["lockup_days"])[:5]
    high_conv     = sorted([s for s in scored if s["scores"]["demand"] >= 60],
                           key=lambda x: x["scores"]["demand"], reverse=True)[:5]
    overvalued    = sorted([s for s in scored if s.get("val_b", 0) > 20],
                           key=lambda x: x.get("val_b", 0), reverse=True)[:4]
    undervalued   = sorted([s for s in scored if s.get("composite", 0) >= 50 and s.get("val_b", 99) < 10],
                           key=lambda x: x["composite"], reverse=True)[:4]

    return {
        "composite_scores": scored,
        "best_longs":       best_longs,
        "lockup_shorts":    lockup_shorts,
        "high_conviction":  high_conv,
        "overvalued":       overvalued,
        "undervalued":      undervalued,
        "health_score":     health["score"],
        "as_of":            datetime.today().strftime("%Y-%m-%d %H:%M"),
    }


@router.get("/private")
async def get_private():
    """Private market candidates."""
    return {
        "candidates": PRIVATE_CANDIDATES,
        "exchanges":  EXCHANGE_DATA,
        "pipeline_score": 84,
    }

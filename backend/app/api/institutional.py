"""
Institutional Flow Dashboard API.

GET /api/institutional/overview  — summary of all 5 components
GET /api/institutional/cot       — COT positioning from CFTC
GET /api/institutional/gamma     — Dealer GEX profile (SPY / QQQ)
GET /api/institutional/positioning — CTA + vol-control estimates
GET /api/institutional/skew      — Put-call skew term structure
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter

from app.core.data import cache, fetcher
from app.core.institutional.cot        import get_cot
from app.core.institutional.gamma      import compute_gex
from app.core.institutional.positioning import estimate_cta, estimate_vol_control
from app.core.institutional.skew       import compute_skew

logger = logging.getLogger(__name__)
router = APIRouter()

_2Y = (datetime.today() - timedelta(days=730)).strftime("%Y-%m-%d")
_TODAY = datetime.today().strftime("%Y-%m-%d")
_SPY = "SPY"


async def _get_spy_prices():
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(None, fetcher.ensure_prices, [_SPY], _2Y, _TODAY)
    except Exception:
        pass
    prices = await loop.run_in_executor(None, cache.get_adj_close, [_SPY], _2Y, _TODAY)
    return prices[_SPY].dropna() if not prices.empty and _SPY in prices.columns else None


# ── COT ───────────────────────────────────────────────────────────────────────

@router.get("/cot")
async def get_cot_data():
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, get_cot)
    return {"cot": data, "as_of": _TODAY}


# ── Gamma ─────────────────────────────────────────────────────────────────────

@router.get("/gamma")
async def get_gamma():
    loop = asyncio.get_event_loop()
    spy_gex, qqq_gex = await asyncio.gather(
        loop.run_in_executor(None, compute_gex, "SPY"),
        loop.run_in_executor(None, compute_gex, "QQQ"),
    )
    return {"spy": spy_gex, "qqq": qqq_gex, "as_of": _TODAY}


# ── Positioning ───────────────────────────────────────────────────────────────

@router.get("/positioning")
async def get_positioning():
    spy = await _get_spy_prices()
    cta     = estimate_cta(spy)
    vol_ctl = estimate_vol_control(spy)
    return {"cta": cta, "vol_control": vol_ctl, "as_of": _TODAY}


# ── Skew ──────────────────────────────────────────────────────────────────────

@router.get("/skew")
async def get_skew():
    loop = asyncio.get_event_loop()
    spy_skew = await loop.run_in_executor(None, compute_skew, "SPY")
    return {"spy": spy_skew, "as_of": _TODAY}


# ── Overview (all-in-one) ─────────────────────────────────────────────────────

@router.get("/overview")
async def get_overview():
    loop    = asyncio.get_event_loop()
    spy_px  = await _get_spy_prices()

    cot_data, spy_gex, qqq_gex, spy_skew = await asyncio.gather(
        loop.run_in_executor(None, get_cot),
        loop.run_in_executor(None, compute_gex, "SPY"),
        loop.run_in_executor(None, compute_gex, "QQQ"),
        loop.run_in_executor(None, compute_skew, "SPY"),
    )

    cta     = estimate_cta(spy_px)
    vol_ctl = estimate_vol_control(spy_px)

    # Answers to the key questions
    sp500_cot = cot_data.get("S&P 500", {})
    lev_z     = sp500_cot.get("lev_z",    None)
    am_net    = sp500_cot.get("am_net_pct", None)
    wk_lev    = sp500_cot.get("wk_chg_lev", None)

    who_buying = []
    if am_net and am_net > 5:
        who_buying.append(f"Asset Managers net long {am_net:.0f}% of OI")
    if wk_lev and wk_lev > 0:
        who_buying.append(f"Leveraged Funds adding (+{wk_lev:,} contracts WoW)")

    who_trapped = []
    if lev_z and lev_z > 1.5:
        who_trapped.append(f"Leveraged Funds crowded long (z={lev_z:.1f} — top {100-sp500_cot.get('lev_pct_rank',50):.0f}% historically)")
    if lev_z and lev_z < -1.5:
        who_trapped.append(f"Leveraged Funds heavily short (z={lev_z:.1f}) — squeeze risk")

    forced_selling = []
    if spy_gex.get("regime") == "negative":
        flip = spy_gex.get("gamma_flip")
        forced_selling.append(f"Dealers net SHORT gamma — amplify moves (flip at ${flip})" if flip else "Dealers net SHORT gamma — amplifies all moves")
    if cta.get("exposure_pct", 0) and cta["exposure_pct"] > 60:
        forced_selling.append("CTAs heavily long — forced selling if trend breaks")
    if vol_ctl.get("delta_vs_1m", 0) and vol_ctl["delta_vs_1m"] < -10:
        forced_selling.append(f"Vol control funds de-risking ({vol_ctl['delta_vs_1m']:+.0f}% vs 1m ago)")

    forced_buying = []
    if spy_gex.get("regime") == "positive":
        forced_buying.append("Dealers net LONG gamma — buy dips, sell rips (stabilizing)")
    if cta.get("exposure_pct", 0) and cta["exposure_pct"] < -40:
        forced_buying.append("CTAs heavily short — squeeze potential on trend reversal")
    if vol_ctl.get("delta_vs_1m", 0) and vol_ctl["delta_vs_1m"] > 10:
        forced_buying.append(f"Vol control adding exposure ({vol_ctl['delta_vs_1m']:+.0f}% vs 1m ago)")

    return {
        "as_of": _TODAY,
        "insights": {
            "who_buying":    who_buying    or ["No clear institutional buying signal"],
            "who_trapped":   who_trapped   or ["No obvious trapped positioning"],
            "forced_selling": forced_selling or ["No immediate forced selling trigger"],
            "forced_buying":  forced_buying  or ["No obvious forced buying catalyst"],
        },
        "cot":         cot_data,
        "gamma":       {"spy": spy_gex, "qqq": qqq_gex},
        "positioning": {"cta": cta, "vol_control": vol_ctl},
        "skew":        {"spy": spy_skew},
    }

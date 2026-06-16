"""
Options Analytics API — pricing, Greeks, vol surface, strategy builder,
scenario analysis, options chain, AI assistant, and scanner.
"""
from __future__ import annotations

import logging
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.core.options.pricing   import black_scholes, binomial_tree, monte_carlo
from app.core.options.greeks    import compute_greeks, greeks_profile, portfolio_greeks
from app.core.options.volatility import (
    implied_volatility, vol_smile, historical_volatility,
    iv_rank_percentile, skew_metrics,
)
from app.core.options.strategies import (
    payoff_at_expiry, build_strategy, scenario_pnl, STRATEGY_CATALOG,
)
from app.core.options.scanner import (
    probability_analysis, max_pain, gamma_exposure,
    put_call_ratio, unusual_activity,
)
from app.core.options.ai_assistant import options_ai_analysis

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Request models ─────────────────────────────────────────────────────────────

class OptionParams(BaseModel):
    S: float = 150.0
    K: float = 150.0
    T_days: int = 30
    r: float = 0.05
    sigma: float = 0.25
    q: float = 0.0
    option_type: str = "call"


class BinomialRequest(OptionParams):
    N: int = 50
    american: bool = False


class MonteCarloRequest(OptionParams):
    n_sims: int = 10_000
    exotic: str = "vanilla"
    barrier: Optional[float] = None


class StrategyLeg(BaseModel):
    type: str = "call"
    K: float = 150.0
    premium: float = 5.0
    position: int = 1
    qty: int = 1
    entry: Optional[float] = None


class StrategyRequest(BaseModel):
    legs: List[StrategyLeg]
    S: float = 150.0
    S_range: Optional[List[float]] = None


class ScenarioRequest(BaseModel):
    legs: List[StrategyLeg]
    S: float = 150.0
    sigma: float = 0.25
    T_days: int = 30
    r: float = 0.05
    q: float = 0.0
    price_shocks: Optional[List[float]] = None
    vol_shocks:   Optional[List[float]] = None
    time_shocks:  Optional[List[int]]   = None


class AIRequest(BaseModel):
    S: float = 150.0
    K: float = 150.0
    T_days: int = 30
    sigma: float = 0.25
    iv_rank: float = 50.0
    iv_pct: float = 50.0
    pcr: Optional[float] = None
    gex_regime: Optional[str] = None
    max_pain_strike: Optional[float] = None
    outlook: str = "neutral"
    ticker: str = ""


class IVRequest(BaseModel):
    market_price: float
    S: float
    K: float
    T_days: int
    r: float = 0.05
    q: float = 0.0
    option_type: str = "call"


# ── Helpers ────────────────────────────────────────────────────────────────────

def _T(days: int) -> float:
    return max(days, 1) / 365.0


# ── Pricing endpoints ─────────────────────────────────────────────────────────

@router.post("/price/bs")
def price_bs(p: OptionParams):
    T = _T(p.T_days)
    bs  = black_scholes(p.S, p.K, T, p.r, p.sigma, p.q, p.option_type)
    gks = compute_greeks(p.S, p.K, T, p.r, p.sigma, p.q, p.option_type)
    return {**bs, "greeks": gks, "T_years": T, "sigma_pct": round(p.sigma * 100, 1)}


@router.post("/price/binomial")
def price_binomial(p: BinomialRequest):
    return binomial_tree(p.S, p.K, _T(p.T_days), p.r, p.sigma,
                         p.N, p.option_type, p.american, p.q)


@router.post("/price/mc")
def price_mc(p: MonteCarloRequest):
    return monte_carlo(p.S, p.K, _T(p.T_days), p.r, p.sigma,
                       p.n_sims, p.option_type, p.q, p.exotic, p.barrier)


@router.post("/iv")
def calc_iv(p: IVRequest):
    iv = implied_volatility(p.market_price, p.S, p.K, _T(p.T_days),
                             p.r, p.q, p.option_type)
    if iv is None:
        raise HTTPException(400, "Unable to compute IV — check inputs")
    return {"implied_volatility": round(iv, 6), "iv_pct": round(iv * 100, 2)}


# ── Greeks ────────────────────────────────────────────────────────────────────

@router.post("/greeks")
def greeks(p: OptionParams):
    T   = _T(p.T_days)
    gks = compute_greeks(p.S, p.K, T, p.r, p.sigma, p.q, p.option_type)
    # Also compute across strikes for profile
    strikes = [round(p.S * (0.80 + i * 0.02), 2) for i in range(21)]
    profile = greeks_profile(p.S, strikes, T, p.r, p.sigma, p.q, p.option_type)
    return {"greeks": gks, "profile": profile}


@router.post("/portfolio-greeks")
def port_greeks(legs: List[dict]):
    return portfolio_greeks(legs)


# ── Volatility ────────────────────────────────────────────────────────────────

@router.post("/vol-smile")
def vol_smile_endpoint(body: dict):
    S    = float(body.get("S", 150))
    T    = _T(int(body.get("T_days", 30)))
    r    = float(body.get("r", 0.05))
    q    = float(body.get("q", 0.0))
    calls = body.get("chain_calls", [])
    puts  = body.get("chain_puts",  [])
    smile = vol_smile(S, calls, puts, T, r, q)
    skew  = skew_metrics(S, calls, puts, T, r, q)
    return {"smile": smile, "skew": skew}


@router.post("/hv")
def hist_vol(body: dict):
    closes = body.get("closes", [])
    window = int(body.get("window", 21))
    hv = historical_volatility(closes, window)
    if hv:
        iv = float(body.get("current_iv", hv[-1]))
        rank_pct = iv_rank_percentile(iv, hv)
    else:
        rank_pct = {"iv_rank": 50.0, "iv_percentile": 50.0, "iv_52w_low": 0.0, "iv_52w_high": 0.0}
    return {"hv_series": [round(v * 100, 2) for v in hv], **rank_pct}


# ── Strategy builder ──────────────────────────────────────────────────────────

@router.get("/strategies")
def list_strategies():
    return [
        {"id": k, "label": v["label"], "category": v["category"],
         "outlook": v["outlook"], "description": v["description"]}
        for k, v in STRATEGY_CATALOG.items()
    ]


@router.post("/strategy/preset")
def strategy_preset(body: dict):
    strategy_id  = body.get("strategy_id", "long_call")
    S            = float(body.get("S", 150))
    atm_premium  = float(body.get("atm_premium", 5))
    return build_strategy(strategy_id, S, atm_premium)


@router.post("/strategy/custom")
def strategy_custom(req: StrategyRequest):
    legs_dict = [l.model_dump() for l in req.legs]
    S_range   = req.S_range or [round(req.S * (0.70 + i * 0.02), 2) for i in range(31)]
    return payoff_at_expiry(legs_dict, S_range)


@router.post("/scenario")
def scenario(req: ScenarioRequest):
    legs_dict = [l.model_dump() for l in req.legs]
    T         = _T(req.T_days)
    return scenario_pnl(legs_dict, req.S, req.sigma, T, req.r, req.q,
                        req.price_shocks, req.vol_shocks,
                        req.time_shocks if req.time_shocks else [0, 1, 7, 30])


# ── Probability ───────────────────────────────────────────────────────────────

@router.post("/probability")
def probability(p: OptionParams):
    return probability_analysis(p.S, p.K, _T(p.T_days), p.r, p.sigma, p.q, p.option_type)


# ── Options chain (live from yfinance) ────────────────────────────────────────

@router.get("/chain/{ticker}")
def options_chain(ticker: str, expiry: Optional[str] = Query(None)):
    try:
        import ssl
        ssl._create_default_https_context = ssl._create_unverified_context
        import yfinance as yf

        stock = yf.Ticker(ticker.upper())
        expirations = list(stock.options)
        if not expirations:
            raise HTTPException(404, f"No options data for {ticker}")

        target = expiry if expiry and expiry in expirations else expirations[0]
        chain  = stock.option_chain(target)

        def _clean(df, opt_type):
            rows = []
            for _, row in df.iterrows():
                mid = ((row.get("bid", 0) or 0) + (row.get("ask", 0) or 0)) / 2
                rows.append({
                    "strike":           float(row.get("strike", 0)),
                    "bid":              float(row.get("bid", 0) or 0),
                    "ask":              float(row.get("ask", 0) or 0),
                    "mid":              round(mid, 2),
                    "lastPrice":        float(row.get("lastPrice", 0) or 0),
                    "volume":           int(row.get("volume", 0) or 0),
                    "openInterest":     int(row.get("openInterest", 0) or 0),
                    "impliedVolatility": round(float(row.get("impliedVolatility", 0) or 0), 4),
                    "inTheMoney":       bool(row.get("inTheMoney", False)),
                    "type":             opt_type,
                })
            return rows

        calls = _clean(chain.calls, "call")
        puts  = _clean(chain.puts,  "put")

        info  = stock.fast_info
        S     = float(getattr(info, "last_price", 0) or 0)

        # Max pain + PCR + GEX
        mp  = max_pain(calls, puts)
        pcr = put_call_ratio(calls, puts)
        gex = gamma_exposure(calls, puts, S)

        return {
            "ticker":       ticker.upper(),
            "spot":         S,
            "expiry":       target,
            "expirations":  expirations[:12],
            "calls":        calls,
            "puts":         puts,
            "max_pain":     mp,
            "put_call_ratio": pcr,
            "gex":          gex,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Options chain error for {ticker}: {e}")
        raise HTTPException(500, f"Failed to fetch options chain: {e}")


# ── Scanner ────────────────────────────────────────────────────────────────────

@router.post("/scanner")
def scanner(body: dict):
    calls = body.get("calls", [])
    puts  = body.get("puts",  [])
    S     = float(body.get("S", 150))
    return {
        "unusual": unusual_activity(calls, puts),
        "max_pain": max_pain(calls, puts),
        "pcr": put_call_ratio(calls, puts),
        "gex": gamma_exposure(calls, puts, S),
    }


# ── AI analysis ───────────────────────────────────────────────────────────────

@router.post("/ai-analysis")
def ai_analysis(req: AIRequest):
    return options_ai_analysis(
        req.S, req.K, req.T_days, req.sigma,
        req.iv_rank, req.iv_pct,
        pcr=req.pcr, gex_regime=req.gex_regime,
        max_pain_strike=req.max_pain_strike,
        outlook=req.outlook, ticker=req.ticker,
    )

"""
Comprehensive market regime detection across 5 dimensions:
  1. Risk Sentiment  — credit spreads, VIX, SPY trend
  2. Inflation       — TIP/IEF ratio, gold, commodities
  3. Growth          — cyclical vs defensive, industrials vs utilities
  4. Market Trend    — SPY MA stack, 1yr momentum
  5. Volatility      — VIX level and trend
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from typing import Literal

# All ETFs used as signals
SIGNAL_TICKERS = [
    "SPY", "^VIX",
    "HYG", "LQD", "IEF", "TIP",
    "GLD", "DBC",
    "XLY", "XLP", "XLU", "XLI", "XLE", "XLF", "XLK", "XLV", "XLRE", "XLB", "XLC",
]

RiskLabel    = Literal["Risk-On", "Neutral", "Risk-Off"]
InflLabel    = Literal["Inflation Rising", "Neutral", "Disinflation"]
GrowthLabel  = Literal["Growth Expanding", "Neutral", "Growth Slowing"]
TrendLabel   = Literal["Bull", "Sideways", "Bear"]
VolLabel     = Literal["Vol Expanding", "Normal", "Vol Compressing"]


@dataclass
class RegimeResult:
    risk:       RiskLabel
    inflation:  InflLabel
    growth:     GrowthLabel
    trend:      TrendLabel
    volatility: VolLabel

    risk_score:    float   # -1..1  positive = bullish/risk-on
    infl_score:    float
    growth_score:  float
    trend_score:   float
    vol_score:     float   # positive = vol expanding (bearish)

    signals:      dict = field(default_factory=dict)

    best_factors:  list[str] = field(default_factory=list)
    avoid_factors: list[str] = field(default_factory=list)
    best_sectors:  list[str] = field(default_factory=list)
    avoid_sectors: list[str] = field(default_factory=list)

    sizing:        str = ""
    bias:          str = ""
    label:         str = ""
    confidence:    float = 0.0


# ── helpers ────────────────────────────────────────────────────────────────────

def _ma(s: pd.Series, n: int) -> float:
    return float(s.iloc[-n:].mean()) if len(s) >= n else float("nan")


def _mom(s: pd.Series, n: int) -> float:
    if len(s) < n + 1:
        return float("nan")
    return float(s.iloc[-1] / s.iloc[-1 - n] - 1)


def _clip(x: float, lo: float = -1.0, hi: float = 1.0) -> float:
    return float(np.clip(x, lo, hi))


def _mean(lst: list[float]) -> float:
    clean = [x for x in lst if not np.isnan(x)]
    return float(np.mean(clean)) if clean else 0.0


# ── main detector ──────────────────────────────────────────────────────────────

def detect_regime(prices: pd.DataFrame) -> RegimeResult:
    """
    prices: wide adj-close DataFrame, columns=tickers, index=date.
    """
    av = set(prices.columns)
    sig: dict = {}

    def get(t: str) -> pd.Series | None:
        s = prices[t].dropna() if t in av else None
        return s if s is not None and len(s) > 0 else None

    # ── 1. Risk Sentiment ──────────────────────────────────────────────────────
    rs: list[float] = []

    spy = get("SPY")
    if spy is not None and len(spy) >= 200:
        last  = float(spy.iloc[-1])
        ma50  = _ma(spy, 50)
        ma200 = _ma(spy, 200)
        d200  = (last - ma200) / ma200
        cross = (ma50  - ma200) / ma200
        sig["spy_vs_200ma_pct"] = round(d200 * 100, 2)
        sig["spy_ma50_vs_200_pct"] = round(cross * 100, 2)
        rs += [_clip(d200 * 5), _clip(cross * 10)]

    vix = get("^VIX")
    vix_last: float | None = None
    if vix is not None:
        vix_last = float(vix.iloc[-1])
        sig["vix"] = round(vix_last, 2)
        rs.append(_clip(-(vix_last - 20) / 10))
        if len(vix) >= 20:
            vm = _mom(vix, 20)
            sig["vix_20d_chg_pct"] = round(vm * 100, 2)
            rs.append(_clip(-vm * 3))

    hyg = get("HYG")
    lqd = get("LQD")
    if hyg is not None and lqd is not None and len(hyg) >= 20 and len(lqd) >= 20:
        ratio_mom = _mom(hyg / lqd, 20)
        sig["hyg_lqd_20d_pct"] = round(ratio_mom * 100, 2)
        rs.append(_clip(ratio_mom * 10))

    risk_score = _mean(rs)

    # ── 2. Inflation ───────────────────────────────────────────────────────────
    ins: list[float] = []

    tip = get("TIP")
    ief = get("IEF")
    if tip is not None and ief is not None:
        for n, w in [(20, 1.0), (60, 0.7), (120, 0.5)]:
            m = _mom(tip / ief, n)
            if not np.isnan(m):
                sig[f"tip_ief_{n}d_pct"] = round(m * 100, 2)
                ins.append(_clip(m * (10 / w)))

    gld = get("GLD")
    if gld is not None and len(gld) >= 60:
        m = _mom(gld, 60)
        sig["gld_60d_pct"] = round(m * 100, 2)
        ins.append(_clip(m * 5))

    dbc = get("DBC")
    if dbc is not None and len(dbc) >= 60:
        m = _mom(dbc, 60)
        sig["dbc_60d_pct"] = round(m * 100, 2)
        ins.append(_clip(m * 5))

    infl_score = _mean(ins)

    # ── 3. Growth ──────────────────────────────────────────────────────────────
    gs: list[float] = []

    xly = get("XLY")
    xlp = get("XLP")
    if xly is not None and xlp is not None:
        for n in [20, 60]:
            m = _mom(xly / xlp, n)
            if not np.isnan(m):
                sig[f"xly_xlp_{n}d_pct"] = round(m * 100, 2)
                gs.append(_clip(m * 8))

    xli = get("XLI")
    xlu = get("XLU")
    if xli is not None and xlu is not None and len(xli) >= 60 and len(xlu) >= 60:
        m = _mom(xli / xlu, 60)
        sig["xli_xlu_60d_pct"] = round(m * 100, 2)
        gs.append(_clip(m * 8))

    growth_score = _mean(gs)

    # ── 4. Market Trend ────────────────────────────────────────────────────────
    ts: list[float] = []

    if spy is not None and len(spy) >= 200:
        last  = float(spy.iloc[-1])
        ma50  = _ma(spy, 50)
        ma200 = _ma(spy, 200)
        if last > ma50 > ma200:
            ts.append(1.0)
        elif last < ma50 < ma200:
            ts.append(-1.0)
        else:
            ts.append(0.0)
        if len(spy) >= 252:
            m1y = _mom(spy, 252)
            sig["spy_1y_pct"] = round(m1y * 100, 2)
            ts.append(_clip(m1y * 2))
        if len(spy) >= 63:
            m3m = _mom(spy, 63)
            sig["spy_3m_pct"] = round(m3m * 100, 2)
            ts.append(_clip(m3m * 4))

    trend_score = _mean(ts)

    # ── 5. Volatility ──────────────────────────────────────────────────────────
    vs: list[float] = []

    if vix is not None and len(vix) >= 20:
        vix20 = _ma(vix, 20)
        vix_vs_ma = (vix_last - vix20) / vix20 if vix20 else 0  # type: ignore[operator]
        sig["vix_vs_20ma_pct"] = round(vix_vs_ma * 100, 2)
        vs.append(_clip(vix_vs_ma * 5))
        if len(vix) >= 5:
            vs.append(_clip(_mom(vix, 5) * 5))

    vol_score = _mean(vs)

    # ── Classify ───────────────────────────────────────────────────────────────
    def classify(score: float, labels: tuple, pos_thr: float = 0.2, neg_thr: float = -0.2):
        if score > pos_thr:
            return labels[0]
        elif score < neg_thr:
            return labels[2]
        return labels[1]

    risk_lbl:   RiskLabel   = classify(risk_score,   ("Risk-On", "Neutral", "Risk-Off"))
    infl_lbl:   InflLabel   = classify(infl_score,   ("Inflation Rising", "Neutral", "Disinflation"))
    growth_lbl: GrowthLabel = classify(growth_score, ("Growth Expanding", "Neutral", "Growth Slowing"))
    trend_lbl:  TrendLabel  = classify(trend_score,  ("Bull", "Sideways", "Bear"), 0.3, -0.3)
    vol_lbl:    VolLabel    = classify(vol_score,    ("Vol Expanding", "Normal", "Vol Compressing"))

    label = f"{infl_lbl} + {growth_lbl}"

    # ── Recommendations ────────────────────────────────────────────────────────
    bf, af, bs, as_ = _recommend(risk_lbl, infl_lbl, growth_lbl, trend_lbl, vol_lbl)
    sizing = _sizing(risk_lbl, vol_lbl, trend_lbl)

    if trend_lbl == "Bull" and risk_lbl == "Risk-On":
        bias = "Long-Biased"
    elif trend_lbl == "Bear" and risk_lbl == "Risk-Off":
        bias = "Short-Biased"
    else:
        bias = "Neutral / Selective"

    confidence = min(
        _mean([abs(risk_score), abs(infl_score), abs(growth_score), abs(trend_score), abs(vol_score)]),
        1.0,
    )

    return RegimeResult(
        risk=risk_lbl, inflation=infl_lbl, growth=growth_lbl,
        trend=trend_lbl, volatility=vol_lbl,
        risk_score=round(risk_score, 3),
        infl_score=round(infl_score, 3),
        growth_score=round(growth_score, 3),
        trend_score=round(trend_score, 3),
        vol_score=round(vol_score, 3),
        signals=sig,
        best_factors=bf, avoid_factors=af,
        best_sectors=bs, avoid_sectors=as_,
        sizing=sizing, bias=bias,
        label=label,
        confidence=round(confidence, 3),
    )


def _dedup(lst: list[str]) -> list[str]:
    seen: set = set()
    return [x for x in lst if not (x in seen or seen.add(x))]  # type: ignore[func-returns-value]


def _recommend(
    risk: RiskLabel, infl: InflLabel, growth: GrowthLabel,
    trend: TrendLabel, vol: VolLabel,
) -> tuple[list[str], list[str], list[str], list[str]]:
    bf: list[str] = []   # best factors
    af: list[str] = []   # avoid factors
    bs: list[str] = []   # best sectors
    as_: list[str] = []  # avoid sectors

    if growth == "Growth Expanding":
        bf += ["Momentum", "Quality", "Small Cap"]
        bs += ["Technology", "Industrials", "Consumer Discretionary", "Financials"]
        as_ += ["Utilities", "REITs"]
    elif growth == "Growth Slowing":
        bf += ["Low Volatility", "Quality", "Dividend Yield", "Min Variance"]
        bs += ["Utilities", "Healthcare", "Consumer Staples", "REITs"]
        as_ += ["Industrials", "Financials", "Consumer Discretionary"]

    if infl == "Inflation Rising":
        bf += ["Value", "Commodity-linked"]
        bs += ["Energy", "Materials", "Commodities"]
        as_ += ["Long Duration Bonds", "REITs", "High-Multiple Growth"]
        af += ["Duration (Long Bonds)", "High-PE Growth"]
    elif infl == "Disinflation":
        bf += ["Growth", "Momentum", "Duration"]
        bs += ["Technology", "Consumer Discretionary", "Bonds", "REITs"]
        as_ += ["Energy", "Materials"]

    if risk == "Risk-Off":
        bf += ["Low Volatility", "Quality", "Min Variance"]
        bs += ["Gold", "Treasuries", "Consumer Staples", "Healthcare"]
        as_ += ["High Beta", "Cyclicals", "Small Cap"]
        af += ["Momentum", "Small Cap", "High Beta"]
    elif risk == "Risk-On":
        bf += ["Momentum", "Beta", "Small Cap"]
        bs += ["Technology", "Financials", "Industrials"]

    if vol == "Vol Expanding":
        af += ["Short Vol / Carry Strategies"]
        bf += ["Tail Hedge / Long Vol"]
    elif vol == "Vol Compressing":
        bf += ["Carry", "Short Vol"]

    return _dedup(bf), _dedup(af), _dedup(bs), _dedup(as_)


def _sizing(risk: RiskLabel, vol: VolLabel, trend: TrendLabel) -> str:
    if risk == "Risk-Off" or vol == "Vol Expanding":
        return "50-70% of normal — elevated risk, reduce exposure"
    if risk == "Risk-On" and vol == "Vol Compressing" and trend == "Bull":
        return "90-100% — favorable conditions, full sizing"
    if trend == "Bear":
        return "40-60% — defensive only, short exposure with confirmation"
    if trend == "Sideways":
        return "75-85% — range-bound, selective entries only"
    return "80-90% — constructive but stay disciplined"

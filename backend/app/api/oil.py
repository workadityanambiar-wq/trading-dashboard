"""
Crude Oil Market Intelligence API — institutional-grade commodity analytics.
Data: yfinance (prices, macro, technicals) + public estimates (OPEC, EIA inventory).
"""
import logging
from datetime import datetime, timedelta
from typing import Optional
import numpy as np
import pandas as pd
import yfinance as yf
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()

# ── In-memory cache (15 min TTL) ───────────────────────────────────────────────
_CACHE: dict = {}
_TTL = 900

def _get(key: str):
    if key in _CACHE:
        ts, v = _CACHE[key]
        if (datetime.utcnow().timestamp() - ts) < _TTL:
            return v
    return None

def _set(key: str, v):
    _CACHE[key] = (datetime.utcnow().timestamp(), v)
    return v

# ── Symbols ────────────────────────────────────────────────────────────────────
SYM = {
    "wti":      "CL=F",
    "brent":    "BZ=F",
    "natgas":   "NG=F",
    "heating":  "HO=F",
    "gasoline": "RB=F",
    "dxy":      "DX-Y.NYB",
    "us10y":    "^TNX",
    "us2y":     "^IRX",
    "gold":     "GC=F",
    "vix":      "^VIX",
    "uso":      "USO",
    "xle":      "XLE",
    "spy":      "SPY",
}

# ── Static Data (public IEA/EIA/Baker Hughes estimates, June 2025) ─────────────
_OPEC = [
    {"country": "Saudi Arabia", "flag": "🇸🇦", "production": 9.0,  "quota": 10.0, "spare_capacity": 2.5, "change_mom": -0.1},
    {"country": "Russia",       "flag": "🇷🇺", "production": 9.1,  "quota": 9.0,  "spare_capacity": 0.5, "change_mom": -0.1},
    {"country": "Iraq",         "flag": "🇮🇶", "production": 4.2,  "quota": 4.2,  "spare_capacity": 0.2, "change_mom":  0.1},
    {"country": "Iran",         "flag": "🇮🇷", "production": 3.2,  "quota": None, "spare_capacity": 1.5, "change_mom":  0.2},
    {"country": "UAE",          "flag": "🇦🇪", "production": 3.1,  "quota": 3.3,  "spare_capacity": 0.8, "change_mom":  0.0},
    {"country": "Kuwait",       "flag": "🇰🇼", "production": 2.4,  "quota": 2.5,  "spare_capacity": 0.3, "change_mom":  0.0},
    {"country": "Kazakhstan",   "flag": "🇰🇿", "production": 1.8,  "quota": 1.6,  "spare_capacity": 0.1, "change_mom":  0.1},
    {"country": "Nigeria",      "flag": "🇳🇬", "production": 1.4,  "quota": 1.5,  "spare_capacity": 0.1, "change_mom": -0.1},
    {"country": "Libya",        "flag": "🇱🇾", "production": 1.1,  "quota": None, "spare_capacity": 0.2, "change_mom":  0.0},
    {"country": "Venezuela",    "flag": "🇻🇪", "production": 0.8,  "quota": None, "spare_capacity": 0.1, "change_mom":  0.0},
]

_GEO_EVENTS = [
    {"date": "2025-06-10", "event": "Houthi Red Sea Attacks Escalate", "impact": "Bullish", "severity": "High"},
    {"date": "2025-05-20", "event": "OPEC+ Extends Voluntary Cuts Through Q3", "impact": "Bullish", "severity": "Medium"},
    {"date": "2025-04-15", "event": "Iran Nuclear Talks Collapse", "impact": "Bullish", "severity": "High"},
    {"date": "2025-03-28", "event": "Russia G7 Price Cap Circumvention Flagged", "impact": "Bullish", "severity": "Medium"},
    {"date": "2025-02-18", "event": "US Announces Strategic Reserve Refill", "impact": "Bullish", "severity": "Low"},
    {"date": "2025-01-12", "event": "Libya El-Sharara Field Restored", "impact": "Bearish", "severity": "Low"},
]

_INVENTORY_BASE = [
    # name, current_mb, prev_week, five_yr_avg, five_yr_low, five_yr_high
    ("US Crude Oil",      429.6, 432.1, 440.0, 400.0, 495.0),
    ("US Gasoline",       228.4, 229.8, 235.0, 210.0, 260.0),
    ("US Distillates",    115.2, 114.8, 120.0, 100.0, 140.0),
    ("Strategic Reserve", 376.0, 376.0, 450.0, 370.0, 640.0),
]

# ── Math Helpers ───────────────────────────────────────────────────────────────

def _dl(tickers: list[str], period: str = "1y", interval: str = "1d") -> pd.DataFrame:
    """Download close prices; returns DataFrame keyed by symbol."""
    try:
        raw = yf.download(tickers, period=period, interval=interval,
                         auto_adjust=True, progress=False, threads=True)
        if raw.empty:
            return pd.DataFrame()
        if isinstance(raw.columns, pd.MultiIndex):
            close = raw["Close"] if "Close" in raw.columns.get_level_values(0) else pd.DataFrame()
        else:
            close = pd.DataFrame({tickers[0]: raw["Close"]}) if "Close" in raw else pd.DataFrame()
        return close.dropna(how="all")
    except Exception as e:
        logger.warning(f"Download error {tickers}: {e}")
        return pd.DataFrame()

def _dl_ohlcv(ticker: str, period: str = "2y") -> pd.DataFrame:
    try:
        raw = yf.download(ticker, period=period, interval="1d",
                         auto_adjust=True, progress=False)
        if isinstance(raw.columns, pd.MultiIndex):
            raw.columns = [c[0] for c in raw.columns]
        return raw.dropna()
    except Exception as e:
        logger.warning(f"OHLCV error {ticker}: {e}")
        return pd.DataFrame()

def _rsi(s: pd.Series, n: int = 14) -> pd.Series:
    d = s.diff()
    g = d.clip(lower=0).rolling(n).mean()
    l = (-d.clip(upper=0)).rolling(n).mean()
    return 100 - 100 / (1 + g / l.replace(0, np.nan))

def _ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False).mean()

def _atr(df: pd.DataFrame, n: int = 14) -> float:
    if "High" not in df or "Low" not in df or "Close" not in df:
        return float(df["Close"].std() * 0.5) if "Close" in df else 1.0
    h, l, c = df["High"], df["Low"], df["Close"]
    tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
    return float(tr.rolling(n).mean().iloc[-1])

def _chg(s: pd.Series, n: int) -> float:
    if len(s) < n + 1:
        return 0.0
    return float((s.iloc[-1] / s.iloc[-n] - 1) * 100)

def _ytd(s: pd.Series) -> float:
    cutoff = pd.Timestamp(datetime.now().year, 1, 1)
    past = s[s.index < cutoff]
    if past.empty:
        return 0.0
    return float((s.iloc[-1] / past.iloc[-1] - 1) * 100)

def _vol30(s: pd.Series) -> float:
    r = s.pct_change().dropna()
    return float(r.tail(30).std() * np.sqrt(252) * 100) if len(r) >= 10 else 0.0

def _trend(s: pd.Series) -> str:
    if len(s) < 50:
        return "Neutral"
    f = float(_ema(s, 20).iloc[-1])
    sl = float(_ema(s, 50).iloc[-1])
    if f > sl * 1.005:
        return "Uptrend"
    if f < sl * 0.995:
        return "Downtrend"
    return "Neutral"

def _last(df: pd.DataFrame, sym: str) -> float:
    if sym not in df or df[sym].dropna().empty:
        return 0.0
    return float(df[sym].dropna().iloc[-1])

# ── Pydantic Models ────────────────────────────────────────────────────────────

class PriceCard(BaseModel):
    name: str; symbol: str; price: float
    daily: float; weekly: float; monthly: float; ytd: float
    vol30: float; trend: str

class OilOverview(BaseModel):
    cards: list[PriceCard]
    brent_wti_spread: float
    composite_score: float
    regime: str; regime_color: str; momentum: str
    as_of: str

class OpecCountry(BaseModel):
    country: str; flag: str; production: float
    quota: Optional[float]; compliance: Optional[float]
    spare_capacity: float; change_mom: float

class SupplyData(BaseModel):
    opec: list[OpecCountry]
    opec_total: float; opec_quota: float; opec_compliance: float; opec_spare: float
    us_production: float; us_rig_count: int; us_rig_mom: float
    signal: str; signal_reason: str

class InventoryRow(BaseModel):
    name: str; current: float; prev_week: float
    five_yr_avg: float; five_yr_low: float; five_yr_high: float
    pct_vs_avg: float; surprise: float; z_score: float; trend: str

class InventoryData(BaseModel):
    rows: list[InventoryRow]
    signal: str; signal_score: float; as_of: str

class MacroRow(BaseModel):
    name: str; value: float; change: float; corr90d: float; signal: str

class MacroData(BaseModel):
    rows: list[MacroRow]
    macro_score: float; dxy_trend: str; real_rate: float; breakeven: float
    as_of: str

class FuturesPoint(BaseModel):
    tenor: str; price: float; months_out: int

class FuturesCurve(BaseModel):
    points: list[FuturesPoint]
    structure: str; front_back_spread: float; signal: str

class TechIndicator(BaseModel):
    name: str; value: float; signal: str

class SRLevel(BaseModel):
    type: str; level: float; strength: str

class TechnicalData(BaseModel):
    price: float; ema20: float; ema50: float; ema200: float
    rsi: float; macd: float; macd_signal: float; macd_hist: float
    atr: float; bb_upper: float; bb_lower: float; bb_mid: float
    indicators: list[TechIndicator]; levels: list[SRLevel]
    tech_score: float; series: list[dict]

class PositioningData(BaseModel):
    mm_long: float; mm_short: float; mm_net: float
    commercial_net: float; large_spec_net: float
    net_chg: float; crowding: float
    signal: str; extreme_long: bool; extreme_short: bool
    history: list[dict]

class FairValue(BaseModel):
    fair_value: float; current: float; mispricing_pct: float; inputs: dict

class ForecastPt(BaseModel):
    label: str; price: float; low: float; high: float

class ModelsData(BaseModel):
    fair_value: FairValue; forecasts: list[ForecastPt]
    model: str; r2: float

class GeoEvent(BaseModel):
    date: str; event: str; impact: str; severity: str

class GeoData(BaseModel):
    score: float; level: str; events: list[GeoEvent]; hotspots: list[str]

class CompositeData(BaseModel):
    total: float
    supply: float; demand: float; inventory: float
    macro: float; positioning: float; technical: float
    regime: str; signal: str
    entry: float; stop: float; target: float
    risk_reward: float; confidence: float

class ScenarioItem(BaseModel):
    name: str; description: str
    price_low: float; price_expected: float; price_high: float
    probability: float; horizon: str; direction: str

class ScenarioData(BaseModel):
    base_price: float; scenarios: list[ScenarioItem]

# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/overview", response_model=OilOverview)
def get_overview():
    if c := _get("oil_overview"):
        return c

    syms = [SYM["wti"], SYM["brent"], SYM["natgas"], SYM["heating"], SYM["gasoline"]]
    names = ["WTI Crude", "Brent Crude", "Natural Gas", "Heating Oil", "RBOB Gasoline"]
    df = _dl(syms, period="1y")

    cards = []
    for sym, name in zip(syms, names):
        if sym not in df:
            continue
        s = df[sym].dropna()
        if s.empty:
            continue
        cards.append(PriceCard(
            name=name, symbol=sym, price=round(float(s.iloc[-1]), 2),
            daily=round(_chg(s, 1), 2), weekly=round(_chg(s, 5), 2),
            monthly=round(_chg(s, 21), 2), ytd=round(_ytd(s), 2),
            vol30=round(_vol30(s), 1), trend=_trend(s),
        ))

    wti_p  = next((c.price for c in cards if "WTI" in c.name), 75.0)
    brent_p = next((c.price for c in cards if "Brent" in c.name), 78.0)
    spread = round(brent_p - wti_p, 2)

    wti_s = df[SYM["wti"]].dropna() if SYM["wti"] in df else pd.Series(dtype=float)
    rsi_v = float(_rsi(wti_s).iloc[-1]) if len(wti_s) > 20 else 50.0
    trend_s = _trend(wti_s)

    score = 50.0 + (rsi_v - 50) * 0.3
    score += 15 if trend_s == "Uptrend" else (-15 if trend_s == "Downtrend" else 0)
    score = max(0.0, min(100.0, score))

    regime       = "Bullish" if score >= 60 else ("Bearish" if score <= 40 else "Neutral")
    regime_color = "#10b981" if score >= 60 else ("#ef4444" if score <= 40 else "#f59e0b")
    momentum     = "Rising" if rsi_v > 55 else ("Falling" if rsi_v < 45 else "Flat")

    return _set("oil_overview", OilOverview(
        cards=cards, brent_wti_spread=spread,
        composite_score=round(score, 1), regime=regime,
        regime_color=regime_color, momentum=momentum,
        as_of=datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    ))


@router.get("/supply", response_model=SupplyData)
def get_supply():
    if c := _get("oil_supply"):
        return c

    countries, total_prod, total_quota, total_spare = [], 0.0, 0.0, 0.0
    compliance_sum, compliance_n = 0.0, 0

    for d in _OPEC:
        compliance = None
        if d["quota"] is not None:
            compliance = round(min(d["production"] / d["quota"], 1.5) * 100, 1)
            total_quota += d["quota"]
            compliance_sum += compliance
            compliance_n += 1
        total_prod += d["production"]
        total_spare += d["spare_capacity"]
        countries.append(OpecCountry(**{k: v for k, v in d.items()}, compliance=compliance))

    opec_compliance = round(compliance_sum / compliance_n, 1) if compliance_n else 0.0

    us_prod = 13.2
    rig_count = 478
    rig_mom = -1.2

    # XLE momentum as US production proxy
    try:
        xle_df = _dl([SYM["xle"]], period="3mo")
        if SYM["xle"] in xle_df:
            xle_s = xle_df[SYM["xle"]].dropna()
            rig_mom = round(_chg(xle_s, 20) * 0.3, 1)
    except Exception:
        pass

    spare_pct = total_spare / total_prod
    if spare_pct < 0.03 and opec_compliance > 90:
        signal, reason = "Bullish", f"Spare capacity critically low ({total_spare:.1f} mb/d), compliance {opec_compliance:.0f}%"
    elif spare_pct > 0.07 or opec_compliance < 70:
        signal, reason = "Bearish", f"Ample spare capacity ({total_spare:.1f} mb/d), compliance {opec_compliance:.0f}%"
    else:
        signal, reason = "Neutral", f"Spare capacity {total_spare:.1f} mb/d, compliance {opec_compliance:.0f}%"

    return _set("oil_supply", SupplyData(
        opec=countries,
        opec_total=round(total_prod, 2), opec_quota=round(total_quota, 2),
        opec_compliance=opec_compliance, opec_spare=round(total_spare, 2),
        us_production=us_prod, us_rig_count=rig_count, us_rig_mom=rig_mom,
        signal=signal, signal_reason=reason,
    ))


@router.get("/inventory", response_model=InventoryData)
def get_inventory():
    if c := _get("oil_inventory"):
        return c

    rows, z_scores = [], []
    for name, curr, prev, avg, lo, hi in _INVENTORY_BASE:
        pct = round((curr / avg - 1) * 100, 1)
        surprise = round(prev - curr, 1)
        z = round((curr - avg) / ((hi - lo) / 4), 2) if (hi - lo) else 0.0
        z_scores.append(z)
        rows.append(InventoryRow(
            name=name, current=curr, prev_week=prev,
            five_yr_avg=avg, five_yr_low=lo, five_yr_high=hi,
            pct_vs_avg=pct, surprise=surprise, z_score=z,
            trend="Drawing" if curr < prev else "Building",
        ))

    avg_z = float(np.mean(z_scores))
    inv_score = max(0.0, min(100.0, 50.0 - avg_z * 10))
    signal = "Bullish" if inv_score > 60 else ("Bearish" if inv_score < 40 else "Neutral")

    return _set("oil_inventory", InventoryData(
        rows=rows, signal=signal, signal_score=round(inv_score, 1),
        as_of=datetime.utcnow().strftime("%Y-%m-%d"),
    ))


@router.get("/macro", response_model=MacroData)
def get_macro():
    if c := _get("oil_macro"):
        return c

    syms = [SYM["wti"], SYM["dxy"], SYM["us10y"], SYM["us2y"], SYM["gold"], SYM["vix"]]
    df = _dl(syms, period="1y")
    wti = df[SYM["wti"]].dropna() if SYM["wti"] in df else pd.Series(dtype=float)

    def _corr(sym: str) -> float:
        if sym not in df or wti.empty:
            return 0.0
        s = df[sym].dropna()
        idx = wti.index.intersection(s.index)
        return float(wti[idx].tail(90).corr(s[idx].tail(90))) if len(idx) >= 30 else 0.0

    dxy_v  = _last(df, SYM["dxy"])
    us10_v = _last(df, SYM["us10y"])
    us2_v  = _last(df, SYM["us2y"])
    gold_v = _last(df, SYM["gold"])
    vix_v  = _last(df, SYM["vix"])

    rows = [
        MacroRow(name="DXY (Dollar Index)", value=round(dxy_v, 2),
                 change=round(_chg(df[SYM["dxy"]].dropna(), 1), 2) if SYM["dxy"] in df else 0.0,
                 corr90d=round(_corr(SYM["dxy"]), 2),
                 signal="Bearish" if dxy_v > 105 else ("Bullish" if dxy_v < 100 else "Neutral")),
        MacroRow(name="US 10Y Yield (%)", value=round(us10_v, 2),
                 change=round(_chg(df[SYM["us10y"]].dropna(), 1), 2) if SYM["us10y"] in df else 0.0,
                 corr90d=round(_corr(SYM["us10y"]), 2),
                 signal="Bearish" if us10_v > 4.5 else ("Bullish" if us10_v < 3.5 else "Neutral")),
        MacroRow(name="US 2Y Yield (%)", value=round(us2_v, 2),
                 change=round(_chg(df[SYM["us2y"]].dropna(), 1), 2) if SYM["us2y"] in df else 0.0,
                 corr90d=round(_corr(SYM["us2y"]), 2), signal="Neutral"),
        MacroRow(name="Gold ($/oz)", value=round(gold_v, 1),
                 change=round(_chg(df[SYM["gold"]].dropna(), 1), 2) if SYM["gold"] in df else 0.0,
                 corr90d=round(_corr(SYM["gold"]), 2),
                 signal="Bullish" if gold_v > 2200 else "Neutral"),
        MacroRow(name="VIX", value=round(vix_v, 1),
                 change=round(_chg(df[SYM["vix"]].dropna(), 1), 2) if SYM["vix"] in df else 0.0,
                 corr90d=round(_corr(SYM["vix"]), 2),
                 signal="Bearish" if vix_v > 25 else "Neutral"),
    ]

    macro_score = 50.0
    if dxy_v < 100: macro_score += 12
    elif dxy_v > 107: macro_score -= 12
    if us10_v < 4.0: macro_score += 8
    elif us10_v > 5.0: macro_score -= 8
    if gold_v > 2200: macro_score += 5
    if vix_v > 30: macro_score -= 5
    macro_score = max(0.0, min(100.0, macro_score))

    dxy_s = df[SYM["dxy"]].dropna() if SYM["dxy"] in df else pd.Series(dtype=float)
    dxy_chg = _chg(dxy_s, 5) if len(dxy_s) > 5 else 0.0
    dxy_trend = "Weakening" if dxy_chg < -0.3 else ("Strengthening" if dxy_chg > 0.3 else "Stable")

    return _set("oil_macro", MacroData(
        rows=rows, macro_score=round(macro_score, 1),
        dxy_trend=dxy_trend, real_rate=round(us10_v - 2.5, 2),
        breakeven=2.5, as_of=datetime.utcnow().strftime("%Y-%m-%d"),
    ))


@router.get("/futures-curve", response_model=FuturesCurve)
def get_futures_curve():
    if c := _get("oil_futures"):
        return c

    df = _dl([SYM["wti"]], period="5d")
    base = 75.0
    if SYM["wti"] in df:
        s = df[SYM["wti"]].dropna()
        if not s.empty:
            base = float(s.iloc[-1])

    # Synthetic curve using cost-of-carry + inventory signal
    # Inventories below 5yr avg → backwardation; above → contango
    inv_pct = -2.4  # % below 5yr avg (from inventory data)
    slope_per_month = inv_pct * -0.04  # backwardation when inv low

    tenors = ["1M", "2M", "3M", "6M", "9M", "12M", "18M", "24M"]
    months = [1, 2, 3, 6, 9, 12, 18, 24]
    points = []
    for t, m in zip(tenors, months):
        # Diminishing slope at long end
        adj = slope_per_month * m * (1 - m / 48)
        points.append(FuturesPoint(tenor=t, price=round(base + adj, 2), months_out=m))

    spread = round(points[0].price - points[-1].price, 2)
    structure = "Backwardation" if spread > 0.5 else ("Contango" if spread < -0.5 else "Flat")
    signal = "Bullish" if structure == "Backwardation" else ("Bearish" if structure == "Contango" else "Neutral")

    return _set("oil_futures", FuturesCurve(
        points=points, structure=structure,
        front_back_spread=spread, signal=signal,
    ))


@router.get("/technical", response_model=TechnicalData)
def get_technical():
    if c := _get("oil_technical"):
        return c

    raw = _dl_ohlcv(SYM["wti"], period="2y")
    if raw.empty or len(raw) < 50:
        raise HTTPException(503, "Technical data unavailable")

    close = raw["Close"]
    price = float(close.iloc[-1])

    ema20  = float(_ema(close, 20).iloc[-1])
    ema50  = float(_ema(close, 50).iloc[-1])
    ema200 = float(_ema(close, 200).iloc[-1]) if len(close) >= 200 else ema50

    rsi_v = float(_rsi(close).iloc[-1])

    macd_l  = _ema(close, 12) - _ema(close, 26)
    macd_sg = _ema(macd_l, 9)
    macd_h  = macd_l - macd_sg
    macd_v  = float(macd_l.iloc[-1])
    sig_v   = float(macd_sg.iloc[-1])
    hist_v  = float(macd_h.iloc[-1])

    atr_v   = _atr(raw)

    bb_mid  = float(close.rolling(20).mean().iloc[-1])
    bb_std  = float(close.rolling(20).std().iloc[-1])
    bb_upper = round(bb_mid + 2 * bb_std, 2)
    bb_lower = round(bb_mid - 2 * bb_std, 2)

    def _ind(name: str, value: float, bull: bool) -> TechIndicator:
        return TechIndicator(name=name, value=value,
                             signal="Bullish" if bull else "Bearish")

    indicators = [
        _ind("EMA 20",          round(ema20, 2),  price > ema20),
        _ind("EMA 50",          round(ema50, 2),  price > ema50),
        _ind("EMA 200",         round(ema200, 2), price > ema200),
        TechIndicator(name="RSI(14)", value=round(rsi_v, 1),
                      signal="Overbought" if rsi_v > 70 else ("Oversold" if rsi_v < 30 else
                             ("Bullish" if rsi_v > 50 else "Bearish"))),
        _ind("MACD",            round(macd_v, 3), macd_v > sig_v),
        TechIndicator(name="Bollinger Bands", value=round(price, 2),
                      signal="Overbought" if price > bb_upper else
                             ("Oversold" if price < bb_lower else "Neutral")),
    ]

    # Support / Resistance from recent pivots
    recent = close.tail(63)
    h60, l60 = float(recent.max()), float(recent.min())
    pivot = (h60 + l60 + price) / 3.0
    levels = [
        SRLevel(type="Resistance", level=round(h60, 2), strength="Strong"),
        SRLevel(type="Resistance", level=round(pivot + (pivot - l60), 2), strength="Moderate"),
        SRLevel(type="Support",    level=round(pivot, 2), strength="Moderate"),
        SRLevel(type="Support",    level=round(l60, 2), strength="Strong"),
    ]

    bull_n = sum(1 for i in indicators if i.signal in ("Bullish", "Oversold"))
    bear_n = sum(1 for i in indicators if i.signal in ("Bearish", "Overbought"))
    tech_score = max(0.0, min(100.0, 50.0 + (bull_n - bear_n) * 9))

    # Daily series (last 180 days) for chart
    series = []
    for idx, row in raw.tail(180).iterrows():
        series.append({
            "date":  idx.strftime("%Y-%m-%d"),
            "open":  round(float(row.get("Open",  row["Close"])), 2),
            "high":  round(float(row.get("High",  row["Close"])), 2),
            "low":   round(float(row.get("Low",   row["Close"])), 2),
            "close": round(float(row["Close"]), 2),
            "ema20": round(float(_ema(raw["Close"][:raw.index.get_loc(idx)+1], 20).iloc[-1]), 2),
            "ema50": round(float(_ema(raw["Close"][:raw.index.get_loc(idx)+1], 50).iloc[-1]), 2),
        })

    return _set("oil_technical", TechnicalData(
        price=round(price, 2), ema20=round(ema20, 2), ema50=round(ema50, 2), ema200=round(ema200, 2),
        rsi=round(rsi_v, 1), macd=round(macd_v, 3), macd_signal=round(sig_v, 3), macd_hist=round(hist_v, 3),
        atr=round(atr_v, 2), bb_upper=bb_upper, bb_lower=bb_lower, bb_mid=round(bb_mid, 2),
        indicators=indicators, levels=levels, tech_score=round(tech_score, 1), series=series,
    ))


@router.get("/positioning", response_model=PositioningData)
def get_positioning():
    if c := _get("oil_positioning"):
        return c

    df = _dl([SYM["wti"]], period="2y")
    wti = df[SYM["wti"]].dropna() if SYM["wti"] in df else pd.Series(dtype=float)
    rsi_s = _rsi(wti) if len(wti) > 20 else pd.Series([50.0])
    rsi_v = float(rsi_s.iloc[-1])

    # Proxy: RSI → net positioning (in thousands of contracts)
    base_net = (rsi_v - 50) * 3.0
    mm_long  = max(50, 250 + base_net * 1.5)
    mm_short = max(50, 250 - base_net * 1.2)
    mm_net   = mm_long - mm_short

    crowding = min(90.0, abs(rsi_v - 50) * 2.5)
    extreme_long  = rsi_v > 70
    extreme_short = rsi_v < 30
    signal = "Bearish" if extreme_long else ("Bullish" if extreme_short else "Neutral")

    # Weekly history (52w)
    weekly = wti.resample("W").last() if not wti.empty else pd.Series(dtype=float)
    rsi_w  = _rsi(weekly, 10) if len(weekly) > 10 else pd.Series(dtype=float)
    history = [
        {"date": str(idx.date()), "net_long": round((float(r) - 50) * 3, 1)}
        for idx, r in rsi_w.tail(52).items()
    ]

    return _set("oil_positioning", PositioningData(
        mm_long=round(mm_long, 0), mm_short=round(mm_short, 0), mm_net=round(mm_net, 0),
        commercial_net=round(-mm_net * 0.8, 0), large_spec_net=round(mm_net * 0.3, 0),
        net_chg=round(base_net * 0.1, 1), crowding=round(crowding, 1),
        signal=signal, extreme_long=extreme_long, extreme_short=extreme_short,
        history=history,
    ))


@router.get("/models", response_model=ModelsData)
def get_models():
    if c := _get("oil_models"):
        return c

    syms = [SYM["wti"], SYM["dxy"], SYM["gold"], SYM["us10y"], SYM["vix"]]
    df = _dl(syms, period="2y")
    wti = df[SYM["wti"]].dropna() if SYM["wti"] in df else pd.Series(dtype=float)
    current = float(wti.iloc[-1]) if not wti.empty else 75.0

    # ── Fair Value via OLS ─────────────────────────────────────────────────
    fair_value = current
    r2 = 0.0
    fv_inputs: dict = {}
    try:
        from sklearn.linear_model import LinearRegression
        from sklearn.preprocessing import StandardScaler
        factors = [SYM["dxy"], SYM["gold"], SYM["us10y"], SYM["vix"]]
        panel = pd.DataFrame({"y": wti})
        for s in factors:
            if s in df:
                panel[s] = df[s]
        panel = panel.dropna()
        if len(panel) >= 60:
            X = panel.drop("y", axis=1).values
            y = panel["y"].values
            sx, sy = StandardScaler(), StandardScaler()
            Xs = sx.fit_transform(X)
            ys = sy.fit_transform(y.reshape(-1, 1)).ravel()
            m = LinearRegression().fit(Xs, ys)
            r2 = float(m.score(Xs, ys))
            Xl = sx.transform(panel.drop("y", axis=1).iloc[[-1]])
            fvs = m.predict(Xl)[0]
            fair_value = float(sy.inverse_transform([[fvs]])[0][0])
            fv_inputs = {c: round(float(panel.drop("y", axis=1).iloc[-1][i]), 2)
                         for i, c in enumerate([SYM["dxy"], SYM["gold"], SYM["us10y"], SYM["vix"]])}
    except Exception as e:
        logger.warning(f"Fair value error: {e}")

    mispricing = round((current / fair_value - 1) * 100, 1) if fair_value else 0.0

    # ── ARIMA / EWM Forecast ──────────────────────────────────────────────
    forecasts: list[ForecastPt] = []
    model_name = "EWM Trend"
    horizons = [("1W", 5), ("1M", 21), ("3M", 63), ("6M", 126)]

    if len(wti) >= 100:
        try:
            from statsmodels.tsa.arima.model import ARIMA
            fit = ARIMA(wti.tail(252), order=(2, 1, 2)).fit()
            model_name = "ARIMA(2,1,2)"
            for label, h in horizons:
                fc = fit.forecast(steps=h)
                fc_v = float(fc.iloc[-1])
                ci = float(wti.tail(30).std()) * np.sqrt(h / 21)
                forecasts.append(ForecastPt(
                    label=label, price=round(fc_v, 2),
                    low=round(fc_v - ci, 2), high=round(fc_v + ci, 2),
                ))
        except Exception as e:
            logger.warning(f"ARIMA failed, using EWM: {e}")

    if not forecasts:
        ef = float(_ema(wti, 12).iloc[-1])
        es = float(_ema(wti, 26).iloc[-1])
        trend_d = (ef - es) / 26
        vol = float(wti.pct_change().tail(30).std())
        for label, h in horizons:
            fc_v = current + trend_d * h
            ci = current * vol * np.sqrt(h)
            forecasts.append(ForecastPt(
                label=label, price=round(fc_v, 2),
                low=round(fc_v - ci, 2), high=round(fc_v + ci, 2),
            ))

    return _set("oil_models", ModelsData(
        fair_value=FairValue(fair_value=round(fair_value, 2), current=round(current, 2),
                             mispricing_pct=mispricing, inputs=fv_inputs),
        forecasts=forecasts, model=model_name, r2=round(r2, 3),
    ))


@router.get("/geopolitical", response_model=GeoData)
def get_geopolitical():
    if c := _get("oil_geo"):
        return c

    df = _dl([SYM["vix"], SYM["gold"]], period="3mo")
    vix_v  = _last(df, SYM["vix"])  or 20.0
    gold_v = _last(df, SYM["gold"]) or 2000.0

    score = 30.0
    if vix_v > 30: score += 30
    elif vix_v > 20: score += 15
    if gold_v > 2500: score += 20
    elif gold_v > 2200: score += 10
    score += 15  # ongoing Middle East tensions
    score = min(100.0, score)

    level = "Extreme" if score >= 70 else ("High" if score >= 50 else ("Moderate" if score >= 30 else "Low"))

    return _set("oil_geo", GeoData(
        score=round(score, 1), level=level,
        events=[GeoEvent(**e) for e in _GEO_EVENTS],
        hotspots=["Strait of Hormuz", "Red Sea / Bab-el-Mandeb", "Black Sea", "Strait of Malacca"],
    ))


@router.get("/composite", response_model=CompositeData)
def get_composite():
    if c := _get("oil_composite"):
        return c

    supply = get_supply()
    inv    = get_inventory()
    macro  = get_macro()
    tech   = get_technical()
    pos    = get_positioning()

    spare_pct  = supply.opec_spare / supply.opec_total if supply.opec_total else 0.1
    supply_sc  = max(20.0, min(80.0, 75.0 - spare_pct * 200))
    if supply.signal == "Bullish": supply_sc += 10
    elif supply.signal == "Bearish": supply_sc -= 10

    demand_sc = 50.0 + (macro.macro_score - 50) * 0.3
    inv_sc    = inv.signal_score
    macro_sc  = macro.macro_score
    pos_sc    = 70.0 if pos.extreme_short else (30.0 if pos.extreme_long else
                max(20.0, min(80.0, 50.0 + (50.0 - pos.crowding) * 0.3)))
    tech_sc   = tech.tech_score

    total = (supply_sc * 0.25 + demand_sc * 0.25 + inv_sc * 0.15 +
             macro_sc * 0.15 + pos_sc * 0.10 + tech_sc * 0.10)
    total = max(0.0, min(100.0, total))

    price = tech.price
    atr   = tech.atr

    if total >= 65:
        signal, regime = "Long",  "Bullish"
        entry  = price
        stop   = round(price - 2 * atr, 2)
        target = round(price + 3 * atr, 2)
    elif total <= 35:
        signal, regime = "Short", "Bearish"
        entry  = price
        stop   = round(price + 2 * atr, 2)
        target = round(price - 3 * atr, 2)
    else:
        signal, regime = "Neutral", "Neutral"
        entry  = price
        stop   = round(price - 1.5 * atr, 2)
        target = round(price + 1.5 * atr, 2)

    risk   = abs(entry - stop)
    reward = abs(target - entry)
    rr     = round(reward / risk, 2) if risk else 0.0

    return _set("oil_composite", CompositeData(
        total=round(total, 1),
        supply=round(supply_sc, 1), demand=round(demand_sc, 1), inventory=round(inv_sc, 1),
        macro=round(macro_sc, 1), positioning=round(pos_sc, 1), technical=round(tech_sc, 1),
        regime=regime, signal=signal,
        entry=round(entry, 2), stop=round(stop, 2), target=round(target, 2),
        risk_reward=rr, confidence=round(min(100.0, abs(total - 50) * 2), 1),
    ))


@router.get("/scenarios", response_model=ScenarioData)
def get_scenarios():
    if c := _get("oil_scenarios"):
        return c

    df  = _dl([SYM["wti"]], period="5d")
    bp  = _last(df, SYM["wti"]) or 75.0

    scenarios = [
        ScenarioItem(name="OPEC+ Surprise Cut (1 mb/d)",
                     description="Voluntary cut announced to defend $80 price floor",
                     price_low=round(bp*1.05,1), price_expected=round(bp*1.10,1), price_high=round(bp*1.18,1),
                     probability=20.0, horizon="1–4 weeks", direction="Bullish"),
        ScenarioItem(name="Iran Sanctions Relief (+1.5 mb/d)",
                     description="Nuclear deal returns 1.5 mb/d Iranian crude to global market",
                     price_low=round(bp*0.82,1), price_expected=round(bp*0.88,1), price_high=round(bp*0.93,1),
                     probability=15.0, horizon="2–6 months", direction="Bearish"),
        ScenarioItem(name="Strait of Hormuz Closure",
                     description="Military escalation disrupts 20% of global seaborne oil trade",
                     price_low=round(bp*1.20,1), price_expected=round(bp*1.35,1), price_high=round(bp*1.60,1),
                     probability=5.0, horizon="Days to weeks", direction="Bullish"),
        ScenarioItem(name="Global Recession (Hard Landing)",
                     description="Major economies enter recession; oil demand falls 2 mb/d below baseline",
                     price_low=round(bp*0.60,1), price_expected=round(bp*0.70,1), price_high=round(bp*0.80,1),
                     probability=20.0, horizon="3–12 months", direction="Bearish"),
        ScenarioItem(name="China Mega-Stimulus",
                     description="Beijing announces fiscal + monetary package boosting demand 0.8 mb/d",
                     price_low=round(bp*1.06,1), price_expected=round(bp*1.09,1), price_high=round(bp*1.14,1),
                     probability=25.0, horizon="1–3 months", direction="Bullish"),
        ScenarioItem(name="US SPR Release (50 mb)",
                     description="Coordinated IEA/US emergency release to cap energy inflation",
                     price_low=round(bp*0.88,1), price_expected=round(bp*0.92,1), price_high=round(bp*0.96,1),
                     probability=15.0, horizon="1–2 months", direction="Bearish"),
    ]

    return _set("oil_scenarios", ScenarioData(base_price=round(bp, 2), scenarios=scenarios))

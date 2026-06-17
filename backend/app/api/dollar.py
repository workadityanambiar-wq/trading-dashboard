from fastapi import APIRouter
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timezone, timedelta
import time, logging

logger = logging.getLogger(__name__)
router = APIRouter()

_cache: dict = {}
CACHE_TTL = 900

def _get(k):
    v = _cache.get(k)
    if v and time.time() - v["ts"] < CACHE_TTL:
        return v["data"]
    return None

def _set(k, data):
    _cache[k] = {"ts": time.time(), "data": data}

# ── Symbols ───────────────────────────────────────────────────────────────────
DXY_SYM = "DX-Y.NYB"
US_YIELD_SYMS = {"US3M": "^IRX", "US5Y": "^FVX", "US10Y": "^TNX", "US30Y": "^TYX"}
CURRENCY_SYMS = {
    "EUR/USD": "EURUSD=X", "USD/JPY": "USDJPY=X", "GBP/USD": "GBPUSD=X",
    "AUD/USD": "AUDUSD=X", "NZD/USD": "NZDUSD=X", "USD/CAD": "USDCAD=X",
    "USD/CHF": "USDCHF=X", "USD/SEK": "USDSEK=X",
}
USD_BASE_PAIRS = {"USD/JPY", "USD/CAD", "USD/CHF", "USD/SEK"}
EM_SYMS = {
    "USD/INR": "USDINR=X", "USD/BRL": "USDBRL=X", "USD/MXN": "USDMXN=X",
    "USD/TRY": "USDTRY=X", "USD/ZAR": "USDZAR=X", "USD/KRW": "USDKRW=X",
}
CROSS_ASSET_SYMS = {
    "SPY": "SPY", "QQQ": "QQQ", "TLT": "TLT",
    "Gold": "GC=F", "Silver": "SI=F", "Oil": "CL=F", "Copper": "HG=F",
    "Bitcoin": "BTC-USD", "Ethereum": "ETH-USD",
}

# ── Static data ───────────────────────────────────────────────────────────────
FOREIGN_YIELDS = {"Germany 10Y": 2.42, "Japan 10Y": 1.52, "UK 10Y": 4.48, "Canada 10Y": 3.18}
BREAKEVEN = 2.22

FED_STATIC = {
    "current_rate": 4.25, "target_range": "4.25–4.50",
    "next_meeting": "2026-07-30",
    "cut_prob": 58, "hike_prob": 4, "hold_prob": 38,
    "cuts_priced_2026": 2.3, "hikes_priced_2026": 0.0,
    "dot_plot_eoy": 3.875, "market_rate_eoy": 3.625,
}
LIQUIDITY_STATIC = {
    "fed_balance_sheet_b": 6820, "tga_b": 650, "rrp_b": 95,
    "fed_bs_4w_chg_b": -28, "tga_4w_chg_b": 120, "rrp_4w_chg_b": -18,
    "liquidity_trend": "Tightening", "dollar_impact": "Supportive",
}
POSITIONING_STATIC = {
    "net_contracts": 14800, "net_4w_chg": -4200, "net_12w_chg": 9600,
    "extreme_long": False, "extreme_short": False, "signal": "Neutral",
    "as_of": "2026-06-10",
}

# ── Helpers ───────────────────────────────────────────────────────────────────
def _dl(sym, period="2y"):
    try:
        df = yf.download(sym, period=period, interval="1d", auto_adjust=True, progress=False)
        if df.empty:
            return None
        if isinstance(df.columns, pd.MultiIndex):
            lvl0 = df.columns.get_level_values(0)
            lvl1 = df.columns.get_level_values(1)
            # Use whichever level contains standard OHLCV names
            if "Close" in lvl0:
                df.columns = lvl0
            elif "Close" in lvl1:
                df.columns = lvl1
            else:
                df.columns = lvl0
        # Drop any duplicate column names
        df = df.loc[:, ~df.columns.duplicated()]
        return df
    except Exception as e:
        logger.warning(f"Download {sym}: {e}")
        return None


def _close_series(df):
    """Always return a 1-D Series from a DataFrame's Close column."""
    if df is None or df.empty:
        return pd.Series(dtype=float)
    c = df["Close"] if "Close" in df.columns else df.iloc[:, 0]
    if isinstance(c, pd.DataFrame):
        c = c.iloc[:, 0]
    return c.dropna()

def _last(df):
    if df is None or df.empty: return 0.0
    return float(df["Close"].dropna().iloc[-1])

def _chg(df, days):
    if df is None or df.empty: return 0.0
    c = df["Close"].dropna()
    if len(c) <= days: return 0.0
    return float((c.iloc[-1] / c.iloc[-days] - 1) * 100)

def _ytd(df):
    if df is None or df.empty: return 0.0
    c = df["Close"].dropna()
    mask = c.index.year < datetime.now().year
    if not mask.any(): return 0.0
    return float((c.iloc[-1] / float(c[mask].iloc[-1]) - 1) * 100)

def _rsi(df, period=14):
    if df is None or df.empty: return 50.0
    c = df["Close"].dropna()
    d = c.diff()
    up   = d.clip(lower=0).ewm(span=period, adjust=False).mean()
    down = (-d.clip(upper=0)).ewm(span=period, adjust=False).mean()
    rs   = up / down.replace(0, np.nan)
    return float((100 - 100 / (1 + rs)).iloc[-1])

def _macd(df):
    if df is None or df.empty: return 0.0, 0.0, 0.0
    c = df["Close"].dropna()
    m = c.ewm(span=12, adjust=False).mean() - c.ewm(span=26, adjust=False).mean()
    s = m.ewm(span=9, adjust=False).mean()
    return float(m.iloc[-1]), float(s.iloc[-1]), float((m - s).iloc[-1])

def _adx(df, period=14):
    if df is None or len(df) < period + 10: return 20.0, 20.0, 20.0
    try:
        h = df["High"].dropna(); l = df["Low"].dropna(); c = df["Close"].dropna()
        idx = c.index; h, l, c = h.reindex(idx), l.reindex(idx), c.reindex(idx)
        tr   = pd.concat([h-l, (h-c.shift()).abs(), (l-c.shift()).abs()], axis=1).max(axis=1)
        dm_p = ((h-h.shift()) > (l.shift()-l)).astype(float) * (h-h.shift()).clip(lower=0)
        dm_m = ((l.shift()-l) > (h-h.shift())).astype(float) * (l.shift()-l).clip(lower=0)
        atr  = tr.ewm(span=period, adjust=False).mean()
        di_p = 100 * dm_p.ewm(span=period, adjust=False).mean() / atr.replace(0, np.nan)
        di_m = 100 * dm_m.ewm(span=period, adjust=False).mean() / atr.replace(0, np.nan)
        dx   = 100 * (di_p-di_m).abs() / (di_p+di_m).replace(0, np.nan)
        adx  = dx.ewm(span=period, adjust=False).mean()
        return float(adx.iloc[-1]), float(di_p.iloc[-1]), float(di_m.iloc[-1])
    except Exception:
        return 20.0, 20.0, 20.0

def _bbands(df, period=20, mult=2.0):
    if df is None or df.empty: return 0.0, 0.0, 0.0
    c = df["Close"].dropna()
    mid = c.rolling(period).mean(); std = c.rolling(period).std()
    return float((mid+mult*std).iloc[-1]), float(mid.iloc[-1]), float((mid-mult*std).iloc[-1])

def _ma(df, period):
    if df is None or df.empty: return None
    c = df["Close"].dropna()
    if len(c) < period: return None
    return float(c.rolling(period).mean().iloc[-1])

def _vol30(df):
    if df is None or df.empty: return 0.0
    return float(df["Close"].dropna().pct_change().dropna().tail(30).std() * np.sqrt(252) * 100)

def _corr(s1, s2, period):
    r1 = s1.pct_change().dropna(); r2 = s2.pct_change().dropna()
    combo = pd.concat([r1, r2], axis=1).dropna()
    if len(combo) < period: return 0.0
    return float(combo.tail(period).iloc[:, 0].corr(combo.tail(period).iloc[:, 1]))

# ── Composite Score ───────────────────────────────────────────────────────────
def _strength_score(dxy_df, currency_dfs):
    c = dxy_df["Close"].dropna()
    price = float(c.iloc[-1])
    ma20 = _ma(dxy_df, 20); ma50 = _ma(dxy_df, 50); ma200 = _ma(dxy_df, 200)
    trend_pts = (int(bool(ma20 and price > ma20)) + int(bool(ma50 and price > ma50)) + int(bool(ma200 and price > ma200))) * 10
    ret_1m = _chg(dxy_df, 21); ret_3m = _chg(dxy_df, 63); ret_6m = _chg(dxy_df, 126)
    mom_pts = (int(ret_1m > 0) + int(ret_3m > 0) + int(ret_6m > 0)) * 10
    stronger, total = 0, 0
    for name, df in currency_dfs.items():
        if df is not None and not df.empty:
            r = _chg(df, 21)
            if (name in USD_BASE_PAIRS and r > 0) or (name not in USD_BASE_PAIRS and r < 0):
                stronger += 1
            total += 1
    breadth_pts = int((stronger / max(total, 1)) * 40)
    score = min(100, trend_pts + mom_pts + breadth_pts)
    regime = ("Strong Bullish" if score >= 70 else "Bullish" if score >= 55 else
              "Neutral" if score >= 45 else "Bearish" if score >= 30 else "Strong Bearish")
    return {"score": score, "regime": regime, "trend_pts": trend_pts,
            "momentum_pts": mom_pts, "breadth_pts": breadth_pts,
            "breadth_pct": round(stronger / max(total, 1) * 100, 1)}

# ── Conviction Score ──────────────────────────────────────────────────────────
def _conviction(dxy_df, us10y, real_yield, cuts_priced, rrp_b, net_pos):
    c = dxy_df["Close"].dropna(); price = float(c.iloc[-1])
    ma20 = _ma(dxy_df, 20) or price; ma50 = _ma(dxy_df, 50) or price; ma200 = _ma(dxy_df, 200) or price
    trend = (int(price > ma20) + int(price > ma50) + int(price > ma200)) / 3 * 100
    ret_1m = _chg(dxy_df, 21); ret_3m = _chg(dxy_df, 63); ret_6m = _chg(dxy_df, 126)
    mom = 50 + int(ret_1m > 0)*16 + int(ret_3m > 0)*17 + int(ret_6m > 0)*17
    avg_foreign = sum(FOREIGN_YIELDS.values()) / len(FOREIGN_YIELDS)
    yield_diff = min(100, max(0, 50 + (us10y - avg_foreign) * 10))
    real_sc = min(100, max(0, 50 + real_yield * 15))
    fed_sc  = min(100, max(0, 100 - cuts_priced * 20))
    liq_sc  = min(100, max(0, 50 + (rrp_b - 300) / 10))
    pos_sc  = 20 if net_pos > 30000 else min(100, max(0, 50 + net_pos / 1000))
    score = round(trend*0.20 + mom*0.15 + yield_diff*0.20 + real_sc*0.15 + fed_sc*0.10 + liq_sc*0.10 + pos_sc*0.10, 1)
    score = min(100, max(0, score))
    signal = ("Strong Long USD" if score >= 70 else "Long USD" if score >= 57 else
              "Neutral" if score >= 43 else "Short USD" if score >= 30 else "Strong Short USD")
    return {
        "conviction": score, "signal": signal,
        "components": {"trend": round(trend,1), "momentum": round(mom,1), "yield_diff": round(yield_diff,1),
                       "real_yield": round(real_sc,1), "fed": round(fed_sc,1),
                       "liquidity": round(liq_sc,1), "positioning": round(pos_sc,1)},
        "weights": {"trend": 20, "momentum": 15, "yield_diff": 20, "real_yield": 15,
                    "fed": 10, "liquidity": 10, "positioning": 10},
    }

# ── Regime ────────────────────────────────────────────────────────────────────
def _regime(dxy_df, us10y_df, spy_df):
    c = dxy_df["Close"].dropna()
    strong = float(c.iloc[-1]) > float(c.rolling(50).mean().iloc[-1])
    rising_yields = _chg(us10y_df, 21) > 0 if us10y_df is not None else False
    rising_growth = _chg(spy_df, 63) > 0 if spy_df is not None else True
    if strong and rising_yields:
        return {"regime_id": 1, "name": "Strong Dollar + Rising Yields", "color": "#3b82f6",
                "favors": ["Financials", "Energy", "Value stocks", "USD assets"],
                "desc": "Rate differentials favor USD. Capital flows into US fixed income. Pressure on EM debt and commodities.",
                "strong_dollar": True, "rising_yields": True, "rising_growth": rising_growth}
    elif strong and not rising_yields:
        return {"regime_id": 2, "name": "Strong Dollar + Falling Yields", "color": "#8b5cf6",
                "favors": ["Defensive sectors", "Utilities", "Consumer staples", "Quality"],
                "desc": "Flight-to-safety bid. USD and bonds rise together. Risk-off. EM assets and cyclicals under pressure.",
                "strong_dollar": True, "rising_yields": False, "rising_growth": rising_growth}
    elif not strong and rising_growth:
        return {"regime_id": 3, "name": "Weak Dollar + Rising Growth", "color": "#10b981",
                "favors": ["Technology", "EM equities", "Commodities", "Gold", "International"],
                "desc": "Risk-on. Weak USD boosts commodity prices and EM earnings. Global growth outperforms US.",
                "strong_dollar": False, "rising_yields": rising_yields, "rising_growth": True}
    else:
        return {"regime_id": 4, "name": "Weak Dollar + Falling Growth", "color": "#f59e0b",
                "favors": ["Bonds (TLT)", "Gold", "JPY", "CHF", "Defensive"],
                "desc": "Stagflationary or recessionary pressure. Hard assets and safe havens outperform. Avoid cyclicals.",
                "strong_dollar": False, "rising_yields": rising_yields, "rising_growth": False}

# ── Signals ───────────────────────────────────────────────────────────────────
def _signals(dxy_df, us10y, real_yield, net_pos):
    c = dxy_df["Close"].dropna(); price = float(c.iloc[-1])
    ma50 = float(c.rolling(50).mean().iloc[-1]); ma200 = float(c.rolling(200).mean().iloc[-1])
    rsi_v = _rsi(dxy_df); sigs = []
    prev_above_50  = float(c.iloc[-6]) > float(c.rolling(50).mean().iloc[-6])
    prev_above_200 = float(c.iloc[-6]) > float(c.rolling(200).mean().iloc[-6])
    if not prev_above_50 and price > ma50:
        sigs.append({"type":"bullish","title":"DXY Crossed Above 50DMA","desc":f"Broke above {ma50:.2f}","severity":"high"})
    elif prev_above_50 and price < ma50:
        sigs.append({"type":"bearish","title":"DXY Crossed Below 50DMA","desc":f"Broke below {ma50:.2f}","severity":"high"})
    if not prev_above_200 and price > ma200:
        sigs.append({"type":"bullish","title":"DXY Above 200DMA","desc":f"Reclaimed {ma200:.2f}","severity":"critical"})
    elif prev_above_200 and price < ma200:
        sigs.append({"type":"bearish","title":"DXY Below 200DMA","desc":f"Broke below {ma200:.2f}","severity":"critical"})
    if rsi_v > 70:
        sigs.append({"type":"warning","title":"DXY Overbought","desc":f"RSI at {rsi_v:.1f} — pullback risk","severity":"medium"})
    elif rsi_v < 30:
        sigs.append({"type":"warning","title":"DXY Oversold","desc":f"RSI at {rsi_v:.1f} — bounce candidate","severity":"medium"})
    if real_yield > 2.0:
        sigs.append({"type":"bullish","title":"Real Yields Elevated","desc":f"10Y real yield {real_yield:.2f}% — strongly USD positive","severity":"high"})
    elif real_yield < 0.3:
        sigs.append({"type":"bearish","title":"Real Yields Suppressed","desc":f"10Y real yield {real_yield:.2f}% — USD headwind","severity":"medium"})
    if net_pos > 30000:
        sigs.append({"type":"warning","title":"Crowded Long USD","desc":f"CFTC net {net_pos:,} contracts — contrarian risk","severity":"high"})
    elif net_pos < -15000:
        sigs.append({"type":"warning","title":"Crowded Short USD","desc":f"CFTC net {net_pos:,} — squeeze risk","severity":"high"})
    if us10y > 5.0:
        sigs.append({"type":"bullish","title":"US Yields Above 5%","desc":f"10Y at {us10y:.2f}% — strong yield advantage vs G10","severity":"medium"})
    if not sigs:
        sigs.append({"type":"info","title":"No Active Signals","desc":"All indicators within normal ranges","severity":"low"})
    return sigs

# ── Backtest ──────────────────────────────────────────────────────────────────
def _backtest(dxy_df):
    c = dxy_df["Close"].dropna()
    if len(c) < 200: return []
    ma20 = c.rolling(20).mean(); ma50 = c.rolling(50).mean(); ma200 = c.rolling(200).mean()
    ts = (c > ma20).astype(int)*33 + (c > ma50).astype(int)*33 + (c > ma200).astype(int)*34
    f1 = c.pct_change(21).shift(-21)*100; f3 = c.pct_change(63).shift(-63)*100; f6 = c.pct_change(126).shift(-126)*100
    df = pd.DataFrame({"score": ts, "f1": f1, "f3": f3, "f6": f6}).dropna()
    out = []
    for label, lo, hi in [("Bearish (0–33)",0,33),("Neutral (34–66)",34,66),("Bullish (67–100)",67,100)]:
        sub = df[(df["score"]>=lo)&(df["score"]<=hi)]
        if len(sub):
            out.append({"bucket":label,"count":int(len(sub)),
                        "avg_1m":round(float(sub.f1.mean()),2),"avg_3m":round(float(sub.f3.mean()),2),"avg_6m":round(float(sub.f6.mean()),2),
                        "win_rate_1m":round(float((sub.f1>0).mean()*100),1),"win_rate_3m":round(float((sub.f3>0).mean()*100),1)})
    return out

# ── Endpoints ─────────────────────────────────────────────────────────────────
@router.get("/overview")
def overview():
    cached = _get("dxy_overview")
    if cached: return cached
    dxy = _dl(DXY_SYM, "2y")
    if dxy is None: return {"error": "DXY unavailable"}
    c = dxy["Close"].dropna(); price = float(c.iloc[-1])
    ma20 = _ma(dxy,20); ma50 = _ma(dxy,50); ma200 = _ma(dxy,200)
    rsi_v = _rsi(dxy); macd_v, macd_s, macd_h = _macd(dxy)
    adx_v, di_p, di_m = _adx(dxy); bb_u, bb_m, bb_l = _bbands(dxy)
    bb_pct = (price-bb_l)/(bb_u-bb_l)*100 if bb_u != bb_l else 50
    currency_dfs = {n: _dl(s,"6mo") for n,s in CURRENCY_SYMS.items()}
    strength = _strength_score(dxy, currency_dfs)
    series = [{"date": ts.strftime("%m/%d"), "price": round(float(p),3)}
              for ts, p in c.tail(60).items()]
    result = {
        "price": round(price,3), "daily": round(_chg(dxy,1),3),
        "weekly": round(_chg(dxy,5),3), "monthly": round(_chg(dxy,21),3),
        "ytd": round(_ytd(dxy),3), "vol30": round(_vol30(dxy),2),
        "ma20": round(ma20,3) if ma20 else None, "ma50": round(ma50,3) if ma50 else None,
        "ma200": round(ma200,3) if ma200 else None,
        "above_ma20": bool(ma20 and price>ma20), "above_ma50": bool(ma50 and price>ma50),
        "above_ma200": bool(ma200 and price>ma200),
        "rsi": round(rsi_v,2), "rsi_signal": "Overbought" if rsi_v>70 else "Oversold" if rsi_v<30 else "Neutral",
        "macd": round(macd_v,4), "macd_signal_line": round(macd_s,4), "macd_hist": round(macd_h,4),
        "macd_bullish": macd_h > 0,
        "adx": round(adx_v,2), "di_plus": round(di_p,2), "di_minus": round(di_m,2),
        "adx_signal": "Strong" if adx_v>25 else "Moderate" if adx_v>15 else "Weak",
        "bb_upper": round(bb_u,3), "bb_mid": round(bb_m,3), "bb_lower": round(bb_l,3),
        "bb_pct": round(bb_pct,1),
        "strength": strength, "series": series,
        "as_of": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    }
    _set("dxy_overview", result); return result


@router.get("/yields")
def yields():
    cached = _get("dxy_yields")
    if cached: return cached
    us = {}
    for name, sym in US_YIELD_SYMS.items():
        df = _dl(sym, "6mo")
        v = _last(df) if df is not None else 0
        us[name] = {"value": round(v,3), "chg_1m": round(_chg(df,21),3), "chg_3m": round(_chg(df,63),3)}
    us3m = us.get("US3M",{}).get("value",4.3); us5y = us.get("US5Y",{}).get("value",4.0)
    us["US2Y"] = {"value": round(us3m*0.4+us5y*0.6,3), "chg_1m":0, "chg_3m":0, "estimated":True}
    us10y_val = us.get("US10Y",{}).get("value",4.25)
    real_yield = round(us10y_val - BREAKEVEN, 3)
    real_signal = ("Strongly Dollar Positive" if real_yield>2.0 else
                   "Dollar Positive" if real_yield>1.0 else
                   "Neutral" if real_yield>0 else "Dollar Negative")
    foreign = [{"country":k,"yield_10y":v,"us_10y":us10y_val,
                 "spread":round(us10y_val-v,3),
                 "signal":"Dollar Supportive" if us10y_val>v else "Dollar Negative"}
               for k,v in FOREIGN_YIELDS.items()]
    curve = [{"tenor":"3M","yield":us.get("US3M",{}).get("value",0)},
             {"tenor":"2Y","yield":us.get("US2Y",{}).get("value",0)},
             {"tenor":"5Y","yield":us.get("US5Y",{}).get("value",0)},
             {"tenor":"10Y","yield":us.get("US10Y",{}).get("value",0)},
             {"tenor":"30Y","yield":us.get("US30Y",{}).get("value",0)}]
    us2y_v = us.get("US2Y",{}).get("value",4.0)
    spread_2s10s = round(us10y_val - us2y_v, 3)
    result = {
        "us_yields":us, "curve":curve, "curve_spread_2s10s":spread_2s10s,
        "curve_shape":"Normal" if spread_2s10s>0 else "Inverted",
        "foreign":foreign, "real_yield":real_yield, "breakeven":BREAKEVEN,
        "real_signal":real_signal,
        "as_of": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    }
    _set("dxy_yields", result); return result


@router.get("/fed")
def fed():
    cached = _get("dxy_fed")
    if cached: return cached
    result = {**FED_STATIC, "as_of": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")}
    _set("dxy_fed", result); return result


@router.get("/liquidity")
def liquidity():
    cached = _get("dxy_liq")
    if cached: return cached
    s = LIQUIDITY_STATIC
    net = s["fed_balance_sheet_b"] - s["tga_b"] - s["rrp_b"]
    prev_net = (s["fed_balance_sheet_b"]-s["fed_bs_4w_chg_b"]) - (s["tga_b"]-s["tga_4w_chg_b"]) - (s["rrp_b"]-s["rrp_4w_chg_b"])
    history = [
        {"label":"12W ago","value":round(net+280,0)},{"label":"8W ago","value":round(net+160,0)},
        {"label":"4W ago","value":round(prev_net,0)},{"label":"Current","value":round(net,0)},
    ]
    result = {**s, "net_liquidity_b":round(net,0), "net_4w_chg_b":round(net-prev_net,0),
              "history":history, "as_of":datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")}
    _set("dxy_liq", result); return result


@router.get("/currencies")
def currencies():
    cached = _get("dxy_currencies")
    if cached: return cached
    rows = []
    for name, sym in CURRENCY_SYMS.items():
        df = _dl(sym, "6mo")
        if df is None: continue
        r1 = _chg(df,21); r3 = _chg(df,63); r6 = _chg(df,126)
        usd_score = r1 if name in USD_BASE_PAIRS else -r1
        rows.append({"pair":name,"symbol":sym,"price":round(_last(df),5),
                     "ret_1m":round(r1,3),"ret_3m":round(r3,3),"ret_6m":round(r6,3),
                     "rsi":round(_rsi(df),1),"usd_score_1m":round(usd_score,3)})
    rows.sort(key=lambda x: x["usd_score_1m"], reverse=True)
    for i,r in enumerate(rows): r["rank"] = i+1
    result = {"pairs":rows,"as_of":datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")}
    _set("dxy_currencies",result); return result


@router.get("/cross-asset")
def cross_asset():
    cached = _get("dxy_cross")
    if cached: return cached
    dxy = _dl(DXY_SYM,"1y")
    if dxy is None: return {"error":"DXY unavailable"}
    dxy_c = dxy["Close"].dropna(); rows = []
    CLASSES = {"SPY":"Equities","QQQ":"Equities","TLT":"Bonds",
               "Gold":"Commodities","Silver":"Commodities","Oil":"Commodities","Copper":"Commodities",
               "Bitcoin":"Crypto","Ethereum":"Crypto"}
    for name, sym in CROSS_ASSET_SYMS.items():
        df = _dl(sym,"1y")
        if df is None: continue
        ac = df["Close"].dropna()
        c30 = _corr(dxy_c,ac,30); c90 = _corr(dxy_c,ac,90); c15 = _corr(dxy_c,ac,15)
        trend = ("Strengthening" if abs(c15-c90)>0.1 and c15>c90 else
                 "Weakening" if abs(c15-c90)>0.1 and c15<c90 else "Stable")
        sig = ("Strong Inverse" if c30<-0.5 else "Moderate Inverse" if c30<-0.3 else
               "Strong Positive" if c30>0.5 else "Moderate Positive" if c30>0.3 else "Uncorrelated")
        rows.append({"name":name,"symbol":sym,"asset_class":CLASSES.get(name,"Other"),
                     "corr_30d":round(c30,3),"corr_90d":round(c90,3),"trend":trend,"signal":sig})
    result = {"correlations":rows,"as_of":datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")}
    _set("dxy_cross",result); return result


@router.get("/em-stress")
def em_stress():
    cached = _get("dxy_em")
    if cached: return cached
    rows = []
    for name, sym in EM_SYMS.items():
        df = _dl(sym,"3mo")
        if df is None: continue
        r1 = _chg(df,21); vol = _vol30(df)
        stress = min(100,abs(r1)*5+vol*0.5)
        rows.append({"pair":name,"symbol":sym,"price":round(_last(df),4),
                     "ret_1m":round(r1,3),"vol30":round(vol,2),"stress":round(stress,1)})
    rows.sort(key=lambda x:x["stress"],reverse=True)
    for i,r in enumerate(rows): r["rank"] = i+1
    avg = sum(r["stress"] for r in rows)/max(len(rows),1)
    level = "Severe" if avg>60 else "Elevated" if avg>40 else "Moderate" if avg>20 else "Low"
    result = {"pairs":rows,"em_stress_score":round(avg,1),"em_stress_level":level,
              "as_of":datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")}
    _set("dxy_em",result); return result


@router.get("/positioning")
def positioning():
    cached = _get("dxy_pos")
    if cached: return cached
    net = POSITIONING_STATIC["net_contracts"]
    chg12w = POSITIONING_STATIC["net_12w_chg"]
    step = chg12w / 12
    history = [{"week":(datetime.now()-timedelta(weeks=12-i)).strftime("%m/%d"),
                "net":round(net - chg12w + step*i, 0)} for i in range(13)]
    history[-1]["net"] = float(net)
    result = {**POSITIONING_STATIC,"history":history}
    _set("dxy_pos",result); return result


@router.get("/regime")
def regime():
    cached = _get("dxy_regime")
    if cached: return cached
    dxy = _dl(DXY_SYM,"2y"); us10y = _dl("^TNX","6mo"); spy = _dl("SPY","6mo")
    if dxy is None: return {"error":"DXY unavailable"}
    result = {**_regime(dxy,us10y,spy),"as_of":datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")}
    _set("dxy_regime",result); return result


@router.get("/signals")
def signals():
    cached = _get("dxy_signals")
    if cached: return cached
    try:
        dxy = _dl(DXY_SYM,"2y"); us10y_df = _dl("^TNX","6mo")
        if dxy is None: return {"signals":[],"error":"DXY unavailable","count":0,"as_of":"n/a"}
        us10y_val = _last(us10y_df) if us10y_df else 4.25
        real_yield = us10y_val - BREAKEVEN
        sigs = _signals(dxy, us10y_val, real_yield, POSITIONING_STATIC["net_contracts"])
        result = {"signals":sigs,"count":len(sigs),"as_of":datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")}
        _set("dxy_signals",result); return result
    except Exception as e:
        logger.error(f"signals error: {e}", exc_info=True)
        return {"signals":[{"type":"info","title":"Signal Engine Unavailable","desc":str(e),"severity":"low"}],"count":1,"as_of":datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")}


@router.get("/conviction")
def conviction():
    cached = _get("dxy_conviction")
    if cached: return cached
    try:
        dxy = _dl(DXY_SYM,"2y"); us10y_df = _dl("^TNX","2y")
        if dxy is None: return {"error":"DXY unavailable"}
        us10y_val = _last(us10y_df) if us10y_df else 4.25
        real_yield = us10y_val - BREAKEVEN
        conv = _conviction(dxy, us10y_val, real_yield, FED_STATIC["cuts_priced_2026"],
                           LIQUIDITY_STATIC["rrp_b"], POSITIONING_STATIC["net_contracts"])
        bt = _backtest(dxy)
        # Build weekly conviction history using positional index to avoid get_loc issues
        close = dxy["Close"].dropna()
        n = len(close)
        history = []
        step = max(1, n // 13)
        for i in range(max(0, n - step*12), n, step):
            if i < 200: continue
            sub = close.iloc[:i+1]
            ma20_ = float(sub.rolling(20).mean().iloc[-1])
            ma50_ = float(sub.rolling(50).mean().iloc[-1])
            ma200_ = float(sub.rolling(200).mean().iloc[-1])
            price_ = float(sub.iloc[-1])
            s_ = int(price_ > ma20_)*33 + int(price_ > ma50_)*33 + int(price_ > ma200_)*34
            dt = pd.Timestamp(close.index[i])
            history.append({"date": dt.strftime("%m/%d"), "score": s_})
        result = {**conv,"backtest":bt,"history":history,"as_of":datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")}
        _set("dxy_conviction",result); return result
    except Exception as e:
        logger.error(f"conviction error: {e}", exc_info=True)
        return {"conviction":50,"signal":"Neutral","components":{},"weights":{},"backtest":[],"history":[],"as_of":datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),"error":str(e)}

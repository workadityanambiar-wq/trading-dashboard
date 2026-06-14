"""
Crowding Scanner.

Fetches 13F institutional ownership, analyst ratings, short interest, and
news volume from yfinance, then computes a cross-sectional crowding score.

Crowding Score (0-100):
  40% institutional ownership % (percentile rank)
  30% analyst buy % (percentile rank)
  20% low short % of float (low short = crowded long)
  10% news/media attention (proxy for social mentions)

Labels:
  >= 75  Extremely Crowded
  >= 60  Crowded
  >= 40  Moderate
  >= 25  Under the Radar
  <  25  Undiscovered
"""
from __future__ import annotations

import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

_CACHE: dict = {}
_CACHE_LOCK = threading.Lock()
_CACHE_TTL  = 86400  # 24 hours


def _safe_float(v, scale: float = 1.0, digits: int = 1):
    if v is None:
        return None
    try:
        f = float(v)
        return None if np.isnan(f) else round(f * scale, digits)
    except Exception:
        return None


def _fetch_one(ticker: str) -> tuple[str, dict]:
    try:
        t    = yf.Ticker(ticker)
        info = t.info or {}

        if len(info) < 5:
            return ticker, {}

        inst_pct    = _safe_float(info.get("heldPercentInstitutions"), 100)
        insider_pct = _safe_float(info.get("heldPercentInsiders"),     100)
        short_pct   = _safe_float(info.get("shortPercentOfFloat"),     100)
        short_ratio = _safe_float(info.get("shortRatio"))
        num_analysts = int(info.get("numberOfAnalystOpinions") or 0)
        rec_mean    = _safe_float(info.get("recommendationMean"), digits=2)
        price       = _safe_float(info.get("currentPrice") or info.get("regularMarketPrice"))
        target_med  = _safe_float(info.get("targetMedianPrice"))

        target_upside = None
        if target_med and price and price > 0:
            target_upside = round((target_med / price - 1) * 100, 1)

        # Analyst buy/hold/sell breakdown from recommendations table
        buy_pct  = None
        hold_pct = None
        sell_pct = None
        try:
            recs = t.recommendations
            if recs is not None and not recs.empty:
                latest = recs.iloc[-1]
                sb  = int(latest.get("strongBuy")   or 0)
                b   = int(latest.get("buy")          or 0)
                h   = int(latest.get("hold")         or 0)
                s   = int(latest.get("sell")         or 0)
                ss  = int(latest.get("strongSell")   or 0)
                tot = sb + b + h + s + ss
                if tot > 0:
                    buy_pct  = round((sb + b) / tot * 100, 1)
                    hold_pct = round(h / tot * 100, 1)
                    sell_pct = round((s + ss) / tot * 100, 1)
                    if num_analysts == 0:
                        num_analysts = tot
        except Exception:
            pass

        # Fallback: estimate from recommendationMean (1=StrongBuy, 5=Sell)
        if buy_pct is None and rec_mean:
            m = float(rec_mean)
            if   m <= 1.5: buy_pct = 85.0
            elif m <= 2.0: buy_pct = 70.0
            elif m <= 2.5: buy_pct = 55.0
            elif m <= 3.0: buy_pct = 35.0
            elif m <= 3.5: buy_pct = 15.0
            else:          buy_pct = 5.0

        # Upgrades / downgrades in last 90 days
        upgrades = downgrades = 0
        try:
            ud = t.upgrades_downgrades
            if ud is not None and not ud.empty:
                cutoff = pd.Timestamp.now(tz=ud.index.tz) - pd.Timedelta(days=90)
                recent = ud[ud.index > cutoff]
                if "Action" in recent.columns:
                    acts = recent["Action"].str.lower()
                    upgrades   = int((acts == "up").sum())
                    downgrades = int((acts == "down").sum())
        except Exception:
            pass

        # News count as social/media attention proxy
        news_count = 0
        try:
            news = t.news
            news_count = len(news) if news else 0
        except Exception:
            pass

        return ticker, {
            "inst_pct":      inst_pct,
            "insider_pct":   insider_pct,
            "short_pct":     short_pct,
            "short_ratio":   short_ratio,
            "num_analysts":  num_analysts,
            "buy_pct":       buy_pct,
            "hold_pct":      hold_pct,
            "sell_pct":      sell_pct,
            "rec_mean":      rec_mean,
            "target_upside": target_upside,
            "upgrades_90d":  upgrades,
            "downgrades_90d": downgrades,
            "news_count":    news_count,
        }
    except Exception as exc:
        logger.debug("crowding fetch failed for %s: %s", ticker, exc)
        return ticker, {}


def _crowding_label(score: float) -> str:
    if score >= 75: return "Extremely Crowded"
    if score >= 60: return "Crowded"
    if score >= 40: return "Moderate"
    if score >= 25: return "Under the Radar"
    return "Undiscovered"


def scan_crowding(tickers: list[str], max_workers: int = 8) -> pd.DataFrame:
    """
    Fetch crowding signals for each ticker and return a scored DataFrame.
    Results are cached for 24 hours.
    """
    cache_key = tuple(sorted(tickers))
    now = time.time()

    with _CACHE_LOCK:
        if cache_key in _CACHE:
            ts, df = _CACHE[cache_key]
            if now - ts < _CACHE_TTL:
                return df

    logger.info("crowding scan: fetching %d tickers (workers=%d)", len(tickers), max_workers)

    raw: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(_fetch_one, t): t for t in tickers}
        for fut in as_completed(futures):
            ticker, data = fut.result()
            if data:
                raw[ticker] = data

    if not raw:
        return pd.DataFrame()

    df = pd.DataFrame.from_dict(raw, orient="index")
    df.index.name = "ticker"

    def pct_rank(s: pd.Series, invert: bool = False) -> pd.Series:
        s2 = s.fillna(s.median() if s.notna().any() else 50.0)
        return (-s2 if invert else s2).rank(pct=True)

    # Cross-sectional percentile ranks
    p_inst  = pct_rank(df["inst_pct"])                      # high inst = crowded
    p_buy   = pct_rank(df["buy_pct"])                       # high analyst love = crowded
    p_short = pct_rank(df["short_pct"], invert=True)        # low short = crowded long
    p_news  = pct_rank(df["news_count"])                    # high media = crowded attention

    df["crowding_score"] = (
        0.40 * p_inst
        + 0.30 * p_buy
        + 0.20 * p_short
        + 0.10 * p_news
    ) * 100

    df["crowding_score"] = df["crowding_score"].round(1)
    df["crowding_label"] = df["crowding_score"].apply(_crowding_label)
    df["net_upgrades"]   = df["upgrades_90d"].fillna(0) - df["downgrades_90d"].fillna(0)

    with _CACHE_LOCK:
        _CACHE[cache_key] = (now, df.copy())

    return df

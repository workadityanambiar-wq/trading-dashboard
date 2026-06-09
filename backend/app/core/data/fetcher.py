import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta, date
from typing import List, Optional
import time
import logging

from app.core.data import cache

logger = logging.getLogger(__name__)

_BATCH_SIZE = 50
_RATE_LIMIT_SLEEP = 0.3


def ensure_prices(
    tickers: List[str],
    start: str,
    end: Optional[str] = None,
    force_refresh: bool = False,
) -> None:
    """Fetch any missing price data from yfinance and persist to DuckDB."""
    if end is None:
        end = datetime.today().strftime("%Y-%m-%d")

    to_fetch: List[str] = []
    for t in tickers:
        last = cache.get_last_date(t)
        if force_refresh or last is None:
            to_fetch.append(t)
        else:
            yesterday = (datetime.today() - timedelta(days=1)).date()
            if last < yesterday:
                to_fetch.append(t)

    if not to_fetch:
        return

    logger.info(f"Fetching {len(to_fetch)} tickers from yfinance")
    for i in range(0, len(to_fetch), _BATCH_SIZE):
        batch = to_fetch[i : i + _BATCH_SIZE]
        df = _fetch_batch(batch, start, end)
        if not df.empty:
            cache.store_prices(df)
        if i + _BATCH_SIZE < len(to_fetch):
            time.sleep(_RATE_LIMIT_SLEEP)


def _fetch_batch(tickers: List[str], start: str, end: str) -> pd.DataFrame:
    try:
        raw = yf.download(
            tickers,
            start=start,
            end=end,
            auto_adjust=False,
            progress=False,
            threads=True,
        )
    except Exception as e:
        logger.error(f"yfinance download failed: {e}")
        return pd.DataFrame()

    if raw.empty:
        return pd.DataFrame()

    if len(tickers) == 1:
        return _parse_single(raw, tickers[0])
    return _parse_multi(raw, tickers)


def _parse_single(raw: pd.DataFrame, ticker: str) -> pd.DataFrame:
    raw = raw.copy()
    raw.columns = [c.lower().replace(" ", "_") for c in raw.columns]
    adj_col = "adj_close" if "adj_close" in raw.columns else "close"
    df = pd.DataFrame(
        {
            "date": raw.index.date,
            "ticker": ticker,
            "open": raw.get("open", np.nan),
            "high": raw.get("high", np.nan),
            "low": raw.get("low", np.nan),
            "close": raw.get("close", np.nan),
            "adj_close": raw[adj_col],
            "volume": raw.get("volume", 0).fillna(0).astype("int64"),
        }
    )
    return df.dropna(subset=["adj_close"]).reset_index(drop=True)


def _parse_multi(raw: pd.DataFrame, tickers: List[str]) -> pd.DataFrame:
    frames = []
    for ticker in tickers:
        try:
            if isinstance(raw.columns, pd.MultiIndex):
                sub = raw.xs(ticker, axis=1, level=1).copy()
            else:
                sub = raw.copy()

            sub.columns = [c.lower().replace(" ", "_") for c in sub.columns]
            adj_col = "adj_close" if "adj_close" in sub.columns else "close"

            df = pd.DataFrame(
                {
                    "date": sub.index.date,
                    "ticker": ticker,
                    "open": sub.get("open", np.nan),
                    "high": sub.get("high", np.nan),
                    "low": sub.get("low", np.nan),
                    "close": sub.get("close", np.nan),
                    "adj_close": sub[adj_col],
                    "volume": sub.get("volume", 0).fillna(0).astype("int64"),
                }
            )
            frames.append(df.dropna(subset=["adj_close"]))
        except Exception as e:
            logger.warning(f"Failed to parse {ticker}: {e}")

    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()

"""
Fundamental data fetching via yfinance.

Fetched on demand, cached in DuckDB with 24-hour TTL.
Failures are soft — missing tickers return NaN.
"""
import yfinance as yf
import pandas as pd
import numpy as np
from typing import List
import time
import logging

logger = logging.getLogger(__name__)

_BATCH_SIZE = 5
_SLEEP = 0.4

# yfinance key → DB column
_FIELDS = {
    "priceToBook":        "price_to_book",
    "trailingPE":         "trailing_pe",
    "priceToSalesTrailing12Months": "price_to_sales",
    "returnOnEquity":     "return_on_equity",
    "returnOnAssets":     "return_on_assets",
    "grossMargins":       "gross_margins",
    "operatingMargins":   "operating_margins",
    "debtToEquity":       "debt_to_equity",
    "earningsGrowth":     "earnings_growth",
    "revenueGrowth":      "revenue_growth",
    "recommendationMean": "rec_mean",
    "targetMedianPrice":  "target_price",
    "currentPrice":       "current_price",
    "marketCap":          "market_cap",
}


def fetch_fundamentals(tickers: List[str]) -> pd.DataFrame:
    """
    Fetch fundamental data for a list of tickers.
    Returns DataFrame indexed by ticker.
    """
    records = []
    for i in range(0, len(tickers), _BATCH_SIZE):
        batch = tickers[i : i + _BATCH_SIZE]
        for ticker in batch:
            try:
                info = yf.Ticker(ticker).info
                row = {"ticker": ticker}
                for yf_key, col in _FIELDS.items():
                    val = info.get(yf_key)
                    row[col] = float(val) if val is not None else np.nan
                records.append(row)
            except Exception as e:
                logger.warning(f"fundamentals {ticker}: {e}")
                records.append({"ticker": ticker, **{col: np.nan for col in _FIELDS.values()}})
        time.sleep(_SLEEP)

    cols = ["ticker"] + list(_FIELDS.values())
    if not records:
        return pd.DataFrame(columns=cols).set_index("ticker")
    return pd.DataFrame(records).reindex(columns=cols).set_index("ticker")


# ── Factor score functions ────────────────────────────────────────────────────

def _zscore_col(df: pd.DataFrame, col: str, invert: bool = False) -> pd.Series:
    from app.core.factors.base import cross_section_zscore
    if col not in df.columns:
        return pd.Series(dtype=float)
    s = df[col].dropna()
    if invert:
        s = -s
    return cross_section_zscore(s)


def value_scores(df: pd.DataFrame) -> pd.Series:
    """
    Composite value: average of -z(P/B), -z(P/E), -z(P/S).
    Lower multiples = cheaper = higher score.
    """
    parts = []
    for col in ["price_to_book", "trailing_pe", "price_to_sales"]:
        if col in df.columns:
            s = df[col].dropna()
            s = s[s > 0]
            z = _zscore_col(s.to_frame(col), col, invert=True)
            if not z.empty:
                parts.append(z.rename(col))
    if not parts:
        return pd.Series(dtype=float)
    return pd.concat(parts, axis=1).mean(axis=1).rename("value")


def quality_scores(df: pd.DataFrame) -> pd.Series:
    """Quality: ROE + gross margin + low debt (debt_to_equity inverted)."""
    parts = []
    for col, inv in [("return_on_equity", False), ("gross_margins", False), ("debt_to_equity", True)]:
        z = _zscore_col(df, col, invert=inv)
        if not z.empty:
            parts.append(z.rename(col))
    if not parts:
        return pd.Series(dtype=float)
    return pd.concat(parts, axis=1).mean(axis=1).rename("quality")


def profitability_scores(df: pd.DataFrame) -> pd.Series:
    """Profitability: operating margin + return on assets."""
    parts = []
    for col in ["operating_margins", "return_on_assets"]:
        z = _zscore_col(df, col)
        if not z.empty:
            parts.append(z.rename(col))
    if not parts:
        return pd.Series(dtype=float)
    return pd.concat(parts, axis=1).mean(axis=1).rename("profitability")


def revisions_scores(df: pd.DataFrame) -> pd.Series:
    """Earnings revisions proxy: earnings_growth + revenue_growth."""
    parts = []
    for col in ["earnings_growth", "revenue_growth"]:
        z = _zscore_col(df, col)
        if not z.empty:
            parts.append(z.rename(col))
    if not parts:
        return pd.Series(dtype=float)
    return pd.concat(parts, axis=1).mean(axis=1).rename("revisions")


def sentiment_scores(df: pd.DataFrame) -> pd.Series:
    """
    Analyst sentiment: inverted rec_mean (1=Strong Buy → score 5, 5=Strong Sell → score 1)
    + price target upside.
    """
    from app.core.factors.base import cross_section_zscore
    parts = []
    if "rec_mean" in df.columns:
        inv_rec = (6 - df["rec_mean"]).dropna()
        z = cross_section_zscore(inv_rec)
        if not z.empty:
            parts.append(z.rename("inv_rec"))
    if "target_price" in df.columns and "current_price" in df.columns:
        upside = (df["target_price"] / df["current_price"].replace(0, np.nan) - 1).dropna()
        z = cross_section_zscore(upside)
        if not z.empty:
            parts.append(z.rename("upside"))
    if not parts:
        return pd.Series(dtype=float)
    return pd.concat(parts, axis=1).mean(axis=1).rename("sentiment")


def size_scores(df: pd.DataFrame) -> pd.Series:
    """Size: log(market_cap). Larger = higher score (size exposure, NOT small-cap premium)."""
    if "market_cap" not in df.columns:
        return pd.Series(dtype=float)
    mc = df["market_cap"].dropna()
    mc = mc[mc > 0]
    if mc.empty:
        return pd.Series(dtype=float)
    from app.core.factors.base import cross_section_zscore
    return cross_section_zscore(np.log(mc)).rename("size")

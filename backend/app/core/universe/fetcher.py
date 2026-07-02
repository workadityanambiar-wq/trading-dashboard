"""Investment Universe — yfinance fetcher with DuckDB caching."""
from __future__ import annotations
import logging
import math
from typing import Any, Optional

import pandas as pd
import yfinance as yf

from app.core.universe.db import (
    get_profile, upsert_profile,
    get_ratios, upsert_ratios,
    get_financials, upsert_statements,
    get_institutional_holders, upsert_institutional_holders,
    get_insider_transactions, upsert_insider_transactions,
    get_corporate_actions, upsert_corporate_actions,
)

logger = logging.getLogger(__name__)

_REC_MAP = {
    "strong_buy": "STRONG BUY",
    "buy": "BUY",
    "hold": "HOLD",
    "underperform": "SELL",
    "sell": "STRONG SELL",
}

# yfinance financial statement row name mappings
_IS_MAP = {
    "revenue":          ["Total Revenue", "Revenue"],
    "cost_of_revenue":  ["Cost Of Revenue", "Cost of Goods Sold"],
    "gross_profit":     ["Gross Profit"],
    "operating_income": ["Operating Income", "Total Operating Income As Reported"],
    "ebit":             ["EBIT", "Operating Income"],
    "ebitda":           ["EBITDA", "Normalized EBITDA"],
    "interest_expense": ["Interest Expense", "Interest Expense Non Operating"],
    "pretax_income":    ["Pretax Income"],
    "income_tax":       ["Tax Provision"],
    "net_income":       ["Net Income", "Net Income Common Stockholders"],
    "eps_basic":        ["Basic EPS"],
    "eps_diluted":      ["Diluted EPS"],
    "shares_diluted":   ["Diluted Average Shares"],
}

_BS_MAP = {
    "cash_and_equivalents":    ["Cash And Cash Equivalents", "Cash Cash Equivalents And Short Term Investments"],
    "total_current_assets":    ["Current Assets"],
    "net_ppe":                 ["Net PPE", "Properties"],
    "goodwill":                ["Goodwill"],
    "intangible_assets":       ["Other Intangible Assets", "Goodwill And Other Intangible Assets"],
    "total_assets":            ["Total Assets"],
    "total_current_liabilities": ["Current Liabilities"],
    "long_term_debt":          ["Long Term Debt"],
    "total_liabilities":       ["Total Liabilities Net Minority Interest", "Total Liabilities"],
    "shareholders_equity":     ["Stockholders Equity", "Total Equity Gross Minority Interest"],
    "retained_earnings":       ["Retained Earnings"],
    "total_debt":              ["Total Debt"],
    "working_capital":         ["Working Capital"],
}

_CF_MAP = {
    "operating_cash_flow": ["Operating Cash Flow"],
    "capex":               ["Capital Expenditure", "Purchase Of PPE"],
    "free_cash_flow":      ["Free Cash Flow"],
    "investing_cash_flow": ["Investing Cash Flow"],
    "financing_cash_flow": ["Financing Cash Flow"],
    "dividends_paid":      ["Cash Dividends Paid", "Payment Of Dividends"],
    "share_repurchases":   ["Repurchase Of Capital Stock", "Common Stock Repurchases"],
    "net_change_in_cash":  ["Changes In Cash"],
}


def _safe(d: dict, *keys, default=None) -> Any:
    for k in keys:
        v = d.get(k)
        if v is not None and not (isinstance(v, float) and math.isnan(v)):
            return v
    return default


def _extract_statements(df: Optional[pd.DataFrame], field_map: dict) -> list[dict]:
    """Convert a yfinance financial statement DataFrame into list of period dicts."""
    if df is None or df.empty:
        return []
    rows = []
    for col in df.columns:
        period_end = col.date() if hasattr(col, "date") else str(col)
        row: dict = {"period_end": str(period_end)}
        for out_field, yf_keys in field_map.items():
            for k in yf_keys:
                if k in df.index:
                    v = df.loc[k, col]
                    if v is not None and not (isinstance(v, float) and math.isnan(v)):
                        row[out_field] = float(v)
                        break
        rows.append(row)
    return rows


def _asset_class(info: dict) -> str:
    qt = (info.get("quoteType") or "").upper()
    if qt == "ETF":
        return "ETF"
    if qt == "MUTUALFUND":
        return "MUTUAL FUND"
    if qt == "CRYPTOCURRENCY":
        return "CRYPTO"
    if qt == "INDEX":
        return "INDEX"
    industry = (info.get("industry") or "").lower()
    if "reit" in industry or "real estate investment trust" in industry:
        return "REIT"
    return "EQUITY"


# ── Core fetch functions ──────────────────────────────────────────────────────

def fetch_and_cache_profile(ticker: str) -> Optional[dict]:
    """Fetch profile + ratios from yfinance and cache in DuckDB."""
    try:
        t = yf.Ticker(ticker)
        info = t.info or {}

        # Bail out if yfinance returned a stub with no useful data
        if not info.get("longName") and not info.get("shortName") and not info.get("currentPrice"):
            return None

        profile = {
            "company_name":       _safe(info, "longName"),
            "short_name":         _safe(info, "shortName"),
            "long_business_summary": _safe(info, "longBusinessSummary"),
            "hq_city":            _safe(info, "city"),
            "hq_state":           _safe(info, "state"),
            "hq_country":         _safe(info, "country"),
            "full_time_employees": _safe(info, "fullTimeEmployees"),
            "website":            _safe(info, "website"),
            "exchange_code":      _safe(info, "exchange"),
            "fiscal_year_end":    _safe(info, "lastFiscalYearEnd"),
            "primary_sector":     _safe(info, "sector"),
            "primary_industry":   _safe(info, "industry"),
            "sub_industry":       _safe(info, "industryDisp", "industry"),
            "asset_class":        _asset_class(info),
            "currency":           _safe(info, "currency", default="USD"),
            "market_cap":         _safe(info, "marketCap"),
            "enterprise_value":   _safe(info, "enterpriseValue"),
            "shares_outstanding": _safe(info, "sharesOutstanding"),
            "float_shares":       _safe(info, "floatShares"),
            "avg_daily_volume":   _safe(info, "averageVolume"),
        }
        upsert_profile(ticker, profile)

        rec_key = (info.get("recommendationKey") or "").lower()
        ratios = {
            "pe_ratio":        _safe(info, "trailingPE"),
            "forward_pe":      _safe(info, "forwardPE"),
            "peg_ratio":       _safe(info, "pegRatio"),
            "ev_revenue":      _safe(info, "enterpriseToRevenue"),
            "ev_ebitda":       _safe(info, "enterpriseToEbitda"),
            "price_sales":     _safe(info, "priceToSalesTrailing12Months"),
            "price_book":      _safe(info, "priceToBook"),
            "dividend_yield":  _safe(info, "dividendYield"),
            "gross_margin":    _safe(info, "grossMargins"),
            "operating_margin": _safe(info, "operatingMargins"),
            "net_margin":      _safe(info, "profitMargins"),
            "roe":             _safe(info, "returnOnEquity"),
            "roa":             _safe(info, "returnOnAssets"),
            "debt_equity":     _safe(info, "debtToEquity"),
            "current_ratio":   _safe(info, "currentRatio"),
            "quick_ratio":     _safe(info, "quickRatio"),
            "revenue_growth":  _safe(info, "revenueGrowth"),
            "earnings_growth": _safe(info, "earningsGrowth"),
            "current_price":   _safe(info, "currentPrice", "regularMarketPrice"),
            "price_change_1y": _safe(info, "52WeekChange"),
            "high_52w":        _safe(info, "fiftyTwoWeekHigh"),
            "low_52w":         _safe(info, "fiftyTwoWeekLow"),
            "beta":            _safe(info, "beta"),
            "avg_volume_30d":  _safe(info, "averageVolume"),
            "target_price":    _safe(info, "targetMeanPrice"),
            "analyst_count":   _safe(info, "numberOfAnalystOpinions"),
            "recommendation":  _REC_MAP.get(rec_key, None),
        }
        # Analyst buy/hold/sell breakdown from recommendationMean (1=strong_buy…5=strong_sell)
        # yfinance doesn't always expose individual counts in info; skip if unavailable
        upsert_ratios(ticker, ratios)

        return {**profile, **ratios, "ticker": ticker}

    except Exception as exc:
        logger.warning("fetch_and_cache_profile(%s): %s", ticker, exc)
        return None


def fetch_and_cache_financials(ticker: str) -> dict:
    """Fetch IS/BS/CF (annual + quarterly) and cache in DuckDB."""
    try:
        t = yf.Ticker(ticker)
        upsert_statements(
            ticker, "ANNUAL",
            _extract_statements(t.financials, _IS_MAP),
            _extract_statements(t.balance_sheet, _BS_MAP),
            _extract_statements(t.cashflow, _CF_MAP),
        )
        upsert_statements(
            ticker, "QUARTERLY",
            _extract_statements(t.quarterly_financials, _IS_MAP),
            _extract_statements(t.quarterly_balance_sheet, _BS_MAP),
            _extract_statements(t.quarterly_cashflow, _CF_MAP),
        )
    except Exception as exc:
        logger.warning("fetch_and_cache_financials(%s): %s", ticker, exc)

    return {
        "annual":    get_financials(ticker, "ANNUAL"),
        "quarterly": get_financials(ticker, "QUARTERLY"),
    }


def fetch_and_cache_ownership(ticker: str) -> dict:
    """Fetch institutional holders + insider transactions and cache."""
    try:
        t = yf.Ticker(ticker)

        ih = t.institutional_holders
        if ih is not None and not ih.empty:
            rows = []
            for _, row in ih.iterrows():
                rows.append({
                    "holder_name": str(row.get("Holder", "")),
                    "shares":      int(row["Shares"]) if pd.notna(row.get("Shares")) else None,
                    "value":       float(row["Value"]) if pd.notna(row.get("Value")) else None,
                    "pct_held":    float(row["% Out"]) if pd.notna(row.get("% Out")) else None,
                })
            upsert_institutional_holders(ticker, rows)

        ins = t.insider_transactions
        if ins is not None and not ins.empty:
            rows = []
            for idx, row in ins.iterrows():
                try:
                    tx_date = idx.date() if hasattr(idx, "date") else None
                    raw_type = str(row.get("Transaction", "")).lower()
                    if "buy" in raw_type or "purchase" in raw_type:
                        tx_type = "BUY"
                    elif "sell" in raw_type or "sale" in raw_type:
                        tx_type = "SELL"
                    else:
                        tx_type = raw_type.upper()
                    rows.append({
                        "insider_name":     str(row.get("Insider", "")),
                        "insider_title":    str(row.get("Position", "")),
                        "transaction_type": tx_type,
                        "shares":           int(row["Shares"]) if pd.notna(row.get("Shares")) else None,
                        "value":            float(row["Value"]) if pd.notna(row.get("Value")) else None,
                        "transaction_date": str(tx_date) if tx_date else None,
                    })
                except Exception:
                    continue
            upsert_insider_transactions(ticker, rows)

    except Exception as exc:
        logger.warning("fetch_and_cache_ownership(%s): %s", ticker, exc)

    return {
        "institutional_holders": get_institutional_holders(ticker),
        "insider_transactions":  get_insider_transactions(ticker),
    }


def fetch_and_cache_corporate_actions(ticker: str) -> list:
    """Fetch dividends + splits from yfinance and cache."""
    try:
        t = yf.Ticker(ticker)
        actions = t.actions
        rows = []
        if actions is not None and not actions.empty:
            for idx, row in actions.iterrows():
                action_date = idx.date() if hasattr(idx, "date") else None
                if not action_date:
                    continue
                div = row.get("Dividends", 0) or 0
                split = row.get("Stock Splits", 0) or 0
                if div != 0:
                    rows.append({
                        "action_date":  str(action_date),
                        "action_type":  "DIVIDEND",
                        "description":  f"${float(div):.4f} per share",
                        "value":        float(div),
                    })
                if split != 0:
                    rows.append({
                        "action_date":  str(action_date),
                        "action_type":  "SPLIT",
                        "description":  f"{float(split):.2f}:1 split",
                        "value":        float(split),
                    })
        if rows:
            upsert_corporate_actions(ticker, rows)
    except Exception as exc:
        logger.warning("fetch_and_cache_corporate_actions(%s): %s", ticker, exc)

    return get_corporate_actions(ticker)


# ── Convenience wrappers (check cache first) ──────────────────────────────────

def ensure_profile_and_ratios(ticker: str, max_age_hours: int = 6) -> dict:
    """Return cached profile + ratios, refreshing from yfinance if stale."""
    cached_p = get_profile(ticker, max_age_hours)
    cached_r = get_ratios(ticker, max_age_hours)
    if cached_p and cached_r:
        return {**cached_p, **cached_r, "ticker": ticker}
    fresh = fetch_and_cache_profile(ticker)
    if fresh:
        return fresh
    # Return stale data rather than nothing
    p = get_profile(ticker, 999999) or {}
    r = get_ratios(ticker, 999999) or {}
    return {**p, **r, "ticker": ticker}


def ensure_financials(ticker: str) -> dict:
    """Return financials from cache; fetch from yfinance if empty."""
    annual = get_financials(ticker, "ANNUAL")
    if annual["income_statement"]:
        return {
            "annual":    annual,
            "quarterly": get_financials(ticker, "QUARTERLY"),
        }
    return fetch_and_cache_financials(ticker)

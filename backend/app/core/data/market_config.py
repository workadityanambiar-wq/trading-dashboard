"""
Market registry — central config that maps a market key to its data sources,
sector benchmarks, currency, and constituent getter.

Adding a new market (e.g. FTSE 100) requires only a new MarketConfig entry here.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Dict

import pandas as pd

# ── Sector benchmark tickers ──────────────────────────────────────────────────

US_SECTOR_ETFS: Dict[str, str] = {
    "Information Technology": "XLK",
    "Health Care":            "XLV",
    "Financials":             "XLF",
    "Energy":                 "XLE",
    "Industrials":            "XLI",
    "Consumer Staples":       "XLP",
    "Consumer Discretionary": "XLY",
    "Utilities":              "XLU",
    "Real Estate":            "XLRE",
    "Materials":              "XLB",
    "Communication Services": "XLC",
}

INDIA_SECTOR_INDICES: Dict[str, str] = {
    "Information Technology": "^CNXIT",
    "Financials":             "^CNXBANK",
    "Health Care":            "^CNXPHARMA",
    "Automobiles":            "^CNXAUTO",
    "Consumer Staples":       "^CNXFMCG",
    "Materials":              "^CNXMETAL",
    "Energy":                 "^CNXENERGY",
    "Industrials":            "^CNXINFRA",
    "Real Estate":            "^CNXREALTY",
    "Communication Services": "^CNXMEDIA",
    "Consumer Discretionary": "^CNXCONSUMER",
}

# ── MarketConfig ──────────────────────────────────────────────────────────────

@dataclass
class MarketConfig:
    key:               str
    label:             str
    region:            str          # "us" | "india"
    currency:          str          # "USD" | "INR"
    benchmark:         str          # yfinance benchmark ticker
    vix_ticker:        str          # volatility index
    sector_etfs:       Dict[str, str]
    get_constituents:  Callable[[], pd.DataFrame]
    flag:              str = ""
    breadth_universe:  str = ""     # key used by the existing breadth API

    def constituents(self) -> pd.DataFrame:
        return self.get_constituents()


# ── Registry ──────────────────────────────────────────────────────────────────

def _build_registry() -> Dict[str, MarketConfig]:
    # Import here to avoid circular imports at module load time
    from app.core.data.universe import get_sp500
    from app.core.data.universe_india import get_nifty50, get_nifty500

    return {
        "spx": MarketConfig(
            key="spx",
            label="S&P 500",
            region="us",
            currency="USD",
            benchmark="^GSPC",
            vix_ticker="^VIX",
            sector_etfs=US_SECTOR_ETFS,
            get_constituents=get_sp500,
            flag="🇺🇸",
            breadth_universe="sp500",
        ),
        "nifty50": MarketConfig(
            key="nifty50",
            label="Nifty 50",
            region="india",
            currency="INR",
            benchmark="^NSEI",
            vix_ticker="^INDIAVIX",
            sector_etfs=INDIA_SECTOR_INDICES,
            get_constituents=get_nifty50,
            flag="🇮🇳",
            breadth_universe="nifty50",
        ),
        "nifty500": MarketConfig(
            key="nifty500",
            label="Nifty 500",
            region="india",
            currency="INR",
            benchmark="^NSEI",
            vix_ticker="^INDIAVIX",
            sector_etfs=INDIA_SECTOR_INDICES,
            get_constituents=get_nifty500,
            flag="🇮🇳",
            breadth_universe="nifty500",
        ),
    }


_registry: Dict[str, MarketConfig] | None = None


def get_market(key: str) -> MarketConfig:
    global _registry
    if _registry is None:
        _registry = _build_registry()
    cfg = _registry.get(key)
    if cfg is None:
        raise ValueError(f"Unknown market key: {key!r}. Valid keys: {list(_registry)}")
    return cfg


def get_all_markets() -> Dict[str, MarketConfig]:
    global _registry
    if _registry is None:
        _registry = _build_registry()
    return _registry

"""
NSE unofficial API client.
Manages the session cookies required by nseindia.com for authenticated API access.
The public archive CDN (nsearchives.nseindia.com) does not need session management.
"""
from __future__ import annotations

import io
import logging
import time
from threading import Lock
from typing import Any, Dict, Optional

import pandas as pd
import requests

logger = logging.getLogger(__name__)

_NSE_BASE    = "https://www.nseindia.com"
_NSE_ARCHIVE = "https://nsearchives.nseindia.com"

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept":          "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer":         "https://www.nseindia.com/",
    "Connection":      "keep-alive",
}

_SESSION_TTL = 300  # seconds between session refreshes


class NSEClient:
    """
    Singleton HTTP client for NSE's unofficial JSON APIs.
    Handles session cookie refresh transparently.
    """

    _instance: Optional["NSEClient"] = None
    _lock = Lock()

    def __init__(self) -> None:
        self._session = requests.Session()
        self._session.headers.update(_HEADERS)
        self._last_refresh = 0.0

    @classmethod
    def get(cls) -> "NSEClient":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    # ── Session management ────────────────────────────────────────────────────

    def _refresh(self) -> None:
        try:
            self._session.get(f"{_NSE_BASE}/", timeout=10)
            self._last_refresh = time.time()
            logger.info("NSE session refreshed")
        except Exception as exc:
            logger.warning("NSE session refresh failed: %s", exc)

    def _ensure_session(self) -> None:
        if time.time() - self._last_refresh > _SESSION_TTL:
            self._refresh()

    # ── Generic JSON fetch ────────────────────────────────────────────────────

    def get_json(
        self,
        path: str,
        params: Optional[Dict[str, str]] = None,
        retries: int = 2,
    ) -> Any:
        self._ensure_session()
        url = f"{_NSE_BASE}{path}"
        for attempt in range(retries + 1):
            try:
                resp = self._session.get(url, params=params, timeout=15)
                if resp.status_code in (401, 403, 429):
                    logger.info("NSE %s → refreshing session (attempt %d)", resp.status_code, attempt + 1)
                    self._refresh()
                    time.sleep(1.5)
                    continue
                resp.raise_for_status()
                return resp.json()
            except requests.JSONDecodeError:
                logger.error("NSE JSON decode error: %s", url)
                return None
            except Exception as exc:
                logger.error("NSE request error (%s): %s", url, exc)
                if attempt < retries:
                    time.sleep(1)
        return None

    # ── Specific endpoints ────────────────────────────────────────────────────

    def get_option_chain_equity(self, symbol: str) -> Optional[Dict]:
        """Full option chain for a single NSE F&O stock."""
        return self.get_json("/api/option-chain-equities", {"symbol": symbol.upper()})

    def get_option_chain_index(self, symbol: str = "NIFTY") -> Optional[Dict]:
        """Option chain for NIFTY / BANKNIFTY / FINNIFTY index."""
        return self.get_json("/api/option-chain-indices", {"symbol": symbol.upper()})

    def get_fii_dii(self) -> Optional[Dict]:
        """Daily FII/DII buy-sell data published by NSE."""
        return self.get_json("/api/fiidiiTradeReact")

    def get_market_status(self) -> Optional[Dict]:
        return self.get_json("/api/market-status")

    def get_quote_derivative(self, symbol: str) -> Optional[Dict]:
        """Futures quote for an underlying."""
        return self.get_json("/api/quote-derivative", {"symbol": symbol.upper()})


# ── Archive CDN helpers (no session needed) ───────────────────────────────────

def _archive_get(path: str, timeout: int = 20) -> Optional[bytes]:
    """Download a file from NSE's public archive CDN."""
    url = f"{_NSE_ARCHIVE}{path}"
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=timeout)
        resp.raise_for_status()
        return resp.content
    except Exception as exc:
        logger.error("NSE archive download failed (%s): %s", url, exc)
        return None


def fetch_nifty500_csv() -> Optional[pd.DataFrame]:
    """
    Download the Nifty 500 constituent list from NSE archives.
    Columns: Company Name, Industry, Symbol, Series, ISIN Code
    """
    raw = _archive_get("/content/indices/ind_nifty500list.csv")
    if raw is None:
        return None
    try:
        df = pd.read_csv(io.BytesIO(raw))
        df.columns = [c.strip() for c in df.columns]
        return df
    except Exception as exc:
        logger.error("Failed to parse Nifty 500 CSV: %s", exc)
        return None


def fetch_fo_lot_sizes() -> Optional[pd.DataFrame]:
    """
    Download the F&O lot-size file from NSE archives.
    Contains one row per F&O-eligible symbol with lot size.
    """
    raw = _archive_get("/content/fo/fo_mktlots.csv")
    if raw is None:
        return None
    try:
        df = pd.read_csv(io.BytesIO(raw))
        df.columns = [c.strip() for c in df.columns]
        return df
    except Exception as exc:
        logger.error("Failed to parse F&O lot sizes CSV: %s", exc)
        return None

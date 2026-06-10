import io
import pandas as pd
import requests
import logging
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

INDEX_TICKERS: Dict[str, str] = {
    "SPY": "S&P 500",
    "QQQ": "Nasdaq 100",
    "IWM": "Russell 2000",
    "DIA": "Dow Jones",
    "^VIX": "VIX",
    "^NSEI": "Nifty 50",
    "^STOXX50E": "Euro Stoxx 50",
    "^N225": "Nikkei 225",
    "^FTSE": "FTSE 100",
}

SECTOR_ETFS: Dict[str, Dict] = {
    "XLK":  {"name": "Technology",        "sector": "Information Technology"},
    "XLF":  {"name": "Financials",         "sector": "Financials"},
    "XLV":  {"name": "Health Care",        "sector": "Health Care"},
    "XLE":  {"name": "Energy",             "sector": "Energy"},
    "XLI":  {"name": "Industrials",        "sector": "Industrials"},
    "XLP":  {"name": "Cons. Staples",      "sector": "Consumer Staples"},
    "XLY":  {"name": "Cons. Disc.",        "sector": "Consumer Discretionary"},
    "XLU":  {"name": "Utilities",          "sector": "Utilities"},
    "XLRE": {"name": "Real Estate",        "sector": "Real Estate"},
    "XLB":  {"name": "Materials",          "sector": "Materials"},
    "XLC":  {"name": "Comm. Services",     "sector": "Communication Services"},
}

# Exchange code → human-readable name
EXCHANGE_LABELS: Dict[str, str] = {
    "Q": "NASDAQ",
    "G": "NASDAQ",
    "S": "NASDAQ",
    "N": "NYSE",
    "A": "NYSE American",
    "P": "NYSE Arca",
    "Z": "CBOE",
    "V": "CBOE",
    "M": "CBOE",
}

_sp500_cache: Optional[pd.DataFrame] = None
_sp400_cache: Optional[pd.DataFrame] = None
_sp600_cache: Optional[pd.DataFrame] = None
_all_us_cache: Optional[pd.DataFrame] = None

_UA = "Mozilla/5.0 (compatible; quant-dashboard/1.0)"


# ── S&P index constituents ────────────────────────────────────────────────────

def get_sp500() -> pd.DataFrame:
    global _sp500_cache
    if _sp500_cache is not None:
        return _sp500_cache
    _sp500_cache = _fetch_sp_index(
        "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies", "S&P 500"
    )
    return _sp500_cache


def get_sp400() -> pd.DataFrame:
    global _sp400_cache
    if _sp400_cache is not None:
        return _sp400_cache
    _sp400_cache = _fetch_sp_index(
        "https://en.wikipedia.org/wiki/List_of_S%26P_400_companies", "S&P 400"
    )
    return _sp400_cache


def get_sp600() -> pd.DataFrame:
    global _sp600_cache
    if _sp600_cache is not None:
        return _sp600_cache
    _sp600_cache = _fetch_sp_index(
        "https://en.wikipedia.org/wiki/List_of_S%26P_600_companies", "S&P 600"
    )
    return _sp600_cache


def _fetch_sp_index(url: str, label: str) -> pd.DataFrame:
    try:
        tables = pd.read_html(
            url,
            storage_options={"User-Agent": _UA},
        )
        # Try common column name patterns across Wikipedia formats
        for table in tables:
            cols = {c.strip(): c for c in table.columns}
            ticker_col = next(
                (cols[c] for c in cols if "symbol" in c.lower() or "ticker" in c.lower()),
                None,
            )
            name_col = next(
                (cols[c] for c in cols if "security" in c.lower() or "company" in c.lower()),
                None,
            )
            sector_col = next(
                (cols[c] for c in cols if "sector" in c.lower() and "sub" not in c.lower()),
                None,
            )
            sub_col = next(
                (cols[c] for c in cols if "sub" in c.lower() and "industry" in c.lower()),
                None,
            )
            if ticker_col:
                df = pd.DataFrame()
                df["ticker"] = table[ticker_col].astype(str).str.replace(".", "-", regex=False)
                df["name"] = table[name_col].astype(str) if name_col else ""
                df["sector"] = table[sector_col].astype(str) if sector_col else ""
                df["sub_industry"] = table[sub_col].astype(str) if sub_col else ""
                df = df[~df["ticker"].str.contains(r"[^A-Z0-9.\-]", regex=True)]
                logger.info(f"Loaded {len(df)} {label} constituents")
                return df.reset_index(drop=True)
    except Exception as e:
        logger.error(f"Failed to fetch {label} from Wikipedia: {e}")
    return pd.DataFrame(columns=["ticker", "name", "sector", "sub_industry"])


# ── Full US listed universe ───────────────────────────────────────────────────

_SEC_EXCHANGE_URL = "https://www.sec.gov/files/company_tickers_exchange.json"
_NASDAQ_FTP_HOST = "ftp.nasdaqtrader.com"
_NASDAQ_FTP_PATH = "/SymbolDirectory/nasdaqtraded.txt"


def get_all_us_listed(force_refresh: bool = False) -> pd.DataFrame:
    """
    Returns all US-listed securities with ticker, name, exchange, is_etf, sector, sub_industry.
    Sources (tried in order): NASDAQ Trader FTP → SEC EDGAR exchange file.
    """
    global _all_us_cache
    if _all_us_cache is not None and not force_refresh:
        return _all_us_cache

    df = _fetch_nasdaq_trader_ftp()
    if df.empty:
        logger.info("Falling back to SEC EDGAR company list...")
        df = _fetch_sec_edgar()

    if not df.empty:
        df = _enrich_with_sp1500_sectors(df)
        _all_us_cache = df
        logger.info(f"US universe loaded: {len(df)} securities")

    return df if not df.empty else pd.DataFrame(
        columns=["ticker", "name", "exchange", "is_etf", "sector", "sub_industry"]
    )


def _fetch_nasdaq_trader_ftp() -> pd.DataFrame:
    """Download nasdaqtraded.txt via FTP."""
    try:
        import ftplib, io
        logger.info("Connecting to NASDAQ Trader FTP...")
        ftp = ftplib.FTP(_NASDAQ_FTP_HOST, timeout=30)
        ftp.login()
        buf = io.BytesIO()
        ftp.retrbinary(f"RETR {_NASDAQ_FTP_PATH}", buf.write)
        ftp.quit()
        content = buf.getvalue().decode("utf-8", errors="replace")
        return _parse_nasdaq_trader(content)
    except Exception as e:
        logger.warning(f"NASDAQ FTP failed: {e}")
        return pd.DataFrame()


def _fetch_sec_edgar() -> pd.DataFrame:
    """Download company_tickers_exchange.json from SEC EDGAR."""
    try:
        logger.info("Downloading SEC EDGAR company tickers...")
        resp = requests.get(
            _SEC_EXCHANGE_URL,
            timeout=30,
            headers={"User-Agent": "quant-dashboard research@example.com"},
        )
        resp.raise_for_status()
        data = resp.json()
        # Format: {"fields": [...], "data": [[cik, name, ticker, exchange], ...]}
        fields = data.get("fields", [])
        rows_raw = data.get("data", [])
        df_raw = pd.DataFrame(rows_raw, columns=fields)

        # Normalise exchange names to codes
        exchange_map = {
            "Nasdaq": "Q", "NASDAQ": "Q",
            "NYSE": "N",
            "NYSE MKT": "A", "NYSE American": "A",
            "NYSE Arca": "P",
            "OTC": "O",
        }

        records = []
        for _, row in df_raw.iterrows():
            ticker = str(row.get("ticker", "")).strip().upper()
            if not ticker or len(ticker) > 5:
                continue
            if any(c in ticker for c in ["$", "+", ".", "^", "~"]):
                continue
            exchange_raw = str(row.get("exchange", ""))
            exchange_code = exchange_map.get(exchange_raw, exchange_raw[:1] if exchange_raw else "")
            records.append({
                "ticker": ticker,
                "name": str(row.get("name", "")).strip(),
                "exchange": exchange_code,
                "is_etf": False,  # SEC file doesn't flag ETFs; enrich later
                "sector": "",
                "sub_industry": "",
            })

        return pd.DataFrame(records).drop_duplicates("ticker").reset_index(drop=True)
    except Exception as e:
        logger.error(f"SEC EDGAR download failed: {e}")
        return pd.DataFrame()


def _parse_nasdaq_trader(content: str) -> pd.DataFrame:
    """Parse the pipe-delimited NASDAQ Trader nasdaqtraded.txt file."""
    lines = [l for l in content.splitlines() if "|" in l]
    if not lines:
        return pd.DataFrame()

    header = [c.strip() for c in lines[0].split("|")]
    records = []
    for line in lines[1:]:
        parts = line.split("|")
        if len(parts) < len(header):
            continue
        row = dict(zip(header, [p.strip() for p in parts]))
        if row.get("TestIssue") == "Y":
            continue
        ticker = row.get("Symbol", "").strip()
        if not ticker or len(ticker) > 5:
            continue
        if any(c in ticker for c in ["$", "+", "~", "^"]):
            continue
        if ticker.endswith(("WI", "WS")):
            continue
        listing_exchange = row.get("Listing Exchange", "").strip()
        market_cat = row.get("Market Category", row.get("MarketCategory", "")).strip()
        # For NASDAQ stocks use market sub-category (G/S/Q); for others use listing exchange (N/A/P)
        exchange_code = market_cat if market_cat else listing_exchange
        is_etf = row.get("ETF", "N").strip() == "Y"
        name = row.get("Security Name", row.get("SecurityName", "")).strip()
        records.append({
            "ticker": ticker,
            "name": name,
            "exchange": exchange_code,
            "is_etf": is_etf,
            "sector": "",
            "sub_industry": "",
        })

    return pd.DataFrame(records).drop_duplicates("ticker").reset_index(drop=True) if records else pd.DataFrame()


def _enrich_with_sp1500_sectors(df: pd.DataFrame) -> pd.DataFrame:
    """Add sector/sub_industry for tickers that appear in S&P 1500."""
    try:
        sp1500_frames = []
        for getter in [get_sp500, get_sp400, get_sp600]:
            try:
                sp1500_frames.append(getter())
            except Exception:
                pass
        if not sp1500_frames:
            return df
        sp1500 = pd.concat(sp1500_frames, ignore_index=True).drop_duplicates("ticker")
        sector_map = sp1500.set_index("ticker")[["sector", "sub_industry"]].to_dict("index")
        df = df.copy()
        df["sector"] = df["ticker"].map(lambda t: sector_map.get(t, {}).get("sector", ""))
        df["sub_industry"] = df["ticker"].map(lambda t: sector_map.get(t, {}).get("sub_industry", ""))
    except Exception as e:
        logger.warning(f"Sector enrichment failed (non-fatal): {e}")
    return df


def get_sp1500_tickers() -> List[str]:
    """S&P 500 + MidCap 400 + SmallCap 600 combined ticker list."""
    combined = []
    for getter in [get_sp500, get_sp400, get_sp600]:
        try:
            df = getter()
            combined.extend(df["ticker"].tolist())
        except Exception:
            pass
    return list(dict.fromkeys(combined))  # deduplicated, order-preserved


# ── Utility getters ───────────────────────────────────────────────────────────

def get_watchlist_tickers() -> List[str]:
    return list(INDEX_TICKERS.keys()) + list(SECTOR_ETFS.keys())


def get_all_tickers() -> List[str]:
    sp500 = get_sp500()["ticker"].tolist()
    etfs = list(INDEX_TICKERS.keys()) + list(SECTOR_ETFS.keys())
    return list(dict.fromkeys(etfs + sp500))

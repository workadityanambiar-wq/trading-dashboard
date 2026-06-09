import duckdb
import pandas as pd
from contextlib import contextmanager
from datetime import date
from pathlib import Path
from typing import List, Optional
import logging

logger = logging.getLogger(__name__)

import os as _os
_DATA_DIR = Path(_os.environ.get("DATA_DIR", str(Path(__file__).resolve().parents[4] / "data")))
_DB_PATH = _DATA_DIR / "market_data.duckdb"


@contextmanager
def _conn():
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(_DB_PATH))
    try:
        yield con
    finally:
        con.close()


def init_db() -> None:
    with _conn() as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS prices (
                date DATE NOT NULL,
                ticker VARCHAR NOT NULL,
                open DOUBLE,
                high DOUBLE,
                low DOUBLE,
                close DOUBLE,
                adj_close DOUBLE,
                volume BIGINT
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS sp500_universe (
                ticker VARCHAR NOT NULL,
                name VARCHAR,
                sector VARCHAR,
                sub_industry VARCHAR,
                fetched_at TIMESTAMP DEFAULT now()
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS fundamentals (
                ticker VARCHAR NOT NULL,
                fetched_at TIMESTAMP NOT NULL,
                price_to_book DOUBLE,
                trailing_pe DOUBLE,
                price_to_sales DOUBLE,
                return_on_equity DOUBLE,
                return_on_assets DOUBLE,
                gross_margins DOUBLE,
                operating_margins DOUBLE,
                debt_to_equity DOUBLE,
                earnings_growth DOUBLE,
                revenue_growth DOUBLE,
                rec_mean DOUBLE,
                target_price DOUBLE,
                current_price DOUBLE,
                market_cap DOUBLE
            )
        """)
        # Migrate existing tables that lack the new columns
        _migrate_fundamentals(con)
        con.execute("""
            CREATE TABLE IF NOT EXISTS us_universe (
                ticker      VARCHAR NOT NULL PRIMARY KEY,
                name        VARCHAR,
                exchange    VARCHAR,
                is_etf      BOOLEAN DEFAULT false,
                sector      VARCHAR,
                sub_industry VARCHAR,
                market_cap  DOUBLE,
                added_at    TIMESTAMP DEFAULT now()
            )
        """)


_NEW_FUND_COLS = [
    "price_to_sales", "return_on_assets", "operating_margins",
    "debt_to_equity", "earnings_growth", "revenue_growth",
    "rec_mean", "target_price", "current_price",
]

def _migrate_fundamentals(con) -> None:
    existing = {row[0] for row in con.execute("PRAGMA table_info(fundamentals)").fetchall()}
    for col in _NEW_FUND_COLS:
        if col not in existing:
            try:
                con.execute(f"ALTER TABLE fundamentals ADD COLUMN {col} DOUBLE")
            except Exception:
                pass


def get_last_date(ticker: str) -> Optional[date]:
    with _conn() as con:
        row = con.execute(
            "SELECT MAX(date) FROM prices WHERE ticker = ?", [ticker]
        ).fetchone()
    return row[0] if row and row[0] is not None else None


def store_prices(df: pd.DataFrame) -> None:
    if df.empty:
        return
    required = {"date", "ticker", "open", "high", "low", "close", "adj_close", "volume"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing columns: {missing}")

    with _conn() as con:
        con.register("_new", df)
        con.execute("""
            DELETE FROM prices
            WHERE (date, ticker) IN (SELECT date, ticker FROM _new)
        """)
        con.execute("INSERT INTO prices SELECT * FROM _new")
        con.unregister("_new")


def get_adj_close(tickers: List[str], start: str, end: str) -> pd.DataFrame:
    """Wide-format adjusted close: index=date, columns=tickers."""
    with _conn() as con:
        placeholders = ",".join(["?" for _ in tickers])
        df = con.execute(
            f"""
            SELECT date, ticker, adj_close
            FROM prices
            WHERE ticker IN ({placeholders}) AND date >= ? AND date <= ?
            ORDER BY date
            """,
            tickers + [start, end],
        ).df()
    if df.empty:
        return pd.DataFrame()
    result = df.pivot(index="date", columns="ticker", values="adj_close")
    result.index = pd.to_datetime(result.index)
    return result


def get_ohlcv(ticker: str, start: str, end: str) -> pd.DataFrame:
    """OHLCV for a single ticker, date-indexed."""
    with _conn() as con:
        df = con.execute(
            """
            SELECT date, open, high, low, adj_close AS close, volume
            FROM prices
            WHERE ticker = ? AND date >= ? AND date <= ?
            ORDER BY date
            """,
            [ticker, start, end],
        ).df()
    df["date"] = pd.to_datetime(df["date"])
    return df


def store_universe(df: pd.DataFrame) -> None:
    with _conn() as con:
        con.execute("DELETE FROM sp500_universe")
        con.register("_uni", df)
        con.execute("INSERT INTO sp500_universe SELECT ticker, name, sector, sub_industry, now() FROM _uni")
        con.unregister("_uni")


def get_universe() -> pd.DataFrame:
    with _conn() as con:
        return con.execute(
            "SELECT ticker, name, sector, sub_industry FROM sp500_universe ORDER BY ticker"
        ).df()


_ALL_FUND_COLS = [
    "price_to_book", "trailing_pe", "price_to_sales",
    "return_on_equity", "return_on_assets", "gross_margins", "operating_margins",
    "debt_to_equity", "earnings_growth", "revenue_growth",
    "rec_mean", "target_price", "current_price", "market_cap",
]

def store_fundamentals(df: pd.DataFrame) -> None:
    """df must have columns matching the fundamentals table (ticker as column, not index)."""
    with _conn() as con:
        df2 = df.reset_index() if df.index.name == "ticker" else df.copy()
        # Add any missing columns as NaN so the INSERT works
        for col in _ALL_FUND_COLS:
            if col not in df2.columns:
                df2[col] = float("nan")
        con.register("_fund", df2)
        con.execute("DELETE FROM fundamentals WHERE ticker IN (SELECT ticker FROM _fund)")
        cols_sql = ", ".join(_ALL_FUND_COLS)
        con.execute(f"""
            INSERT INTO fundamentals (ticker, fetched_at, {cols_sql})
            SELECT ticker, now(), {cols_sql} FROM _fund
        """)
        con.unregister("_fund")


def get_fundamentals(tickers: List[str], max_age_hours: int = 24) -> pd.DataFrame:
    """Returns cached fundamentals for tickers fetched within max_age_hours."""
    with _conn() as con:
        placeholders = ",".join(["?" for _ in tickers])
        cols_sql = ", ".join(_ALL_FUND_COLS)
        df = con.execute(
            f"""
            SELECT ticker, {cols_sql}
            FROM fundamentals
            WHERE ticker IN ({placeholders})
              AND fetched_at >= now() - INTERVAL '{max_age_hours} hours'
            """,
            tickers,
        ).df()
    return df.set_index("ticker") if not df.empty else pd.DataFrame()


def get_ohlcv_wide(tickers: List[str], start: str, end: str) -> dict:
    """
    Returns dict of wide DataFrames keyed by column name:
      'open', 'high', 'low', 'adj_close', 'volume'
    All share the same DatetimeIndex.
    """
    with _conn() as con:
        placeholders = ",".join(["?" for _ in tickers])
        df = con.execute(
            f"""
            SELECT date, ticker, open, high, low, adj_close, volume
            FROM prices
            WHERE ticker IN ({placeholders}) AND date >= ? AND date <= ?
            ORDER BY date
            """,
            tickers + [start, end],
        ).df()
    if df.empty:
        return {"open": pd.DataFrame(), "high": pd.DataFrame(),
                "low": pd.DataFrame(), "adj_close": pd.DataFrame(), "volume": pd.DataFrame()}
    df["date"] = pd.to_datetime(df["date"])
    result = {}
    for col in ["open", "high", "low", "adj_close", "volume"]:
        wide = df.pivot(index="date", columns="ticker", values=col)
        if col == "volume":
            wide = wide.astype(float)
        result[col] = wide
    return result


def get_volume(tickers: List[str], start: str, end: str) -> pd.DataFrame:
    """Wide-format daily volume: index=date, columns=tickers."""
    with _conn() as con:
        placeholders = ",".join(["?" for _ in tickers])
        df = con.execute(
            f"""
            SELECT date, ticker, volume
            FROM prices
            WHERE ticker IN ({placeholders}) AND date >= ? AND date <= ?
            ORDER BY date
            """,
            tickers + [start, end],
        ).df()
    if df.empty:
        return pd.DataFrame()
    result = df.pivot(index="date", columns="ticker", values="volume").astype(float)
    result.index = pd.to_datetime(result.index)
    return result


# ── Full US universe helpers ───────────────────────────────────────────────────

def upsert_us_universe(df: pd.DataFrame) -> int:
    """Insert or update rows in us_universe. df columns: ticker, name, exchange, is_etf, sector, sub_industry."""
    if df.empty:
        return 0
    required = ["ticker", "name", "exchange", "is_etf"]
    for col in required:
        if col not in df.columns:
            df[col] = None
    for col in ["sector", "sub_industry", "market_cap"]:
        if col not in df.columns:
            df[col] = None

    with _conn() as con:
        con.register("_uni", df)
        con.execute("""
            INSERT OR REPLACE INTO us_universe
                (ticker, name, exchange, is_etf, sector, sub_industry, market_cap, added_at)
            SELECT ticker, name, exchange, is_etf, sector, sub_industry, market_cap, now()
            FROM _uni
        """)
        con.unregister("_uni")
        count = con.execute("SELECT COUNT(*) FROM us_universe").fetchone()[0]
    return count


def get_us_universe_count() -> int:
    with _conn() as con:
        return con.execute("SELECT COUNT(*) FROM us_universe").fetchone()[0]


def get_us_universe_page(
    search: str = "",
    exchange: str = "",
    is_etf: Optional[bool] = None,
    page: int = 1,
    page_size: int = 100,
    has_prices_only: bool = False,
) -> tuple[list[dict], int]:
    """Paginated query of us_universe joined with prices availability."""
    offset = (page - 1) * page_size
    params: list = []

    where_clauses = []
    if search:
        where_clauses.append("(u.ticker ILIKE ? OR u.name ILIKE ?)")
        params += [f"%{search}%", f"%{search}%"]
    if exchange:
        where_clauses.append("u.exchange = ?")
        params.append(exchange)
    if is_etf is not None:
        where_clauses.append("u.is_etf = ?")
        params.append(is_etf)
    if has_prices_only:
        where_clauses.append("p.ticker IS NOT NULL")

    where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

    base_query = f"""
        FROM us_universe u
        LEFT JOIN (
            SELECT ticker, MAX(date) AS last_price_date
            FROM prices GROUP BY ticker
        ) p ON u.ticker = p.ticker
        {where_sql}
    """

    with _conn() as con:
        total = con.execute(f"SELECT COUNT(*) {base_query}", params).fetchone()[0]
        rows = con.execute(
            f"""
            SELECT u.ticker, u.name, u.exchange, u.is_etf, u.sector, u.sub_industry,
                   u.market_cap, (p.ticker IS NOT NULL) AS has_prices,
                   p.last_price_date
            {base_query}
            ORDER BY has_prices DESC, u.market_cap DESC NULLS LAST, u.ticker
            LIMIT ? OFFSET ?
            """,
            params + [page_size, offset],
        ).df()

    records = rows.to_dict("records")
    # Replace NaN with None so JSON serialization doesn't fail
    import math
    for rec in records:
        for k, v in rec.items():
            if isinstance(v, float) and math.isnan(v):
                rec[k] = None
    return records, total


def get_tickers_with_prices() -> set:
    with _conn() as con:
        rows = con.execute("SELECT DISTINCT ticker FROM prices").fetchall()
    return {r[0] for r in rows}

"""Investment Universe — DuckDB persistence layer."""
from __future__ import annotations
import math
from datetime import datetime
from typing import Any, Optional
import pandas as pd

from app.core.data.cache import _conn


# ── Schema ────────────────────────────────────────────────────────────────────

def init_universe_tables() -> None:
    with _conn() as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS company_profiles (
                ticker VARCHAR PRIMARY KEY,
                company_name VARCHAR,
                short_name VARCHAR,
                long_business_summary TEXT,
                hq_city VARCHAR,
                hq_state VARCHAR,
                hq_country VARCHAR,
                full_time_employees INTEGER,
                website VARCHAR,
                exchange_code VARCHAR,
                ipo_date DATE,
                fiscal_year_end VARCHAR,
                primary_sector VARCHAR,
                primary_industry VARCHAR,
                sub_industry VARCHAR,
                asset_class VARCHAR DEFAULT 'EQUITY',
                currency VARCHAR DEFAULT 'USD',
                market_cap DOUBLE,
                enterprise_value DOUBLE,
                shares_outstanding BIGINT,
                float_shares BIGINT,
                avg_daily_volume BIGINT,
                fetched_at TIMESTAMP DEFAULT now()
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS financial_ratios (
                ticker VARCHAR PRIMARY KEY,
                pe_ratio DOUBLE, forward_pe DOUBLE, peg_ratio DOUBLE,
                ev_revenue DOUBLE, ev_ebitda DOUBLE,
                price_sales DOUBLE, price_book DOUBLE,
                dividend_yield DOUBLE, fcf_yield DOUBLE,
                gross_margin DOUBLE, operating_margin DOUBLE, net_margin DOUBLE,
                roe DOUBLE, roa DOUBLE, roic DOUBLE,
                debt_equity DOUBLE, net_debt_ebitda DOUBLE,
                current_ratio DOUBLE, quick_ratio DOUBLE,
                revenue_growth DOUBLE, earnings_growth DOUBLE,
                current_price DOUBLE,
                price_change_1m DOUBLE, price_change_3m DOUBLE,
                price_change_6m DOUBLE, price_change_1y DOUBLE,
                high_52w DOUBLE, low_52w DOUBLE,
                beta DOUBLE, avg_volume_30d DOUBLE,
                target_price DOUBLE, analyst_count INTEGER,
                buy_count INTEGER, hold_count INTEGER, sell_count INTEGER,
                recommendation VARCHAR,
                fetched_at TIMESTAMP DEFAULT now()
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS income_statement (
                ticker VARCHAR, period_end DATE, period_type VARCHAR,
                revenue DOUBLE, cost_of_revenue DOUBLE, gross_profit DOUBLE,
                operating_income DOUBLE, ebit DOUBLE, ebitda DOUBLE,
                interest_expense DOUBLE, pretax_income DOUBLE,
                income_tax DOUBLE, net_income DOUBLE,
                eps_basic DOUBLE, eps_diluted DOUBLE, shares_diluted BIGINT,
                PRIMARY KEY (ticker, period_end, period_type)
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS balance_sheet (
                ticker VARCHAR, period_end DATE, period_type VARCHAR,
                cash_and_equivalents DOUBLE, total_current_assets DOUBLE,
                net_ppe DOUBLE, goodwill DOUBLE, intangible_assets DOUBLE,
                total_assets DOUBLE, total_current_liabilities DOUBLE,
                long_term_debt DOUBLE, total_liabilities DOUBLE,
                shareholders_equity DOUBLE, retained_earnings DOUBLE,
                total_debt DOUBLE, net_debt DOUBLE,
                working_capital DOUBLE, book_value_per_share DOUBLE,
                PRIMARY KEY (ticker, period_end, period_type)
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS cash_flow_statement (
                ticker VARCHAR, period_end DATE, period_type VARCHAR,
                operating_cash_flow DOUBLE, capex DOUBLE, free_cash_flow DOUBLE,
                investing_cash_flow DOUBLE, financing_cash_flow DOUBLE,
                dividends_paid DOUBLE, share_repurchases DOUBLE,
                net_change_in_cash DOUBLE,
                PRIMARY KEY (ticker, period_end, period_type)
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS institutional_holders (
                ticker VARCHAR, holder_name VARCHAR,
                shares BIGINT, value DOUBLE, pct_held DOUBLE,
                holder_type VARCHAR DEFAULT 'INSTITUTION',
                updated_at TIMESTAMP DEFAULT now(),
                PRIMARY KEY (ticker, holder_name)
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS insider_transactions (
                ticker VARCHAR, insider_name VARCHAR,
                insider_title VARCHAR, transaction_type VARCHAR,
                shares BIGINT, value DOUBLE, transaction_date DATE,
                PRIMARY KEY (ticker, insider_name, transaction_date, shares)
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS corporate_actions_history (
                ticker VARCHAR, action_date DATE,
                action_type VARCHAR, description VARCHAR, value DOUBLE,
                PRIMARY KEY (ticker, action_date, action_type)
            )
        """)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _clean(d: dict) -> dict:
    return {k: (None if isinstance(v, float) and math.isnan(v) else v) for k, v in d.items()}


def _stale(fetched_at: Any, max_age_hours: int) -> bool:
    if fetched_at is None:
        return True
    try:
        if hasattr(fetched_at, "to_pydatetime"):
            fetched_at = fetched_at.to_pydatetime()
        if isinstance(fetched_at, str):
            fetched_at = datetime.fromisoformat(fetched_at.replace("Z", ""))
        age_h = (datetime.now() - fetched_at.replace(tzinfo=None)).total_seconds() / 3600
        return age_h > max_age_hours
    except Exception:
        return True


# ── Company profile ───────────────────────────────────────────────────────────

def get_profile(ticker: str, max_age_hours: int = 24) -> Optional[dict]:
    with _conn() as con:
        df = con.execute("SELECT * FROM company_profiles WHERE ticker = ?", [ticker]).fetchdf()
    if df.empty:
        return None
    d = _clean(df.iloc[0].to_dict())
    return None if _stale(d.get("fetched_at"), max_age_hours) else d


def upsert_profile(ticker: str, data: dict) -> None:
    data = {k: v for k, v in data.items() if v is not None}
    data["ticker"] = ticker
    df = pd.DataFrame([data])
    schema_cols = [
        "ticker", "company_name", "short_name", "long_business_summary",
        "hq_city", "hq_state", "hq_country", "full_time_employees",
        "website", "exchange_code", "ipo_date", "fiscal_year_end",
        "primary_sector", "primary_industry", "sub_industry",
        "asset_class", "currency", "market_cap", "enterprise_value",
        "shares_outstanding", "float_shares", "avg_daily_volume",
    ]
    cols = [c for c in schema_cols if c in df.columns]
    df = df[cols]
    with _conn() as con:
        con.execute("DELETE FROM company_profiles WHERE ticker = ?", [ticker])
        con.register("_prof", df)
        col_sql = ", ".join(cols)
        con.execute(f"INSERT INTO company_profiles ({col_sql}, fetched_at) SELECT {col_sql}, now() FROM _prof")
        con.unregister("_prof")


# ── Financial ratios ──────────────────────────────────────────────────────────

def get_ratios(ticker: str, max_age_hours: int = 6) -> Optional[dict]:
    with _conn() as con:
        df = con.execute("SELECT * FROM financial_ratios WHERE ticker = ?", [ticker]).fetchdf()
    if df.empty:
        return None
    d = _clean(df.iloc[0].to_dict())
    return None if _stale(d.get("fetched_at"), max_age_hours) else d


def upsert_ratios(ticker: str, data: dict) -> None:
    data["ticker"] = ticker
    df = pd.DataFrame([data])
    schema_cols = [
        "ticker", "pe_ratio", "forward_pe", "peg_ratio", "ev_revenue", "ev_ebitda",
        "price_sales", "price_book", "dividend_yield", "fcf_yield",
        "gross_margin", "operating_margin", "net_margin", "roe", "roa", "roic",
        "debt_equity", "net_debt_ebitda", "current_ratio", "quick_ratio",
        "revenue_growth", "earnings_growth",
        "current_price", "price_change_1m", "price_change_3m",
        "price_change_6m", "price_change_1y",
        "high_52w", "low_52w", "beta", "avg_volume_30d",
        "target_price", "analyst_count", "buy_count", "hold_count", "sell_count",
        "recommendation",
    ]
    cols = [c for c in schema_cols if c in df.columns]
    df = df[cols]
    with _conn() as con:
        con.execute("DELETE FROM financial_ratios WHERE ticker = ?", [ticker])
        con.register("_rat", df)
        col_sql = ", ".join(cols)
        con.execute(f"INSERT INTO financial_ratios ({col_sql}, fetched_at) SELECT {col_sql}, now() FROM _rat")
        con.unregister("_rat")


# ── Financial statements ──────────────────────────────────────────────────────

def get_financials(ticker: str, period_type: str = "ANNUAL") -> dict:
    with _conn() as con:
        is_df = con.execute(
            "SELECT * FROM income_statement WHERE ticker=? AND period_type=? ORDER BY period_end DESC",
            [ticker, period_type],
        ).fetchdf()
        bs_df = con.execute(
            "SELECT * FROM balance_sheet WHERE ticker=? AND period_type=? ORDER BY period_end DESC",
            [ticker, period_type],
        ).fetchdf()
        cf_df = con.execute(
            "SELECT * FROM cash_flow_statement WHERE ticker=? AND period_type=? ORDER BY period_end DESC",
            [ticker, period_type],
        ).fetchdf()
    return {
        "income_statement": [_clean(r) for r in is_df.to_dict("records")],
        "balance_sheet": [_clean(r) for r in bs_df.to_dict("records")],
        "cash_flow": [_clean(r) for r in cf_df.to_dict("records")],
    }


def upsert_statements(
    ticker: str, period_type: str,
    is_rows: list, bs_rows: list, cf_rows: list,
) -> None:
    with _conn() as con:
        def _load(table: str, rows: list):
            if not rows:
                return
            df = pd.DataFrame(rows)
            df["ticker"] = ticker
            df["period_type"] = period_type
            tbl_cols = {r[1] for r in con.execute(f"PRAGMA table_info({table})").fetchall()}
            cols = [c for c in df.columns if c in tbl_cols]
            df = df[cols]
            con.execute(
                f"DELETE FROM {table} WHERE ticker = ? AND period_type = ?",
                [ticker, period_type],
            )
            tag = f"_s{table[:4]}"
            con.register(tag, df)
            col_sql = ", ".join(cols)
            con.execute(f"INSERT INTO {table} ({col_sql}) SELECT {col_sql} FROM {tag}")
            con.unregister(tag)

        _load("income_statement", is_rows)
        _load("balance_sheet", bs_rows)
        _load("cash_flow_statement", cf_rows)


# ── Institutional holders ─────────────────────────────────────────────────────

def get_institutional_holders(ticker: str) -> list:
    with _conn() as con:
        df = con.execute(
            "SELECT * FROM institutional_holders WHERE ticker=? ORDER BY pct_held DESC NULLS LAST LIMIT 25",
            [ticker],
        ).fetchdf()
    return [_clean(r) for r in df.to_dict("records")]


def upsert_institutional_holders(ticker: str, rows: list) -> None:
    if not rows:
        return
    df = pd.DataFrame(rows)
    df["ticker"] = ticker
    with _conn() as con:
        con.execute("DELETE FROM institutional_holders WHERE ticker = ?", [ticker])
        con.register("_ih", df)
        cols = [c for c in ["ticker", "holder_name", "shares", "value", "pct_held", "holder_type"] if c in df.columns]
        col_sql = ", ".join(cols)
        con.execute(f"INSERT INTO institutional_holders ({col_sql}, updated_at) SELECT {col_sql}, now() FROM _ih")
        con.unregister("_ih")


# ── Insider transactions ──────────────────────────────────────────────────────

def get_insider_transactions(ticker: str) -> list:
    with _conn() as con:
        df = con.execute(
            "SELECT * FROM insider_transactions WHERE ticker=? ORDER BY transaction_date DESC LIMIT 50",
            [ticker],
        ).fetchdf()
    return [_clean(r) for r in df.to_dict("records")]


def upsert_insider_transactions(ticker: str, rows: list) -> None:
    if not rows:
        return
    df = pd.DataFrame(rows)
    df["ticker"] = ticker
    with _conn() as con:
        con.execute("DELETE FROM insider_transactions WHERE ticker = ?", [ticker])
        con.register("_it", df)
        cols = [c for c in ["ticker", "insider_name", "insider_title", "transaction_type", "shares", "value", "transaction_date"] if c in df.columns]
        col_sql = ", ".join(cols)
        con.execute(f"INSERT INTO insider_transactions ({col_sql}) SELECT {col_sql} FROM _it")
        con.unregister("_it")


# ── Corporate actions ─────────────────────────────────────────────────────────

def get_corporate_actions(ticker: str) -> list:
    with _conn() as con:
        df = con.execute(
            "SELECT * FROM corporate_actions_history WHERE ticker=? ORDER BY action_date DESC LIMIT 100",
            [ticker],
        ).fetchdf()
    return [_clean(r) for r in df.to_dict("records")]


def upsert_corporate_actions(ticker: str, rows: list) -> None:
    if not rows:
        return
    df = pd.DataFrame(rows)
    df["ticker"] = ticker
    with _conn() as con:
        con.execute("DELETE FROM corporate_actions_history WHERE ticker = ?", [ticker])
        con.register("_ca", df)
        cols = [c for c in ["ticker", "action_date", "action_type", "description", "value"] if c in df.columns]
        col_sql = ", ".join(cols)
        con.execute(f"INSERT INTO corporate_actions_history ({col_sql}) SELECT {col_sql} FROM _ca")
        con.unregister("_ca")


# ── Universe search ───────────────────────────────────────────────────────────

def universe_search(
    q: str = "",
    sector: str = "",
    asset_class: str = "",
    market_cap_min: Optional[float] = None,
    market_cap_max: Optional[float] = None,
    exchange: str = "",
    sort_by: str = "market_cap",
    sort_dir: str = "desc",
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[dict], int]:
    offset = (page - 1) * page_size
    params: list = []
    where: list[str] = []

    if q:
        where.append("(u.ticker ILIKE ? OR u.name ILIKE ?)")
        params += [f"%{q}%", f"%{q}%"]
    if sector:
        where.append("(COALESCE(cp.primary_sector, u.sector) ILIKE ?)")
        params.append(f"%{sector}%")
    if asset_class:
        upper = asset_class.upper()
        if upper == "ETF":
            where.append("u.is_etf = true")
        elif upper in ("EQUITY", "STOCK"):
            where.append("u.is_etf = false")
    if market_cap_min is not None:
        where.append("COALESCE(cp.market_cap, u.market_cap) >= ?")
        params.append(market_cap_min)
    if market_cap_max is not None:
        where.append("COALESCE(cp.market_cap, u.market_cap) <= ?")
        params.append(market_cap_max)
    if exchange:
        where.append("u.exchange = ?")
        params.append(exchange)

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    sort_col_map = {
        "market_cap": "COALESCE(cp.market_cap, u.market_cap)",
        "ticker":     "u.ticker",
        "pe_ratio":   "fr.pe_ratio",
        "ev_ebitda":  "fr.ev_ebitda",
        "revenue_growth": "fr.revenue_growth",
        "net_margin": "fr.net_margin",
        "price_change_1y": "fr.price_change_1y",
        "beta":       "fr.beta",
        "current_price": "fr.current_price",
        "roe":        "fr.roe",
    }
    sort_col = sort_col_map.get(sort_by, "COALESCE(cp.market_cap, u.market_cap)")
    order_dir = "ASC" if sort_dir.lower() == "asc" else "DESC"

    from_sql = f"""
        FROM us_universe u
        LEFT JOIN company_profiles cp ON u.ticker = cp.ticker
        LEFT JOIN financial_ratios fr ON u.ticker = fr.ticker
        {where_sql}
    """

    select_sql = f"""
        SELECT
            u.ticker,
            COALESCE(cp.company_name, u.name) AS name,
            u.exchange,
            u.is_etf,
            COALESCE(cp.primary_sector, u.sector) AS sector,
            COALESCE(cp.primary_industry, u.sub_industry) AS industry,
            COALESCE(cp.asset_class, CASE WHEN u.is_etf THEN 'ETF' ELSE 'EQUITY' END) AS asset_class,
            COALESCE(cp.market_cap, u.market_cap) AS market_cap,
            COALESCE(cp.currency, 'USD') AS currency,
            fr.current_price, fr.pe_ratio, fr.forward_pe, fr.ev_ebitda,
            fr.price_sales, fr.price_book, fr.dividend_yield,
            fr.revenue_growth, fr.earnings_growth,
            fr.gross_margin, fr.operating_margin, fr.net_margin,
            fr.roe, fr.beta,
            fr.price_change_1y, fr.price_change_3m,
            fr.high_52w, fr.low_52w,
            fr.recommendation, fr.analyst_count
        {from_sql}
        ORDER BY {sort_col} {order_dir} NULLS LAST, u.ticker
        LIMIT ? OFFSET ?
    """

    with _conn() as con:
        total = con.execute(f"SELECT COUNT(*) {from_sql}", params).fetchone()[0]
        df = con.execute(select_sql, params + [page_size, offset]).fetchdf()

    return [_clean(r) for r in df.to_dict("records")], total

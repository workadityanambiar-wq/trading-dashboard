import asyncio
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import data, factors, backtest, portfolio, risk, technical, pairs, mt5 as mt5_api, risk_model, regime as regime_api, earnings as earnings_api, institutional as inst_api, expected_return as er_api, crowding as crowding_api, earnings_drift as drift_api, quality as quality_api
from app.api import strategy_builder as strategy_api
from app.api import alerts as alerts_api
from app.api import reports as reports_api
from app.api import options_analytics as opts_api
from app.api import smart_money as smart_money_api
from app.api import alpha_engine as alpha_api
from app.api import country_macro as country_macro_api
from app.api import oil as oil_api
from app.api import dollar as dollar_api
from app.api import treasury as treasury_api
from app.core.data.cache import init_db
from app.core.data import fetcher, universe
from app.core.data.cache import get_tickers_with_prices
from app.core.alerts.models import init_alert_tables
from app.core.alerts.scanner import scanner_loop
from app.core.alerts.notifier import Notifier

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

_START_2Y = (datetime.today() - timedelta(days=730)).strftime("%Y-%m-%d")


def _is_market_hours() -> bool:
    """True if NYSE is currently open (or within 30 min of open/close)."""
    now_et = datetime.now(timezone.utc) - timedelta(hours=4)  # ET = UTC-4 (EDT)
    if now_et.weekday() >= 5:       # Saturday / Sunday
        return False
    h = now_et.hour + now_et.minute / 60
    return 9.0 <= h <= 16.5         # 9:00 AM – 4:30 PM ET


async def _auto_refresh_loop():
    """Refresh watchlist + cached tickers every 15 min during market hours, hourly otherwise."""
    await asyncio.sleep(10)         # wait for server to finish starting
    while True:
        interval = 900 if _is_market_hours() else 3600   # 15 min or 1 hour
        try:
            watchlist = universe.get_watchlist_tickers()
            cached    = list(get_tickers_with_prices())
            tickers   = list(dict.fromkeys(watchlist + cached))
            today     = datetime.today().strftime("%Y-%m-%d")
            await asyncio.get_event_loop().run_in_executor(
                None, fetcher.ensure_prices, tickers, _START_2Y, today
            )
            logger.info(f"Auto-refresh: updated {len(tickers)} tickers "
                        f"({'market hours' if _is_market_hours() else 'after hours'})")
        except Exception as e:
            logger.warning(f"Auto-refresh failed: {e}")
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    init_alert_tables()
    _notifier = Notifier()
    task = asyncio.create_task(_auto_refresh_loop())
    scan_task = asyncio.create_task(scanner_loop(_notifier))
    yield
    task.cancel()
    scan_task.cancel()


app = FastAPI(title="Quant Dashboard API", version="0.1.0", lifespan=lifespan)

_raw_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3003")
_allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(data.router, prefix="/api/data")
app.include_router(factors.router, prefix="/api/factors")
app.include_router(backtest.router, prefix="/api/backtest")
app.include_router(portfolio.router, prefix="/api/portfolio")
app.include_router(risk.router, prefix="/api/risk")
app.include_router(technical.router, prefix="/api/technical")
app.include_router(pairs.router,     prefix="/api/pairs")
app.include_router(mt5_api.router,   prefix="/api/mt5")
app.include_router(risk_model.router, prefix="/api/risk-model")
app.include_router(regime_api.router,   prefix="/api/regime")
app.include_router(earnings_api.router, prefix="/api/earnings")
app.include_router(inst_api.router,    prefix="/api/institutional")
app.include_router(er_api.router,      prefix="/api/expected-return")
app.include_router(crowding_api.router, prefix="/api/crowding")
app.include_router(drift_api.router,   prefix="/api/earnings-drift")
app.include_router(quality_api.router, prefix="/api/quality")
app.include_router(strategy_api.router, prefix="/api/strategy")
app.include_router(alerts_api.router,   prefix="/api/alerts")
app.include_router(reports_api.router,  prefix="/api/reports")
app.include_router(opts_api.router,          prefix="/api/options")
app.include_router(smart_money_api.router,   prefix="/api/smart-money")
app.include_router(alpha_api.router,         prefix="/api/alpha-engine")
app.include_router(country_macro_api.router, prefix="/api/country-macro")
app.include_router(oil_api.router,           prefix="/api/oil")
app.include_router(dollar_api.router,        prefix="/api/dollar")
app.include_router(treasury_api.router,      prefix="/api/treasury")


@app.get("/health")
async def health():
    return {"status": "ok"}

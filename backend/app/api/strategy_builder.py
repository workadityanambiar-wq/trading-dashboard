"""
Strategy Builder API.

POST /run      — full backtest with optional walk-forward + Monte Carlo
GET  /signals  — list all available signals
"""
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional, List

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.data import cache, fetcher, universe
from app.core.strategy.engine import StrategyConfig, run_backtest
from app.core.strategy.metrics import compute_all, compute_regime_metrics, compute_factor_attribution, _safe
from app.core.strategy.walk_forward import run_walk_forward
from app.core.strategy.monte_carlo import run_monte_carlo
from app.core.strategy.grader import grade_strategy, generate_warnings, generate_insights
from app.core.strategy.signals import TECHNICAL_SIGNALS, QUANT_SIGNALS

router = APIRouter(tags=["strategy_builder"])
logger = logging.getLogger(__name__)

_START_5Y = (datetime.today() - timedelta(days=5 * 365)).strftime("%Y-%m-%d")
_TODAY = datetime.today().strftime("%Y-%m-%d")

BENCHMARK = "SPY"


# ── Request Schema ─────────────────────────────────────────────────────────────

class FactorWeight(BaseModel):
    name: str
    weight: float = 1.0


class WalkForwardConfig(BaseModel):
    enabled: bool = False
    train_months: int = 24
    test_months: int = 6


class MonteCarloConfig(BaseModel):
    enabled: bool = False
    n_simulations: int = 1000
    horizon_days: int = 252


class StrategyRunRequest(BaseModel):
    name: str = "My Strategy"
    universe: str = "sp500"
    factors: List[FactorWeight] = []
    regime_filters: List[str] = []
    # Backtest config
    start_date: str = "2020-01-01"
    end_date: Optional[str] = None
    n_positions: int = 20
    position_sizing: str = "equal"
    rebalance_frequency: str = "monthly"
    initial_capital: float = 100_000
    leverage: float = 1.0
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    trailing_stop: Optional[float] = None
    transaction_cost_bps: float = 10.0
    slippage_bps: float = 5.0
    borrow_cost_annual: float = 0.0
    # Optional modules
    walk_forward: WalkForwardConfig = WalkForwardConfig()
    monte_carlo: MonteCarloConfig = MonteCarloConfig()


# ── GET /signals ───────────────────────────────────────────────────────────────

SIGNAL_META = {
    # Technical
    "ma_crossover": {"label": "MA Crossover", "category": "technical", "description": "Fast/slow moving average crossover signal"},
    "rsi": {"label": "RSI", "category": "technical", "description": "Relative Strength Index momentum signal"},
    "macd": {"label": "MACD", "category": "technical", "description": "MACD histogram — trend momentum"},
    "bollinger_bands": {"label": "Bollinger Bands", "category": "technical", "description": "Price position within Bollinger Bands (%B)"},
    "atr": {"label": "ATR (Low Vol)", "category": "technical", "description": "Low Average True Range = tighter setup"},
    "adx": {"label": "ADX", "category": "technical", "description": "Average Directional Index — trend strength"},
    "stochastic": {"label": "Stochastic", "category": "technical", "description": "Stochastic %D oscillator"},
    "donchian": {"label": "Donchian Channels", "category": "technical", "description": "Price position within Donchian channel (breakout)"},
    "volume_breakout": {"label": "Volume Breakout", "category": "technical", "description": "Volume surge on positive price move"},
    "vwap": {"label": "VWAP", "category": "technical", "description": "Price relative to rolling VWAP"},
    # Quantitative
    "momentum_1m": {"label": "Momentum 1M", "category": "quantitative", "description": "1-month price momentum"},
    "momentum_3m": {"label": "Momentum 3M", "category": "quantitative", "description": "3-month price momentum (skip 1M)"},
    "momentum_6m": {"label": "Momentum 6M", "category": "quantitative", "description": "6-month price momentum (skip 1M)"},
    "momentum_12m": {"label": "Momentum 12M", "category": "quantitative", "description": "12-month price momentum (skip 1M)"},
    "relative_strength": {"label": "Relative Strength", "category": "quantitative", "description": "Return relative to benchmark over 63 days"},
    "low_volatility": {"label": "Low Volatility", "category": "quantitative", "description": "Prefer stocks with lower realized volatility"},
    "mean_reversion": {"label": "Mean Reversion", "category": "quantitative", "description": "Buy below 20-day moving average"},
    "low_beta": {"label": "Low Beta", "category": "quantitative", "description": "Prefer stocks with lower market beta"},
    "low_correlation": {"label": "Low Correlation", "category": "quantitative", "description": "Prefer stocks with lower benchmark correlation"},
    "earnings_momentum": {"label": "Earnings Momentum", "category": "quantitative", "description": "Short-term return acceleration proxy for earnings surprise"},
}

REGIME_META = [
    {"id": "bull_market", "label": "Bull Market", "description": "Trade only when SPY is above its 200-day SMA"},
    {"id": "bear_market", "label": "Bear Market", "description": "Trade only when SPY is below its 200-day SMA"},
    {"id": "high_volatility", "label": "High Volatility", "description": "Trade only when VIX > 25"},
    {"id": "low_volatility", "label": "Low Volatility", "description": "Trade only when VIX < 15"},
    {"id": "risk_on", "label": "Risk-On", "description": "Trade only in risk-on environments (SPY above 50-SMA, positive trend)"},
    {"id": "risk_off", "label": "Risk-Off", "description": "Trade only in risk-off environments"},
]


@router.get("/signals")
async def get_signals():
    return {
        "signals": SIGNAL_META,
        "regime_filters": REGIME_META,
        "position_sizing_options": [
            {"id": "equal", "label": "Equal Weight"},
            {"id": "signal_weighted", "label": "Signal Weighted"},
            {"id": "vol_target", "label": "Volatility Targeted"},
        ],
        "rebalance_options": [
            {"id": "daily", "label": "Daily"},
            {"id": "weekly", "label": "Weekly"},
            {"id": "monthly", "label": "Monthly"},
        ],
    }


# ── POST /run ──────────────────────────────────────────────────────────────────

@router.post("/run")
async def run_strategy(req: StrategyRunRequest):
    if not req.factors:
        raise HTTPException(400, "At least one factor must be specified.")

    factor_weights = {f.name: f.weight for f in req.factors}
    unknown = [k for k in factor_weights if k not in {**TECHNICAL_SIGNALS, **QUANT_SIGNALS}]
    if unknown:
        raise HTTPException(400, f"Unknown signals: {unknown}. Call GET /signals for valid options.")

    end = req.end_date or _TODAY

    # ── Ensure price data ──────────────────────────────────────────────────
    sp500 = universe.get_sp500()
    tickers = sp500["ticker"].tolist() + [BENCHMARK]
    cached_count = sum(1 for t in tickers if cache.get_last_date(t) is not None)
    if cached_count < 10:
        raise HTTPException(503, "Insufficient price data. Open the Screener first to load prices.")

    await asyncio.get_event_loop().run_in_executor(
        None, fetcher.ensure_prices, [BENCHMARK], _START_5Y, end
    )

    # ── Load price matrices ────────────────────────────────────────────────
    def _load_prices():
        sp_tickers = sp500["ticker"].tolist()
        close_dict, high_dict, low_dict, vol_dict = {}, {}, {}, {}

        with cache._conn() as con:
            for t in sp_tickers:
                try:
                    df = con.execute(
                        "SELECT date, adj_close, high, low, volume FROM prices WHERE ticker=? AND date>=? AND date<=? ORDER BY date",
                        [t, req.start_date, end]
                    ).df()
                    if df is None or len(df) < 60:
                        continue
                    df = df.set_index(pd.to_datetime(df["date"])).drop("date", axis=1)
                    close_dict[t] = df["adj_close"]
                    high_dict[t] = df["high"]
                    low_dict[t] = df["low"]
                    vol_dict[t] = df["volume"]
                except Exception:
                    pass

            bm_df = con.execute(
                "SELECT date, adj_close FROM prices WHERE ticker=? AND date>=? AND date<=? ORDER BY date",
                [BENCHMARK, req.start_date, end]
            ).df()
            bm_series = pd.Series(
                bm_df["adj_close"].values,
                index=pd.to_datetime(bm_df["date"])
            ) if bm_df is not None and len(bm_df) > 0 else pd.Series(dtype=float)

        idx = bm_series.index if not bm_series.empty else pd.DatetimeIndex([])
        close = pd.DataFrame(close_dict).reindex(idx).ffill().dropna(how="all", axis=1)
        high = pd.DataFrame(high_dict).reindex(idx).ffill().dropna(how="all", axis=1)
        low = pd.DataFrame(low_dict).reindex(idx).ffill().dropna(how="all", axis=1)
        vol = pd.DataFrame(vol_dict).reindex(idx).ffill().dropna(how="all", axis=1)

        # Align all to common tickers
        common = close.columns.intersection(high.columns).intersection(low.columns).intersection(vol.columns)
        return close[common], high[common], low[common], vol[common], bm_series

    close, high, low, vol, benchmark = await asyncio.get_event_loop().run_in_executor(None, _load_prices)

    if close.empty or len(close.columns) < 5:
        raise HTTPException(503, "Insufficient price data. Load S&P 500 prices via the Screener first.")

    logger.info(f"Strategy Builder: {len(close.columns)} tickers, {len(close)} days, factors={list(factor_weights.keys())}")

    # ── Build config ───────────────────────────────────────────────────────
    cfg = StrategyConfig(
        factor_weights=factor_weights,
        regime_filters=req.regime_filters,
        start_date=req.start_date,
        end_date=end,
        n_positions=req.n_positions,
        position_sizing=req.position_sizing,
        rebalance_frequency=req.rebalance_frequency,
        initial_capital=req.initial_capital,
        leverage=req.leverage,
        stop_loss=req.stop_loss,
        take_profit=req.take_profit,
        trailing_stop=req.trailing_stop,
        transaction_cost_bps=req.transaction_cost_bps,
        slippage_bps=req.slippage_bps,
        borrow_cost_annual=req.borrow_cost_annual,
    )

    # ── Run backtest ───────────────────────────────────────────────────────
    def _run():
        result = run_backtest(close, high, low, vol, benchmark, cfg)
        bm_ret = benchmark.pct_change().reindex(result.returns.index).fillna(0)
        metrics = compute_all(result.returns, bm_ret)
        regime_metrics = compute_regime_metrics(result.returns, benchmark)
        factor_attr = compute_factor_attribution(result.returns, bm_ret)
        return result, metrics, regime_metrics, factor_attr

    result, metrics, regime_metrics, factor_attr = await asyncio.get_event_loop().run_in_executor(None, _run)

    # ── Optional: Walk-Forward ─────────────────────────────────────────────
    wf_result = None
    if req.walk_forward.enabled:
        def _wf():
            return run_walk_forward(
                close, high, low, vol, benchmark, cfg,
                train_months=req.walk_forward.train_months,
                test_months=req.walk_forward.test_months,
            )
        wf_result = await asyncio.get_event_loop().run_in_executor(None, _wf)

    # ── Optional: Monte Carlo ──────────────────────────────────────────────
    mc_result = None
    if req.monte_carlo.enabled:
        def _mc():
            return run_monte_carlo(
                result.returns,
                n_simulations=req.monte_carlo.n_simulations,
                horizon_days=req.monte_carlo.horizon_days,
            )
        mc_result = await asyncio.get_event_loop().run_in_executor(None, _mc)

    # ── Grading + Insights ─────────────────────────────────────────────────
    grade = grade_strategy(metrics, wf_result)
    warnings = generate_warnings(metrics, wf_result, req.model_dump())
    insights = generate_insights(metrics, regime_metrics, factor_attr, wf_result, req.model_dump())

    # ── Build equity curve for response ───────────────────────────────────
    equity_curve = [
        {
            "date": str(d.date()),
            "portfolio": _safe(float(result.equity_curve.get(d, np.nan))),
            "benchmark": _safe(float(result.benchmark_equity.get(d, np.nan))),
            "portfolio_ret": _safe(float(result.returns.get(d, np.nan))),
            "benchmark_ret": _safe(float(result.benchmark_returns.get(d, np.nan))),
        }
        for d in result.returns.index
    ]

    # Extract series data from metrics (prefixed with _)
    series_data = {k[1:]: v for k, v in metrics.items() if k.startswith("_")}
    clean_metrics = {k: v for k, v in metrics.items() if not k.startswith("_")}

    return {
        "strategy_name": req.name,
        "config": req.model_dump(),
        "metrics": clean_metrics,
        "grade": grade,
        "warnings": warnings,
        "insights": insights,
        "regime_metrics": regime_metrics,
        "factor_attribution": factor_attr,
        # Chart data
        "equity_curve": equity_curve,
        "drawdown_series": [
            {"date": str(d.date()), "value": _safe(float(v))}
            for d, v in result.drawdown.items()
        ],
        "monthly_returns": series_data.get("monthly_returns", []),
        "annual_returns": series_data.get("annual_returns", []),
        "rolling_sharpe": series_data.get("rolling_sharpe", []),
        "rolling_vol": series_data.get("rolling_vol", []),
        # Holdings / trades
        "holdings_history": result.holdings_history[-20:],
        "trade_log": result.trade_log,
        # Optional modules
        "walk_forward": wf_result,
        "monte_carlo": mc_result,
        # Meta
        "n_tickers": result.n_tickers,
        "n_days": len(result.returns),
    }

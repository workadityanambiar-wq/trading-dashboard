from __future__ import annotations
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.core.mt5 import client as mt5c
from app.core.mt5.analytics import compute_performance

router = APIRouter(tags=["mt5"])


class OrderRequest(BaseModel):
    symbol: str
    order_type: str  # "buy" | "sell"
    volume: float
    sl: float = 0.0
    tp: float = 0.0
    comment: str = ""


class CloseRequest(BaseModel):
    ticket: int


@router.get("/status")
def mt5_status():
    return {
        "available": mt5c.is_available(),
        "connected": mt5c._ensure_connected() if mt5c.is_available() else False,
    }


@router.get("/account")
def account_info():
    info = mt5c.get_account_info()
    if info is None:
        raise HTTPException(503, "MT5 terminal not connected. Ensure MetaTrader 5 is running and logged in.")
    return info


@router.get("/positions")
def positions():
    return mt5c.get_positions()


@router.get("/orders")
def pending_orders():
    return mt5c.get_orders()


@router.get("/history")
def deal_history(days: int = 30):
    to_dt = datetime.utcnow()
    from_dt = to_dt - timedelta(days=days)
    return mt5c.get_deal_history(from_dt, to_dt)


@router.get("/symbols")
def symbols(search: str = ""):
    return mt5c.get_symbols(search)


@router.get("/ohlcv/{symbol}")
def ohlcv(symbol: str, tf: str = "H1", count: int = 500):
    data = mt5c.get_ohlcv(symbol, tf, count)
    if not data:
        raise HTTPException(404, f"No OHLCV data for {symbol}")
    return data


@router.post("/order")
def place_order(req: OrderRequest):
    result = mt5c.place_market_order(
        symbol=req.symbol,
        order_type=req.order_type,
        volume=req.volume,
        sl=req.sl,
        tp=req.tp,
        comment=req.comment,
    )
    if not result.get("success"):
        raise HTTPException(400, result.get("error") or result.get("comment") or "Order failed")
    return result


@router.post("/close")
def close_position(req: CloseRequest):
    result = mt5c.close_position(req.ticket)
    if not result.get("success"):
        raise HTTPException(400, result.get("error") or result.get("comment") or "Close failed")
    return result


@router.get("/performance")
def performance(days: int = 90):
    to_dt = datetime.utcnow()
    from_dt = to_dt - timedelta(days=days)
    deals = mt5c.get_deal_history(from_dt, to_dt)
    metrics = compute_performance(deals)
    return {
        "days": days,
        "total_trades":      metrics.total_trades,
        "winners":           metrics.winners,
        "losers":            metrics.losers,
        "breakeven":         metrics.breakeven,
        "win_rate":          round(metrics.win_rate * 100, 1),
        "total_pnl":         round(metrics.total_pnl, 2),
        "gross_profit":      round(metrics.gross_profit, 2),
        "gross_loss":        round(metrics.gross_loss, 2),
        "profit_factor":     round(metrics.profit_factor, 2) if metrics.profit_factor != float("inf") else 999,
        "avg_win":           round(metrics.avg_win, 2),
        "avg_loss":          round(metrics.avg_loss, 2),
        "expectancy":        round(metrics.expectancy, 2),
        "max_win":           round(metrics.max_win, 2),
        "max_loss":          round(metrics.max_loss, 2),
        "avg_trade_pnl":     round(metrics.avg_trade_pnl, 2),
        "max_drawdown":      round(metrics.max_drawdown, 2),
        "max_drawdown_pct":  round(metrics.max_drawdown_pct, 1),
        "sharpe":            round(metrics.sharpe, 2),
        "sortino":           round(metrics.sortino, 2),
        "recovery_factor":   round(metrics.recovery_factor, 2),
        "consecutive_wins":  metrics.consecutive_wins,
        "consecutive_losses":metrics.consecutive_losses,
        "total_commission":  round(metrics.total_commission, 2),
        "total_swap":        round(metrics.total_swap, 2),
        "equity_curve":      metrics.equity_curve,
        "drawdown_series":   metrics.drawdown_series,
        "daily_returns":     metrics.daily_returns,
        "per_symbol":        metrics.per_symbol,
        "weekday_pnl":       metrics.weekday_pnl,
        "monthly_pnl":       metrics.monthly_pnl,
    }

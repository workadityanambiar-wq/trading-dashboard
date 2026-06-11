from __future__ import annotations
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.core.mt5 import client as mt5c

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

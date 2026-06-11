"""MetaTrader 5 connection manager — Windows-only, auto-login via env vars."""
from __future__ import annotations
import os
import sys
import threading
from datetime import datetime

# Load .env from backend root if python-dotenv is available
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"))
except ImportError:
    pass

MT5_AVAILABLE = sys.platform == "win32"
if MT5_AVAILABLE:
    try:
        import MetaTrader5 as mt5
        MT5_AVAILABLE = True
    except ImportError:
        MT5_AVAILABLE = False

_lock = threading.Lock()
_connected = False

_LOGIN  = int(os.environ.get("MT5_LOGIN", "0") or "0")
_PASS   = os.environ.get("MT5_PASSWORD", "")
_SERVER = os.environ.get("MT5_SERVER", "")


def _ensure_connected() -> bool:
    global _connected
    if not MT5_AVAILABLE:
        return False
    with _lock:
        if _connected:
            if mt5.account_info() is not None:
                return True
            _connected = False
        # Try auto-login with credentials if provided
        if _LOGIN and _PASS and _SERVER:
            ok = mt5.initialize(login=_LOGIN, password=_PASS, server=_SERVER)
        else:
            ok = mt5.initialize()
        if ok:
            _connected = True
            return True
        return False


def is_available() -> bool:
    return MT5_AVAILABLE


def get_account_info() -> dict | None:
    if not _ensure_connected():
        return None
    info = mt5.account_info()
    if info is None:
        return None
    d = info._asdict()
    return {k: (float(v) if isinstance(v, (int, float)) else v) for k, v in d.items()}


def get_positions() -> list[dict]:
    if not _ensure_connected():
        return []
    positions = mt5.positions_get()
    if positions is None:
        return []
    result = []
    for p in positions:
        d = p._asdict()
        d["time"] = datetime.utcfromtimestamp(d["time"]).isoformat()
        d["time_update"] = datetime.utcfromtimestamp(d["time_update"]).isoformat()
        result.append({k: (float(v) if isinstance(v, (int, float)) else v) for k, v in d.items()})
    return result


def get_orders() -> list[dict]:
    if not _ensure_connected():
        return []
    orders = mt5.orders_get()
    if orders is None:
        return []
    result = []
    for o in orders:
        d = o._asdict()
        d["time_setup"] = datetime.utcfromtimestamp(d["time_setup"]).isoformat()
        d["time_expiration"] = datetime.utcfromtimestamp(d["time_expiration"]).isoformat() if d["time_expiration"] else None
        result.append({k: (float(v) if isinstance(v, (int, float)) else v) for k, v in d.items()})
    return result


def get_deal_history(from_dt: datetime, to_dt: datetime) -> list[dict]:
    if not _ensure_connected():
        return []
    deals = mt5.history_deals_get(from_dt, to_dt)
    if deals is None:
        return []
    result = []
    for d in deals:
        row = d._asdict()
        row["time"] = datetime.utcfromtimestamp(row["time"]).isoformat()
        result.append({k: (float(v) if isinstance(v, (int, float)) else v) for k, v in row.items()})
    return result


def get_symbols(search: str = "") -> list[dict]:
    if not _ensure_connected():
        return []
    symbols = mt5.symbols_get(search) if search else mt5.symbols_get()
    if symbols is None:
        return []
    return [
        {
            "name": s.name,
            "description": s.description,
            "currency_base": s.currency_base,
            "currency_profit": s.currency_profit,
            "digits": s.digits,
            "trade_contract_size": float(s.trade_contract_size),
            "volume_min": float(s.volume_min),
            "volume_max": float(s.volume_max),
            "volume_step": float(s.volume_step),
            "bid": float(s.bid),
            "ask": float(s.ask),
            "spread": s.spread,
        }
        for s in symbols
    ]


def place_market_order(symbol: str, order_type: str, volume: float, sl: float = 0.0, tp: float = 0.0, comment: str = "") -> dict:
    if not _ensure_connected():
        return {"success": False, "error": "MT5 not connected"}
    sym_info = mt5.symbol_info(symbol)
    if sym_info is None:
        return {"success": False, "error": f"Symbol {symbol} not found"}
    if not sym_info.visible:
        mt5.symbol_select(symbol, True)
    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        return {"success": False, "error": f"No tick data for {symbol}"}

    ot = mt5.ORDER_TYPE_BUY if order_type.lower() == "buy" else mt5.ORDER_TYPE_SELL
    price = tick.ask if order_type.lower() == "buy" else tick.bid

    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": symbol,
        "volume": float(volume),
        "type": ot,
        "price": price,
        "sl": sl,
        "tp": tp,
        "deviation": 20,
        "magic": 234000,
        "comment": comment or "QuantDesk",
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": mt5.ORDER_FILLING_IOC,
    }
    result = mt5.order_send(request)
    if result is None:
        return {"success": False, "error": mt5.last_error()}
    if result.retcode != mt5.TRADE_RETCODE_DONE:
        return {"success": False, "retcode": result.retcode, "comment": result.comment}
    return {"success": True, "order": result.order, "price": float(result.price), "volume": float(result.volume)}


def close_position(ticket: int) -> dict:
    if not _ensure_connected():
        return {"success": False, "error": "MT5 not connected"}
    pos = mt5.positions_get(ticket=ticket)
    if not pos:
        return {"success": False, "error": "Position not found"}
    p = pos[0]
    tick = mt5.symbol_info_tick(p.symbol)
    if tick is None:
        return {"success": False, "error": "No tick data"}
    ot = mt5.ORDER_TYPE_SELL if p.type == mt5.ORDER_TYPE_BUY else mt5.ORDER_TYPE_BUY
    price = tick.bid if p.type == mt5.ORDER_TYPE_BUY else tick.ask
    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": p.symbol,
        "volume": p.volume,
        "type": ot,
        "position": ticket,
        "price": price,
        "deviation": 20,
        "magic": 234000,
        "comment": "QuantDesk close",
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": mt5.ORDER_FILLING_IOC,
    }
    result = mt5.order_send(request)
    if result is None:
        return {"success": False, "error": mt5.last_error()}
    if result.retcode != mt5.TRADE_RETCODE_DONE:
        return {"success": False, "retcode": result.retcode, "comment": result.comment}
    return {"success": True, "order": result.order}


def get_ohlcv(symbol: str, timeframe_str: str, count: int = 500) -> list[dict]:
    if not _ensure_connected():
        return []
    tf_map = {
        "M1": mt5.TIMEFRAME_M1, "M5": mt5.TIMEFRAME_M5, "M15": mt5.TIMEFRAME_M15,
        "M30": mt5.TIMEFRAME_M30, "H1": mt5.TIMEFRAME_H1, "H4": mt5.TIMEFRAME_H4,
        "D1": mt5.TIMEFRAME_D1, "W1": mt5.TIMEFRAME_W1, "MN1": mt5.TIMEFRAME_MN1,
    }
    tf = tf_map.get(timeframe_str.upper(), mt5.TIMEFRAME_H1)
    rates = mt5.copy_rates_from_pos(symbol, tf, 0, count)
    if rates is None:
        return []
    return [
        {
            "time": datetime.utcfromtimestamp(r["time"]).isoformat(),
            "open": float(r["open"]),
            "high": float(r["high"]),
            "low": float(r["low"]),
            "close": float(r["close"]),
            "volume": int(r["tick_volume"]),
        }
        for r in rates
    ]


def get_symbol_info_dict(symbol: str) -> dict | None:
    if not _ensure_connected():
        return None
    info = mt5.symbol_info(symbol)
    if info is None:
        return None
    return {
        "trade_contract_size": float(info.trade_contract_size),
        "point":               float(info.point),
        "digits":              int(info.digits),
        "bid":                 float(info.bid),
        "ask":                 float(info.ask),
    }


def shutdown():
    global _connected
    if MT5_AVAILABLE and _connected:
        mt5.shutdown()
        _connected = False

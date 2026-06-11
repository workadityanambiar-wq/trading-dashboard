"""Live position risk analytics — VaR, R:R, exposure per position and portfolio."""
from __future__ import annotations
from app.core.mt5 import client as mt5c


def compute_position_risk(positions: list[dict], account: dict) -> dict:
    balance = account.get("balance", 100000) or 100000

    pos_risk = []
    total_exposure = 0.0
    total_risk_dollar = 0.0
    net_long = 0.0
    net_short = 0.0

    for p in positions:
        symbol       = p["symbol"]
        vol          = p["volume"]
        price_open   = p["price_open"]
        price_curr   = p["price_current"]
        sl           = p.get("sl", 0) or 0
        tp           = p.get("tp", 0) or 0
        pos_type     = p["type"]           # 0 = buy, 1 = sell
        profit       = p.get("profit", 0)

        sym = mt5c.get_symbol_info_dict(symbol)
        contract_size = sym.get("trade_contract_size", 100000) if sym else 100000
        point         = sym.get("point", 0.00001)             if sym else 0.00001

        position_value = vol * contract_size * price_curr

        if sl > 0:
            risk_dollar = abs(price_open - sl) * vol * contract_size
        else:
            risk_dollar = position_value * 0.02   # assume 2% risk if no SL

        risk_pct = risk_dollar / balance * 100

        rr = 0.0
        if sl > 0 and tp > 0:
            reward = abs(tp - price_open)
            risk_pts = abs(price_open - sl)
            rr = reward / risk_pts if risk_pts > 0 else 0.0

        direction = 1 if pos_type == 0 else -1
        sl_pips   = round(abs(price_open - sl)   / point, 1) if (sl  > 0 and point > 0) else None
        tp_pips   = round(abs(tp - price_open)   / point, 1) if (tp  > 0 and point > 0) else None
        cur_pips  = round((price_curr - price_open) / point * direction, 1) if point > 0 else None

        total_exposure   += position_value
        total_risk_dollar += risk_dollar
        if pos_type == 0:
            net_long  += position_value
        else:
            net_short += position_value

        pos_risk.append({
            "ticket":        p["ticket"],
            "symbol":        symbol,
            "type":          pos_type,
            "type_label":    "BUY" if pos_type == 0 else "SELL",
            "volume":        vol,
            "price_open":    price_open,
            "price_current": price_curr,
            "profit":        profit,
            "position_value":  round(position_value,  2),
            "risk_dollar":     round(risk_dollar,     2),
            "risk_pct":        round(risk_pct,        2),
            "rr_ratio":        round(rr,              2),
            "sl_pips":         sl_pips,
            "tp_pips":         tp_pips,
            "current_pips":    cur_pips,
            "has_sl":          sl > 0,
            "has_tp":          tp > 0,
        })

    n   = len(positions)
    fpnl = sum(p["profit"] for p in positions)

    # Parametric VaR: 1 % daily vol (conservative for mixed portfolio)
    var_95 = total_exposure * 0.01 * 1.645
    var_99 = total_exposure * 0.01 * 2.326

    net_exp = net_long - net_short
    if total_exposure < 1:
        direction_label = "flat"
    elif abs(net_exp) < total_exposure * 0.1:
        direction_label = "neutral"
    elif net_exp > 0:
        direction_label = "net_long"
    else:
        direction_label = "net_short"

    with_sl = sum(1 for p in pos_risk if p["has_sl"])
    with_tp = sum(1 for p in pos_risk if p["has_tp"])

    return {
        "positions": pos_risk,
        "portfolio": {
            "n_positions":           n,
            "total_exposure":        round(total_exposure, 2),
            "total_exposure_pct":    round(total_exposure / balance * 100, 1),
            "total_risk_dollar":     round(total_risk_dollar, 2),
            "total_risk_pct":        round(total_risk_dollar / balance * 100, 2),
            "var_95_daily":          round(var_95, 2),
            "var_99_daily":          round(var_99, 2),
            "var_95_pct":            round(var_95 / balance * 100, 2),
            "net_long_exposure":     round(net_long,  2),
            "net_short_exposure":    round(net_short, 2),
            "direction":             direction_label,
            "positions_with_sl":     with_sl,
            "positions_without_sl":  n - with_sl,
            "positions_with_tp":     with_tp,
            "floating_pnl":          round(fpnl, 2),
            "floating_pnl_pct":      round(fpnl / balance * 100, 2),
            "margin_used":           account.get("margin", 0),
            "margin_level":          account.get("margin_level", 0),
        },
    }

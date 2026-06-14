"""
Put-call skew computation from options chains.
Skew = OTM put IV - OTM call IV (at equivalent moneyness).
High positive skew = market paying up for downside protection (fear).
"""
from __future__ import annotations

import logging
from datetime import date, timedelta, datetime

import numpy as np
import yfinance as yf

logger = logging.getLogger(__name__)

_cache: dict = {}
_cache_ts: dict[str, datetime] = {}
_TTL_SECS = 3600


def compute_skew(ticker: str = "SPY") -> dict:
    global _cache, _cache_ts
    now = datetime.now()
    if ticker in _cache_ts and (now - _cache_ts[ticker]).total_seconds() < _TTL_SECS:
        return _cache.get(ticker, {})

    result: dict = {
        "ticker":          ticker,
        "spot":            None,
        "atm_iv_30d":      None,   # interpolated 30-day ATM IV
        "skew_30d":        None,   # 90/110 skew at 30d
        "term_structure":  [],     # [{dte, atm_iv, skew}]
        "surface":         [],     # [{strike_pct, dte, iv}]
    }

    try:
        t    = yf.Ticker(ticker)
        spot = float(t.fast_info.get("last_price") or t.fast_info.get("lastPrice") or 0)
        if spot <= 0:
            return result
        result["spot"] = round(spot, 2)

        exps  = t.options
        today = date.today()

        term  = []
        surf  = []

        for exp in exps[:8]:
            dte = (date.fromisoformat(exp) - today).days
            if dte < 5:
                continue

            chain = t.option_chain(exp)
            calls = chain.calls
            puts  = chain.puts
            if calls.empty or puts.empty:
                continue

            def _iv(df, target_k):
                row = df[np.isclose(df["strike"], target_k, atol=spot * 0.02)]
                if row.empty:
                    return None
                v = float(row["impliedVolatility"].values[0])
                return v if v > 0 and not np.isnan(v) else None

            # ATM
            call_strikes = calls["strike"].values
            atm_k = float(call_strikes[int(np.argmin(np.abs(call_strikes - spot)))])
            atm_iv_c = _iv(calls, atm_k)
            atm_iv_p = _iv(puts,  atm_k)
            vals = [v for v in [atm_iv_c, atm_iv_p] if v]
            atm_iv = float(np.mean(vals)) if vals else None

            if atm_iv is None:
                continue

            # 90% put IV vs 110% call IV (skew proxy)
            k90  = round(spot * 0.90 / 5) * 5
            k110 = round(spot * 1.10 / 5) * 5
            iv90  = _iv(puts,  k90)
            iv110 = _iv(calls, k110)
            skew = round((iv90 - iv110) / atm_iv, 3) if iv90 and iv110 else None

            term.append({
                "dte":    dte,
                "expiry": exp,
                "atm_iv": round(atm_iv * 100, 1),
                "skew":   skew,
            })

            # Skew surface at key moneyness levels
            for k_pct in [0.80, 0.85, 0.90, 0.95, 1.00, 1.05, 1.10, 1.15]:
                k_target = spot * k_pct
                df_ = puts if k_pct < 1.0 else calls
                # nearest $5 strike
                all_ks = df_["strike"].values
                if len(all_ks) == 0:
                    continue
                nearest = float(all_ks[int(np.argmin(np.abs(all_ks - k_target)))])
                iv_val  = _iv(df_, nearest)
                if iv_val:
                    surf.append({
                        "strike_pct": int(k_pct * 100),
                        "dte":        dte,
                        "iv":         round(iv_val * 100, 1),
                        "norm_iv":    round(iv_val / atm_iv, 3) if atm_iv else None,
                    })

        result["term_structure"] = sorted(term, key=lambda x: x["dte"])

        # Interpolate 30d values
        near30 = min(term, key=lambda x: abs(x["dte"] - 30)) if term else None
        if near30:
            result["atm_iv_30d"] = near30["atm_iv"]
            result["skew_30d"]   = near30["skew"]

        result["surface"] = surf

    except Exception as e:
        logger.warning(f"Skew failed for {ticker}: {e}")

    _cache[ticker]    = result
    _cache_ts[ticker] = now
    return result

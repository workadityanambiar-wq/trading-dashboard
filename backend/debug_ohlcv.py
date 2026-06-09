from app.core.data.cache import get_ohlcv_wide
from app.core.factors.technical import compute_all_signals
from datetime import datetime, timedelta

tickers = ['SPY','NVDA','AMD','INTC','QCOM','AVGO','MRVL','SMCI','AMAT','LRCX','KLAC']
start = (datetime.today() - timedelta(days=365)).strftime('%Y-%m-%d')
today = datetime.today().strftime('%Y-%m-%d')
ohlcv = get_ohlcv_wide(tickers, start, today)
for k,v in ohlcv.items():
    nulls = v.iloc[-1].isna().sum() if not v.empty else "EMPTY"
    print(f"{k}: shape={v.shape}, last_row_nulls={nulls}")

print()
ac = ohlcv["adj_close"]
print("adj_close tail (last 2 rows):")
print(ac.tail(2))

print()
print("RSI check:")
from app.core.factors.technical import rsi
r = rsi(ac)
print(r)

print()
sig = compute_all_signals(ac, ohlcv["high"], ohlcv["low"], ohlcv["open"], ohlcv["volume"])
print("signals columns:", list(sig.columns))
print(sig[["rsi","ma50_dist","rs_spy_20d","momentum_score"]].head())

import sys
sys.path.insert(0, '.')
import yfinance as yf
import pandas as pd
from app.core.scanner.patterns import scan_bars

def fetch(ticker, interval, period, resample_4h=False):
    df = yf.download(ticker, period=period, interval=interval, progress=False, auto_adjust=True)
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    df.columns = [c.lower() for c in df.columns]
    if resample_4h:
        df = df.resample('4h').agg({'open':'first','high':'max','low':'min','close':'last','volume':'sum'}).dropna()
    df = df.dropna(subset=['open','high','low','close'])
    return [
        {'time': str(ts), 'open': float(r['open']), 'high': float(r['high']),
         'low': float(r['low']), 'close': float(r['close']), 'volume': int(r.get('volume', 0) or 0)}
        for ts, r in df.iterrows()
    ]

print('=== Nasdaq Composite (^IXIC) Pattern Scan ===')
for tf, args in [
    ('1D', ('^IXIC', '1d',  '2y',   False)),
    ('4H', ('^IXIC', '1h',  '729d', True)),
    ('1H', ('^IXIC', '1h',  '729d', False)),
]:
    bars = fetch(*args)
    results = scan_bars(bars, min_score=40)
    print(f'\n-- {tf} ({len(bars)} bars) --')
    for r in results:
        score = r['pattern_score']
        pat   = r['pattern']
        dirn  = r['direction']
        cls   = r['classification']
        rr    = r['rr_ratio']
        entry = r['entry']
        stop  = r['stop']
        t2    = r['target2']
        rsi   = r['rsi']
        adx   = r['adx']
        print(f'  [{score:5.1f}] {pat:<32} {dirn:<5} {cls:<18} RR={rr}x Entry={entry:.1f} Stop={stop:.1f} T2={t2:.1f} RSI={rsi} ADX={adx}')
    if not results:
        print('  No patterns above 40')

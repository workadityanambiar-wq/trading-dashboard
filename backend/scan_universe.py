"""
Full universe daily pattern scan -- SP500 + Nasdaq 100.
"""
import sys, io
sys.path.insert(0, '.')
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import yfinance as yf
import pandas as pd
import time
from app.core.scanner.patterns import scan_bars

# -- SP500 tickers (static list) ----------------------------------------------

SP500 = [
    'A','AAL','AAP','AAPL','ABBV','ABC','ABMD','ABT','ACN','ADBE','ADI','ADM','ADP','ADSK',
    'AEE','AEP','AES','AFL','AIG','AIZ','AJG','AKAM','ALB','ALGN','ALL','ALLE','AMAT','AMCR',
    'AMD','AME','AMGN','AMP','AMT','AMZN','ANET','ANSS','AON','AOS','APA','APD','APH','APTV',
    'ARE','ATO','ATVI','AVB','AVGO','AVY','AWK','AXP','AZO','BA','BAC','BALL','BAX','BBWI',
    'BBY','BDX','BEN','BF.B','BIIB','BIO','BK','BKNG','BKR','BLK','BMY','BR','BRO','BSX',
    'BWA','BXP','C','CAG','CAH','CARR','CAT','CB','CBOE','CBRE','CCI','CCL','CDNS','CDW',
    'CE','CEG','CF','CFG','CHD','CHRW','CHTR','CI','CINF','CL','CLX','CMA','CMCSA','CME',
    'CMG','CMI','CMS','CNC','CNP','COF','COO','COP','COST','CPB','CPRT','CRL','CRM','CSCO',
    'CSGP','CSX','CTAS','CTLT','CTRA','CTSH','CTVA','CVS','CVX','CZR','D','DAL','DD','DE',
    'DFS','DG','DGX','DHI','DHR','DIS','DISH','DLR','DLTR','DOV','DOW','DPZ','DRI','DTE',
    'DUK','DVA','DVN','DXC','DXCM','EA','EBAY','ECL','ED','EFX','EG','EIX','EL','ELV',
    'EMN','EMR','ENPH','EOG','EPAM','EQIX','EQR','EQT','ES','ESS','ETN','ETR','ETSY','EVRG',
    'EW','EXC','EXPD','EXPE','EXR','F','FANG','FAST','FCX','FDS','FDX','FE','FFIV','FIS',
    'FISV','FITB','FLT','FMC','FOX','FOXA','FRC','FRT','FTNT','FTV','GD','GE','GEN','GILD',
    'GIS','GL','GLW','GM','GNRC','GOOG','GOOGL','GPC','GPN','GRMN','GS','GWW','HAL','HAS',
    'HBAN','HCA','HD','HES','HIG','HII','HLT','HOLX','HON','HPE','HPQ','HRL','HSIC','HST',
    'HSY','HUM','HWM','IBM','ICE','IDXX','IEX','IFF','ILMN','INCY','INTC','INTU','INVH',
    'IP','IPG','IQV','IR','IRM','ISRG','IT','ITW','IVZ','J','JBHT','JCI','JKHY','JNJ',
    'JNPR','JPM','K','KEY','KEYS','KHC','KIM','KLAC','KMB','KMI','KMX','KO','KR','L',
    'LDOS','LEN','LH','LHX','LIN','LKQ','LLY','LMT','LNT','LOW','LRCX','LUV','LVS','LW',
    'LYB','LYV','MA','MAA','MAR','MAS','MCD','MCHP','MCK','MCO','MDLZ','MDT','MET','META',
    'MGM','MHK','MKC','MKTX','MLM','MMC','MMM','MNST','MO','MOH','MOS','MPC','MPWR','MRK',
    'MRNA','MRO','MS','MSCI','MSFT','MSI','MTB','MTCH','MTD','MU','NCLH','NDAQ','NEE','NEM',
    'NFLX','NI','NKE','NOC','NOW','NRG','NSC','NTAP','NTRS','NUE','NVDA','NVR','NWL','NWS',
    'NWSA','NXPI','O','OGN','OKE','OMC','ON','ORCL','ORLY','OXY','PAYC','PAYX','PCAR','PCG',
    'PEAK','PEG','PEP','PFE','PFG','PG','PGR','PH','PHM','PKG','PKI','PLD','PM','PNC','PNR',
    'PNW','PODD','POOL','PPG','PPL','PRU','PSA','PSX','PTC','PWR','PXD','PYPL','QCOM','QRVO',
    'RCL','RE','REG','REGN','RF','RJF','RL','RMD','ROK','ROL','ROP','ROST','RSG','RTX',
    'SBAC','SBUX','SCHW','SEE','SHW','SIVB','SJM','SLB','SNA','SNPS','SO','SPG','SPGI',
    'SRE','STE','STT','STX','STZ','SWK','SWKS','SYF','SYK','SYY','T','TAP','TDG','TDY',
    'TECH','TEL','TER','TFC','TFX','TGT','TJX','TMO','TMUS','TPR','TRMB','TROW','TRV',
    'TSCO','TSLA','TSN','TT','TTWO','TXN','TXT','TYL','UAL','UDR','UHS','ULTA','UNH','UNP',
    'UPS','URI','USB','V','VFC','VICI','VLO','VMC','VNO','VNT','VRSK','VRSN','VRTX','VTR',
    'VTRS','VZ','WAB','WAT','WBA','WBD','WDC','WEC','WELL','WFC','WHR','WM','WMB','WMT',
    'WRB','WRK','WST','WTW','WY','WYNN','XEL','XOM','XRAY','XYL','YUM','ZBH','ZBRA','ZION','ZTS',
]

NQ100 = [
    'AAPL','MSFT','NVDA','AMZN','META','GOOGL','GOOG','TSLA','AVGO','COST',
    'NFLX','AMD','ADBE','QCOM','PEP','TMUS','CSCO','INTC','INTU','AMAT',
    'BKNG','TXN','SBUX','GILD','MU','ISRG','LRCX','KLAC','REGN','MDLZ',
    'PANW','SNPS','CDNS','ADI','ABNB','FTNT','MRVL','ORLY','PYPL','ASML',
    'CEG','MCHP','MAR','CTAS','MNST','CPRT','PCAR','WDAY','BIIB','DXCM',
    'FANG','PAYX','FAST','ODFL','ROST','VRSK','EA','KDP','TEAM','GEHC',
    'DLTR','BKR','IDXX','TTWO','ON','CTSH','CRWD','ZS','ENPH','ALGN',
    'GFS','ZM','DDOG','OKTA','MRNA','ILMN','DOCU','SIRI','MTCH','CDW',
    'NXPI','ZBRA','SWKS','NTAP','LULU','JD','PDD','MELI','CHTR','TCOM',
    'TSCO','WBD','FSLR','ANSS','VRNS','SMCI','ARM','PLTR','COIN','APP',
]

# -- Batch download -----------------------------------------------------------

def batch_download(tickers, period='2y', interval='1d', batch_size=50):
    all_bars = {}
    for i in range(0, len(tickers), batch_size):
        batch = tickers[i:i + batch_size]
        try:
            raw = yf.download(
                batch, period=period, interval=interval,
                progress=False, auto_adjust=True, group_by='ticker',
            )
            for sym in batch:
                try:
                    if len(batch) == 1:
                        df = raw.copy()
                    else:
                        if sym not in raw.columns.get_level_values(0):
                            continue
                        df = raw[sym].copy()
                    if df.empty:
                        continue
                    df.columns = [c.lower() for c in df.columns]
                    df = df.dropna(subset=['open', 'high', 'low', 'close'])
                    if len(df) < 30:
                        continue
                    all_bars[sym] = [
                        {'time': str(ts), 'open': float(r['open']), 'high': float(r['high']),
                         'low': float(r['low']), 'close': float(r['close']),
                         'volume': int(r.get('volume', 0) or 0)}
                        for ts, r in df.iterrows()
                    ]
                except Exception:
                    pass
        except Exception as e:
            print(f'  batch error: {e}')
        time.sleep(0.25)
    return all_bars

# -- Scan ---------------------------------------------------------------------

def scan_universe(name, tickers, min_score=60):
    print(f'\nDownloading {len(tickers)} {name} tickers...')
    bars_map = batch_download(tickers)
    print(f'Got data for {len(bars_map)} / {len(tickers)} tickers. Scanning...')
    hits = []
    for sym, bars in bars_map.items():
        for r in scan_bars(bars, min_score=min_score):
            hits.append({**r, 'symbol': sym, 'index': name})
    hits.sort(key=lambda x: x['pattern_score'], reverse=True)
    return hits

# -- Main ---------------------------------------------------------------------

print('=' * 80)
print('DAILY PATTERN SCAN -- SP500 + NASDAQ 100')
print('Min score: 60  |  Timeframe: 1D  |  Data: Yahoo Finance')
print('=' * 80)

all_hits = []
all_hits += scan_universe('SP500',  SP500,  min_score=60)
all_hits += scan_universe('NQ100',  NQ100,  min_score=60)

# Deduplicate
seen = set()
hits = []
for h in sorted(all_hits, key=lambda x: x['pattern_score'], reverse=True):
    key = (h['symbol'], h['pattern'])
    if key not in seen:
        seen.add(key)
        hits.append(h)

LONG  = [h for h in hits if h['direction'] == 'LONG']
SHORT = [h for h in hits if h['direction'] == 'SHORT']
HIGH  = [h for h in hits if h['classification'] == 'HIGH_CONVICTION']

print(f'\nTOTAL: {len(hits)} patterns  |  {len(LONG)} LONG  |  {len(SHORT)} SHORT  |  {len(HIGH)} HIGH CONVICTION')

HDR = f'{"SYM":<7} {"IDX":<6} {"PATTERN":<32} {"SCR":>5} {"CLASS":<16} {"DIR":<6} {"CAT":<11} {"RR":>4} {"ENTRY":>9} {"STOP":>9} {"T2":>9} {"RSI":>5} {"ADX":>5}'

print('\n' + '-' * 80)
print('HIGH CONVICTION PATTERNS')
print('-' * 80)
print(HDR)
for h in HIGH:
    rsi = f'{h["rsi"]:.1f}' if h['rsi'] else '  --'
    adx = f'{h["adx"]:.1f}' if h['adx'] else '  --'
    print(f'{h["symbol"]:<7} {h["index"]:<6} {h["pattern"]:<32} {h["pattern_score"]:>5.1f} {h["classification"]:<16} {h["direction"]:<6} {h["category"]:<11} {h["rr_ratio"]:>4.1f} {h["entry"]:>9.2f} {h["stop"]:>9.2f} {h["target2"]:>9.2f} {rsi:>5} {adx:>5}')

print('\n' + '-' * 80)
print('ALL LONG SETUPS (top 50)')
print('-' * 80)
print(HDR)
for h in LONG[:50]:
    rsi = f'{h["rsi"]:.1f}' if h['rsi'] else '  --'
    adx = f'{h["adx"]:.1f}' if h['adx'] else '  --'
    print(f'{h["symbol"]:<7} {h["index"]:<6} {h["pattern"]:<32} {h["pattern_score"]:>5.1f} {h["classification"]:<16} {h["direction"]:<6} {h["category"]:<11} {h["rr_ratio"]:>4.1f} {h["entry"]:>9.2f} {h["stop"]:>9.2f} {h["target2"]:>9.2f} {rsi:>5} {adx:>5}')

print('\n' + '-' * 80)
print('ALL SHORT SETUPS (top 30)')
print('-' * 80)
print(HDR)
for h in SHORT[:30]:
    rsi = f'{h["rsi"]:.1f}' if h['rsi'] else '  --'
    adx = f'{h["adx"]:.1f}' if h['adx'] else '  --'
    print(f'{h["symbol"]:<7} {h["index"]:<6} {h["pattern"]:<32} {h["pattern_score"]:>5.1f} {h["classification"]:<16} {h["direction"]:<6} {h["category"]:<11} {h["rr_ratio"]:>4.1f} {h["entry"]:>9.2f} {h["stop"]:>9.2f} {h["target2"]:>9.2f} {rsi:>5} {adx:>5}')

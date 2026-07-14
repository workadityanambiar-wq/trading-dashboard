"""
Batch-populate Investment Universe profiles on Railway.
Calls /api/universe/{ticker}/profile for each S&P 500 ticker concurrently.
Each call triggers yfinance fetch + DuckDB cache on the server.
"""
import asyncio
import sys
import time
import httpx
import pandas as pd

BASE_URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
CONCURRENCY = 8   # parallel requests
TIMEOUT     = 30  # seconds per ticker


def get_sp500_tickers() -> list[str]:
    try:
        df = pd.read_html("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies")[0]
        return df["Symbol"].str.replace(".", "-", regex=False).tolist()
    except Exception as e:
        print(f"Wikipedia scrape failed: {e}, using fallback list")
        return [
            "AAPL","MSFT","NVDA","AMZN","META","GOOGL","GOOG","BRK-B","LLY",
            "AVGO","TSLA","JPM","WMT","V","UNH","XOM","MA","ORCL","HD","PG",
            "COST","JNJ","ABBV","NFLX","BAC","CVX","KO","PLTR","MRK","AMD",
            "CSCO","CRM","PEP","GE","ACN","WFC","NOW","TMO","IBM","MS","ABT",
            "LIN","PM","ISRG","GS","AXP","MCD","SPGI","CAT","AMGN","BX","RTX",
            "TXN","UBER","DHR","VZ","NEE","INTU","T","QCOM","LOW","BKNG","HON",
            "ETN","BSX","VRTX","PFE","SYK","UNP","C","AMAT","BA","ADP","BLK",
            "MDT","PANW","DE","GILD","ADI","CB","TJX","SCHW","MMC","SO","ELV",
            "BMY","FI","MDLZ","PLD","DUK","ZTS","ICE","APH","CL","CME","SBUX",
            "MCO","REGN","EOG","CI","SHW","LRCX","WM","ITW","GD","EQIX","AON",
        ]


async def fetch_profile(client: httpx.AsyncClient, ticker: str, sem: asyncio.Semaphore) -> tuple[str, bool, str]:
    async with sem:
        try:
            r = await client.get(f"{BASE_URL}/api/universe/{ticker}/profile", timeout=TIMEOUT)
            if r.status_code == 200:
                d = r.json()
                name = d.get("company_name") or d.get("short_name") or ticker
                mktcap = d.get("market_cap")
                mc_str = f"${mktcap/1e9:.0f}B" if mktcap else "n/a"
                return ticker, True, f"{name[:28]:<28} {mc_str}"
            else:
                return ticker, False, f"HTTP {r.status_code}"
        except Exception as e:
            return ticker, False, str(e)[:50]


async def main():
    tickers = get_sp500_tickers()
    print(f"Populating {len(tickers)} tickers -> {BASE_URL}")
    print("=" * 60)

    sem = asyncio.Semaphore(CONCURRENCY)
    ok = err = 0
    t0 = time.time()

    async with httpx.AsyncClient() as client:
        tasks = [fetch_profile(client, t, sem) for t in tickers]
        for i, coro in enumerate(asyncio.as_completed(tasks), 1):
            ticker, success, detail = await coro
            status = "OK" if success else "!!"
            if success:
                ok += 1
            else:
                err += 1
            elapsed = time.time() - t0
            rate = i / elapsed
            eta = (len(tickers) - i) / rate if rate > 0 else 0
            print(f"[{i:3d}/{len(tickers)}] {status} {ticker:<8} {detail}  (ETA {eta:.0f}s)")

    print("=" * 60)
    print(f"Done in {time.time()-t0:.0f}s  —  {ok} OK  {err} failed")


if __name__ == "__main__":
    asyncio.run(main())

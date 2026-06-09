from app.core.data.universe import get_all_us_listed
from app.core.data.cache import init_db, upsert_us_universe, get_us_universe_count, get_us_universe_page

print("Downloading NASDAQ Trader file...")
df = get_all_us_listed()
print(f"Total securities: {len(df)}")
print(f"Columns: {list(df.columns)}")
print(f"ETFs: {df.is_etf.sum()}")
print(f"Exchanges: {df['exchange'].value_counts().to_dict()}")
with_sector = (df['sector'] != '').sum()
print(f"Stocks with sector: {with_sector}")
print()
print(df.head(8).to_string())

print("\n--- Saving to DuckDB ---")
init_db()
count = upsert_us_universe(df)
print(f"Total in us_universe table: {count}")

print("\n--- Test pagination ---")
rows, total = get_us_universe_page(page=1, page_size=5)
print(f"Total: {total}, first 5:")
for r in rows:
    print(f"  {r['ticker']:8s} {r['name'][:40]:40s} {r['exchange']:4s} ETF={r['is_etf']} prices={r['has_prices']}")

print("\n--- Search test ---")
rows, total = get_us_universe_page(search="apple", page=1, page_size=5)
print(f"Search 'apple': {total} results")
for r in rows:
    print(f"  {r['ticker']:8s} {r['name'][:40]}")

print("\n--- Exchange filter ---")
rows, total = get_us_universe_page(exchange="N", page=1, page_size=3)
print(f"NYSE (N): {total} total, sample:")
for r in rows:
    print(f"  {r['ticker']:8s} {r['exchange']} {r['name'][:40]}")

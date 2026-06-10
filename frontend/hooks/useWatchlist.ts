"use client";
import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "quant-watchlist-v1";

export function useWatchlist() {
  const [tickers, setTickers] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setTickers(JSON.parse(raw));
    } catch {}
  }, []);

  const _persist = (next: string[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  };

  const add = useCallback((ticker: string) => {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setTickers(prev =>
      prev.includes(t) ? prev : _persist([...prev, t])
    );
  }, []);

  const remove = useCallback((ticker: string) => {
    setTickers(prev => _persist(prev.filter(t => t !== ticker)));
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setTickers([]);
  }, []);

  const has = useCallback(
    (ticker: string) => tickers.includes(ticker.toUpperCase()),
    [tickers]
  );

  return { tickers, add, remove, clear, has, mounted };
}

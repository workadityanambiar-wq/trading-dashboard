"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

const STORAGE_KEY = "quant-watchlist-v1";

async function loadFromSupabase(userId: string): Promise<string[] | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("user_watchlists")
    .select("tickers")
    .eq("user_id", userId)
    .single();
  return data?.tickers ?? null;
}

async function saveToSupabase(userId: string, tickers: string[]) {
  const supabase = createClient();
  await supabase.from("user_watchlists").upsert(
    { user_id: userId, tickers, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
}

export function useWatchlist() {
  const [tickers, setTickers] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  const [userId, setUserId]   = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolve current user and load tickers
  useEffect(() => {
    let active = true;
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      const local = (() => {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          return raw ? (JSON.parse(raw) as string[]) : [];
        } catch {
          return [];
        }
      })();

      if (user) {
        const remote = await loadFromSupabase(user.id);
        if (!active) return;
        if (remote === null) {
          // First login — seed cloud with local tickers
          await saveToSupabase(user.id, local);
          setTickers(local);
        } else {
          // Merge local additions into cloud list (union)
          const merged = Array.from(new Set([...remote, ...local]));
          if (merged.length !== remote.length) {
            await saveToSupabase(user.id, merged);
          }
          setTickers(merged);
        }
        setUserId(user.id);
      } else {
        if (!active) return;
        setTickers(local);
      }
      setMounted(true);
    }
    init();
    return () => { active = false; };
  }, []);

  // Debounced persist to both localStorage and Supabase
  const persist = useCallback((next: string[], uid: string | null) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    if (uid) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => saveToSupabase(uid, next), 800);
    }
  }, []);

  const add = useCallback((ticker: string) => {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setTickers(prev => {
      if (prev.includes(t)) return prev;
      const next = [...prev, t];
      persist(next, userId);
      return next;
    });
  }, [userId, persist]);

  const remove = useCallback((ticker: string) => {
    setTickers(prev => {
      const next = prev.filter(t => t !== ticker);
      persist(next, userId);
      return next;
    });
  }, [userId, persist]);

  const clear = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    if (userId) saveToSupabase(userId, []);
    setTickers([]);
  }, [userId]);

  const has = useCallback(
    (ticker: string) => tickers.includes(ticker.toUpperCase()),
    [tickers]
  );

  return { tickers, add, remove, clear, has, mounted };
}

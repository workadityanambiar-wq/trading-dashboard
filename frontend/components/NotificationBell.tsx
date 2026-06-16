"use client";
import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

export function NotificationBell({ userId = "default" }: { userId?: string }) {
  const [count, setCount] = useState(0);
  const [pulse, setPulse] = useState(false);
  const prevCount = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/alerts/unread-count?user_id=${userId}`);
        if (!res.ok) return;
        const data = await res.json();
        const n = data.count ?? 0;
        if (!cancelled) {
          if (n > prevCount.current) {
            setPulse(true);
            setTimeout(() => setPulse(false), 1500);
          }
          prevCount.current = n;
          setCount(n);
        }
      } catch {
        // backend may not be running
      }
    }

    poll();
    const id = setInterval(poll, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [userId]);

  return (
    <Link href="/alerts" className="relative flex items-center justify-center w-8 h-8 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors">
      <Bell
        size={16}
        strokeWidth={1.8}
        className={cn(pulse && "animate-bounce text-accent")}
      />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white px-0.5 leading-none">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}

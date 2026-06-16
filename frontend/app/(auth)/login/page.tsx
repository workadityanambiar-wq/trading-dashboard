"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    if (searchParams.get("error") === "auth_callback_failed") {
      setError("Email confirmation failed. Please try again.");
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <span className="text-xl font-semibold tracking-widest text-accent uppercase">Quant</span>
        <span className="text-xl font-semibold tracking-widest text-text-muted uppercase">Desk</span>
        <p className="mt-2 text-sm text-text-muted">Sign in to your account</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-lg p-6 space-y-4">
        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs text-text-muted uppercase tracking-wider">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-text-muted uppercase tracking-wider">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-accent text-background font-semibold text-sm py-2 rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {loading ? "Signing in…" : "Sign In"}
        </button>

        <p className="text-center text-xs text-text-muted">
          No account?{" "}
          <Link href="/signup" className="text-accent hover:underline">
            Sign up
          </Link>
        </p>
      </form>
    </div>
  );
}

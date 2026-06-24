import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background:    "rgb(var(--bg)         / <alpha-value>)",
        surface:       "rgb(var(--surface)    / <alpha-value>)",
        "surface-2":   "rgb(var(--surface2)   / <alpha-value>)",
        "surface-3":   "rgb(var(--surface3)   / <alpha-value>)",
        border:        "rgb(var(--border)     / <alpha-value>)",
        "border-2":    "rgb(var(--border2)    / <alpha-value>)",
        "text-primary":"rgb(var(--text-primary) / <alpha-value>)",
        "text-muted":  "rgb(var(--text-muted)   / <alpha-value>)",
        "text-faint":  "rgb(var(--text-faint)   / <alpha-value>)",
        positive:  "#22c55e",
        negative:  "#ef4444",
        warning:   "#f59e0b",
        accent:    "#6366f1",
        info:      "#3b82f6",
        purple:    "#a855f7",
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        sans: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        "2xl": "12px",
        "3xl": "16px",
        "4xl": "20px",
      },
      boxShadow: {
        "glow-sm":     "0 0 10px rgba(99,102,241,0.2)",
        "glow":        "0 0 20px rgba(99,102,241,0.3)",
        "glow-lg":     "0 0 40px rgba(99,102,241,0.4)",
        "glow-green":  "0 0 20px rgba(34,197,94,0.25)",
        "glow-red":    "0 0 20px rgba(239,68,68,0.25)",
        "glow-amber":  "0 0 20px rgba(245,158,11,0.25)",
        "premium":     "0 4px 24px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.2)",
        "premium-lg":  "0 8px 40px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)",
        "card":        "0 2px 12px rgba(0,0,0,0.3)",
        "card-hover":  "0 4px 20px rgba(0,0,0,0.4)",
        "inset":       "inset 0 1px 0 rgba(255,255,255,0.04)",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":  "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "surface-gradient": "linear-gradient(180deg, rgb(var(--surface2)) 0%, rgb(var(--surface)) 100%)",
      },
      animation: {
        "fade-in":   "fadeIn 0.3s ease forwards",
        "slide-up":  "slideUp 0.35s ease forwards",
        "scale-in":  "scaleIn 0.25s ease forwards",
        "shimmer":   "shimmer 1.5s infinite",
        "live-pulse":"livePulse 2s ease-in-out infinite",
        "glow-pulse":"glowPulse 2s ease-in-out infinite",
        "spin-slow": "spin 3s linear infinite",
      },
      keyframes: {
        fadeIn:    { from: { opacity: "0" }, to: { opacity: "1" } },
        slideUp:   { from: { opacity: "0", transform: "translateY(16px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        scaleIn:   { from: { opacity: "0", transform: "scale(0.96)" }, to: { opacity: "1", transform: "scale(1)" } },
        shimmer:   { "0%": { backgroundPosition: "-200% center" }, "100%": { backgroundPosition: "200% center" } },
        livePulse: {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 0 0 rgba(34,197,94,0.5)" },
          "50%":      { opacity: "0.8", boxShadow: "0 0 0 5px rgba(34,197,94,0)" },
        },
        glowPulse: {
          "0%, 100%": { opacity: "1" },
          "50%":      { opacity: "0.5" },
        },
      },
      transitionDuration: {
        "150": "150ms",
        "250": "250ms",
        "400": "400ms",
      },
    },
  },
  plugins: [],
};

export default config;

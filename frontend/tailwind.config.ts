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
        background:    "rgb(var(--bg)          / <alpha-value>)",
        surface:       "rgb(var(--surface)     / <alpha-value>)",
        "surface-2":   "rgb(var(--surface2)    / <alpha-value>)",
        "surface-3":   "rgb(var(--surface3)    / <alpha-value>)",
        border:        "rgb(var(--border)      / <alpha-value>)",
        "border-2":    "rgb(var(--border2)     / <alpha-value>)",
        "text-primary":"rgb(var(--text-primary)/ <alpha-value>)",
        "text-muted":  "rgb(var(--text-muted)  / <alpha-value>)",
        "text-faint":  "rgb(var(--text-faint)  / <alpha-value>)",
        // Institutional semantic colors
        positive:  "#16a34a",   /* deep green */
        negative:  "#dc2626",   /* deep red */
        warning:   "#ca8a04",   /* amber */
        accent:    "#3b82f6",   /* institutional blue */
        info:      "#0ea5e9",   /* sky blue */
        purple:    "#7c3aed",   /* deeper purple */
      },
      fontFamily: {
        sans: ["var(--font-sans)", "IBM Plex Sans", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["var(--font-mono)", "IBM Plex Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        DEFAULT: "4px",
        sm:  "2px",
        md:  "4px",
        lg:  "6px",
        xl:  "8px",
        "2xl": "10px",
        "3xl": "12px",
        "4xl": "14px",
      },
      boxShadow: {
        // Institutional — no glows, just depth
        "glow-sm":    "0 0 6px rgba(59,130,246,0.12)",
        "glow":       "0 0 12px rgba(59,130,246,0.15)",
        "glow-lg":    "0 0 20px rgba(59,130,246,0.18)",
        "glow-green": "0 0 8px rgba(22,163,74,0.15)",
        "glow-red":   "0 0 8px rgba(220,38,38,0.15)",
        "glow-amber": "0 0 8px rgba(202,138,4,0.12)",
        "premium":    "0 1px 4px rgba(0,0,0,0.3)",
        "premium-lg": "0 2px 8px rgba(0,0,0,0.4)",
        "card":       "0 1px 3px rgba(0,0,0,0.25)",
        "card-hover": "0 2px 6px rgba(0,0,0,0.35)",
        "inset":      "inset 0 1px 0 rgba(255,255,255,0.03)",
      },
      backgroundImage: {
        "gradient-radial":    "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":     "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "surface-gradient":   "linear-gradient(180deg, rgb(var(--surface2)) 0%, rgb(var(--surface)) 100%)",
      },
      animation: {
        "fade-in":   "fadeIn 0.15s ease forwards",
        "slide-up":  "slideUp 0.2s ease forwards",
        "scale-in":  "scaleIn 0.15s ease forwards",
        "shimmer":   "shimmer 1.2s infinite",
        "live-pulse":"livePulse 2.5s ease-in-out infinite",
        "glow-pulse":"glowPulse 2s ease-in-out infinite",
        "spin-slow": "spin 2s linear infinite",
      },
      keyframes: {
        fadeIn:    { from: { opacity: "0" }, to: { opacity: "1" } },
        slideUp:   { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        scaleIn:   { from: { opacity: "0", transform: "scale(0.98)" }, to: { opacity: "1", transform: "scale(1)" } },
        shimmer:   { "0%": { backgroundPosition: "-200% center" }, "100%": { backgroundPosition: "200% center" } },
        livePulse: {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 0 0 rgba(22,163,74,0.4)" },
          "50%":      { opacity: "0.8", boxShadow: "0 0 0 4px rgba(22,163,74,0)" },
        },
        glowPulse: { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0.4" } },
      },
      transitionDuration: { "100": "100ms", "150": "150ms", "250": "250ms" },
      spacing: {
        "4.5": "18px",
        "13": "52px",
        "18": "72px",
      },
    },
  },
  plugins: [],
};

export default config;

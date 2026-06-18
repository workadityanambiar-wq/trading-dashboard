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
        background:    "rgb(var(--bg)       / <alpha-value>)",
        surface:       "rgb(var(--surface)  / <alpha-value>)",
        "surface-2":   "rgb(var(--surface2) / <alpha-value>)",
        border:        "rgb(var(--border)   / <alpha-value>)",
        "text-primary":"rgb(var(--text-primary) / <alpha-value>)",
        "text-muted":  "rgb(var(--text-muted)   / <alpha-value>)",
        positive:  "#22c55e",
        negative:  "#ef4444",
        accent:    "#6366f1",
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;

"use client";
import { useEffect, useRef } from "react";

const TV_SYMBOL_MAP: Record<string, string> = {
  "^VIX":  "CBOE:VIX",
  "^GSPC": "SP:SPX",
  "^DJI":  "DJ:DJI",
  "^IXIC": "NASDAQ:IXIC",
  "^RUT":  "TVC:RUT",
  "^TNX":  "TVC:TNX",
  SPY:     "AMEX:SPY",
  QQQ:     "NASDAQ:QQQ",
  IWM:     "AMEX:IWM",
  DIA:     "AMEX:DIA",
  VIX:     "CBOE:VIX",
  TLT:     "NASDAQ:TLT",
  GLD:     "AMEX:GLD",
  GDX:     "AMEX:GDX",
  USO:     "AMEX:USO",
  UUP:     "AMEX:UUP",
  XLK:     "AMEX:XLK",
  XLF:     "AMEX:XLF",
  XLV:     "AMEX:XLV",
  XLE:     "AMEX:XLE",
  XLI:     "AMEX:XLI",
  XLP:     "AMEX:XLP",
  XLY:     "AMEX:XLY",
  XLU:     "AMEX:XLU",
  XLRE:    "AMEX:XLRE",
  XLB:     "AMEX:XLB",
  XLC:     "AMEX:XLC",
};

function toTVSymbol(ticker: string): string {
  return TV_SYMBOL_MAP[ticker] ?? ticker;
}

interface Props {
  symbol: string;
  height?: number;
  interval?: "1" | "5" | "15" | "60" | "D" | "W" | "M";
  hideSideToolbar?: boolean;
  allowSymbolChange?: boolean;
  studies?: string[];
}

export function TradingViewWidget({
  symbol,
  height = 420,
  interval = "D",
  hideSideToolbar = true,
  allowSymbolChange = false,
  studies = ["STD;MA%Cross"],
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = "";

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.type = "text/javascript";
    script.textContent = JSON.stringify({
      autosize: true,
      symbol: toTVSymbol(symbol),
      interval,
      timezone: "America/New_York",
      theme: "dark",
      style: "1",
      locale: "en",
      backgroundColor: "rgba(17, 17, 24, 0)",
      gridColor: "rgba(30, 30, 46, 1)",
      hide_top_toolbar: false,
      hide_legend: false,
      hide_side_toolbar: hideSideToolbar,
      allow_symbol_change: allowSymbolChange,
      save_image: false,
      calendar: false,
      studies,
      support_host: "https://www.tradingview.com",
    });

    el.appendChild(script);
    return () => {
      el.innerHTML = "";
    };
  }, [symbol, height, interval, hideSideToolbar, allowSymbolChange]);

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container w-full rounded overflow-hidden"
      style={{ height }}
    />
  );
}

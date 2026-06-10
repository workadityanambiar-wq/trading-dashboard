"use client";
import { useEffect, useRef } from "react";
import { createChart, ColorType, type IChartApi } from "lightweight-charts";
import type { OHLCVBar } from "@/lib/api";

interface Props {
  bars: OHLCVBar[];
  height?: number;
  showMA?: boolean;
}

function calcSMA(values: number[], period: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < period - 1) return null;
    const slice = values.slice(i - period + 1, i + 1);
    return slice.reduce((s, v) => s + v, 0) / period;
  });
}

export function CandlestickChart({ bars, height = 320, showMA = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || bars.length === 0) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#6b6b80",
      },
      grid: {
        vertLines: { color: "#1e1e2e" },
        horzLines: { color: "#1e1e2e" },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: "#2a2a38" },
      timeScale: { borderColor: "#2a2a38", timeVisible: true },
      width: containerRef.current.clientWidth,
      height,
    });

    chartRef.current = chart;

    const candles = (chart as any).addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    const volumes = (chart as any).addHistogramSeries({
      color: "#6366f130",
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });

    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    const times = bars.map((b) => b.time as any);
    const closes = bars.map((b) => b.close);

    candles.setData(
      bars.map((b) => ({ time: b.time as any, open: b.open, high: b.high, low: b.low, close: b.close }))
    );
    volumes.setData(
      bars.map((b) => ({
        time: b.time as any,
        value: b.volume,
        color: b.close >= b.open ? "#22c55e30" : "#ef444430",
      }))
    );

    if (showMA && bars.length >= 50) {
      const ma50vals = calcSMA(closes, 50);
      const ma50 = (chart as any).addLineSeries({
        color: "#f59e0b",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      ma50.setData(
        ma50vals
          .map((v, i) => v != null ? { time: times[i], value: v } : null)
          .filter(Boolean)
      );
    }

    if (showMA && bars.length >= 200) {
      const ma200vals = calcSMA(closes, 200);
      const ma200 = (chart as any).addLineSeries({
        color: "#6366f1",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      ma200.setData(
        ma200vals
          .map((v, i) => v != null ? { time: times[i], value: v } : null)
          .filter(Boolean)
      );
    }

    chart.timeScale().fitContent();

    const observer = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [bars, height, showMA]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
}

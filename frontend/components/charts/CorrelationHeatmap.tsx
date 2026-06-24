"use client";
import type { CorrelationMatrix } from "@/lib/api";

interface Props {
  data: CorrelationMatrix;
}

function corrColor(v: number): string {
  // -1 → red, 0 → dark gray, +1 → indigo
  const clamped = Math.max(-1, Math.min(1, v));
  if (clamped >= 0) {
    const t = clamped;
    const r = Math.round(99 * t);
    const g = Math.round(102 * t);
    const b = Math.round(241 * t + 24 * (1 - t));
    return `rgb(${r},${g},${b})`;
  } else {
    const t = -clamped;
    const r = Math.round(239 * t + 17 * (1 - t));
    const g = Math.round(68 * t + 17 * (1 - t));
    const b = Math.round(68 * t + 24 * (1 - t));
    return `rgb(${r},${g},${b})`;
  }
}

export function CorrelationHeatmap({ data }: Props) {
  const { tickers, matrix } = data;
  if (!tickers?.length) return null;

  const cellSize = Math.max(28, Math.min(52, Math.floor(560 / tickers.length)));

  return (
    <div className="overflow-auto">
      <table className="border-separate border-spacing-0.5" style={{ fontSize: 10 }}>
        <thead>
          <tr>
            <th style={{ width: cellSize * 1.5 }} />
            {tickers.map((t) => (
              <th
                key={t}
                className="text-text-muted font-normal text-center truncate"
                style={{ width: cellSize, maxWidth: cellSize, padding: 2 }}
                title={t}
              >
                <a
                  href={`https://www.tradingview.com/chart/?symbol=${t}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-accent transition-colors cursor-pointer"
                  onClick={e => e.stopPropagation()}
                >
                  {t.length > 5 ? t.slice(0, 4) : t}
                </a>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tickers.map((rowTicker, r) => (
            <tr key={rowTicker}>
              <td
                className="text-text-muted font-normal truncate pr-1.5 text-right"
                style={{ fontSize: 10, maxWidth: cellSize * 1.5 }}
                title={rowTicker}
              >
                <a
                  href={`https://www.tradingview.com/chart/?symbol=${rowTicker}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-accent transition-colors cursor-pointer"
                  onClick={e => e.stopPropagation()}
                >
                  {rowTicker.length > 6 ? rowTicker.slice(0, 5) : rowTicker}
                </a>
              </td>
              {tickers.map((_, c) => {
                const val = matrix[r][c];
                return (
                  <td
                    key={c}
                    title={`${rowTicker} / ${tickers[c]}: ${val.toFixed(2)}`}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      background: corrColor(val),
                      borderRadius: 2,
                    }}
                    className="text-center"
                  >
                    {tickers.length <= 15 && (
                      <span
                        className="font-mono"
                        style={{
                          fontSize: 9,
                          color: Math.abs(val) > 0.5 ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.45)",
                        }}
                      >
                        {val.toFixed(2)}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Scale legend */}
      <div className="flex items-center gap-2 mt-3 text-xs text-text-muted">
        <span>-1</span>
        <div
          className="flex-1 h-2 rounded"
          style={{
            background: "linear-gradient(to right, rgb(239,68,68), rgb(17,17,24), rgb(99,102,241))",
          }}
        />
        <span>+1</span>
      </div>
    </div>
  );
}

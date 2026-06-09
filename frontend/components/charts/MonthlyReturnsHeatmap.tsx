"use client";

interface MonthlyReturn { year: number; month: number; return_pct: number | null }
interface Props { data: MonthlyReturn[] }

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function cellColor(v: number): { bg: string; text: string } {
  if (v >= 0.06)  return { bg: "#166534", text: "#bbf7d0" };
  if (v >= 0.04)  return { bg: "#15803d", text: "#dcfce7" };
  if (v >= 0.02)  return { bg: "#16a34a", text: "#dcfce7" };
  if (v >= 0.005) return { bg: "#22c55e22", text: "#86efac" };
  if (v >= 0)     return { bg: "#22c55e11", text: "#6b7280" };
  if (v >= -0.02) return { bg: "#ef444411", text: "#fca5a5" };
  if (v >= -0.04) return { bg: "#dc2626", text: "#fecaca" };
  if (v >= -0.06) return { bg: "#b91c1c", text: "#fee2e2" };
  return { bg: "#7f1d1d", text: "#fecaca" };
}

function yearReturn(rows: MonthlyReturn[]): number {
  return rows.reduce((acc, r) => (r.return_pct != null ? (1 + acc) * (1 + r.return_pct) - 1 : acc), 0);
}

export function MonthlyReturnsHeatmap({ data }: Props) {
  const byYear = new Map<number, MonthlyReturn[]>();
  for (const d of data) {
    if (!byYear.has(d.year)) byYear.set(d.year, []);
    byYear.get(d.year)!.push(d);
  }
  const years = Array.from(byYear.keys()).sort();

  return (
    <div className="overflow-x-auto">
      <table className="text-xs w-full border-collapse">
        <thead>
          <tr>
            <th className="text-left text-text-muted pr-3 py-1 font-medium w-12">Year</th>
            {MONTHS.map((m) => (
              <th key={m} className="text-center text-text-muted font-medium px-1 py-1 min-w-[44px]">
                {m}
              </th>
            ))}
            <th className="text-center text-text-muted font-medium px-1 py-1 min-w-[48px]">Total</th>
          </tr>
        </thead>
        <tbody>
          {years.map((year) => {
            const rows = byYear.get(year)!;
            const ytd = yearReturn(rows);
            const ytdColors = cellColor(ytd);

            return (
              <tr key={year}>
                <td className="pr-3 py-0.5 text-text-muted font-mono">{year}</td>
                {MONTHS.map((_, mi) => {
                  const cell = rows.find((r) => r.month === mi + 1);
                  const v = cell?.return_pct;
                  if (v == null) {
                    return (
                      <td key={mi} className="px-0.5 py-0.5">
                        <div className="rounded px-1 py-1 text-center text-text-muted/30 min-w-[44px]">—</div>
                      </td>
                    );
                  }
                  const { bg, text } = cellColor(v);
                  const label = v >= 0 ? `+${(v * 100).toFixed(1)}%` : `${(v * 100).toFixed(1)}%`;
                  return (
                    <td key={mi} className="px-0.5 py-0.5">
                      <div
                        className="rounded px-1 py-1 text-center font-mono min-w-[44px]"
                        style={{ backgroundColor: bg, color: text }}
                        title={`${year}-${String(mi + 1).padStart(2, "0")}: ${label}`}
                      >
                        {label}
                      </div>
                    </td>
                  );
                })}
                <td className="px-0.5 py-0.5">
                  <div
                    className="rounded px-1 py-1 text-center font-mono font-semibold min-w-[48px]"
                    style={{ backgroundColor: ytdColors.bg, color: ytdColors.text }}
                  >
                    {ytd >= 0 ? `+${(ytd * 100).toFixed(1)}%` : `${(ytd * 100).toFixed(1)}%`}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

"use client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { FF3Attribution } from "@/lib/api";

interface Props {
  data: FF3Attribution;
  height?: number;
}

export function FactorAttribution({ data, height = 200 }: Props) {
  if (data.error && !data.beta_mkt) {
    return (
      <div className="flex items-center justify-center text-text-muted text-xs" style={{ height }}>
        {data.error}
      </div>
    );
  }

  const betas = [
    { name: "Mkt-RF", value: data.beta_mkt ?? 0, t: data.t_stats?.mkt ?? 0 },
    { name: "SMB", value: data.beta_smb ?? 0, t: data.t_stats?.smb ?? 0 },
    { name: "HML", value: data.beta_hml ?? 0, t: data.t_stats?.hml ?? 0 },
  ];

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={betas} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#6b7280" }} />
          <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} width={40} />
          <Tooltip
            contentStyle={{ background: "#111118", border: "1px solid #1e1e2e", fontSize: 11 }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(v: number, _name: string, entry: any) => [
              `${v.toFixed(3)}  (t=${(entry?.payload?.t ?? 0).toFixed(2)})`,
              "Beta",
            ]}
          />
          <ReferenceLine y={0} stroke="#3f3f5a" />
          <Bar dataKey="value" radius={[3, 3, 0, 0]}>
            {betas.map((b, i) => (
              <Cell
                key={i}
                fill={b.value >= 0 ? "#6366f1" : "#ef4444"}
                opacity={Math.abs(b.t) >= 2 ? 1 : 0.55}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs">
        <div className="bg-surface-2 rounded p-2">
          <div className="text-text-muted mb-0.5">Alpha (ann.)</div>
          <div
            className="font-mono font-semibold"
            style={{ color: (data.alpha ?? 0) >= 0 ? "#22c55e" : "#ef4444" }}
          >
            {data.alpha != null ? `${(data.alpha * 100).toFixed(2)}%` : "—"}
            {data.t_stats?.alpha != null && (
              <span className="text-text-muted font-normal ml-1">
                (t={data.t_stats.alpha.toFixed(2)})
              </span>
            )}
          </div>
        </div>
        <div className="bg-surface-2 rounded p-2">
          <div className="text-text-muted mb-0.5">R²</div>
          <div className="font-mono font-semibold text-text-primary">
            {data.r_squared != null ? data.r_squared.toFixed(3) : "—"}
          </div>
        </div>
        <div className="bg-surface-2 rounded p-2">
          <div className="text-text-muted mb-0.5">Residual Vol</div>
          <div className="font-mono font-semibold text-text-primary">
            {data.residual_vol != null ? `${(data.residual_vol * 100).toFixed(2)}%` : "—"}
          </div>
        </div>
        <div className="bg-surface-2 rounded p-2">
          <div className="text-text-muted mb-0.5">N Obs</div>
          <div className="font-mono font-semibold text-text-primary">{data.n_obs}</div>
        </div>
      </div>
    </div>
  );
}

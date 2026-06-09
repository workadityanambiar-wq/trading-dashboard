"use client";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useState, useMemo } from "react";
import type { FactorScore } from "@/lib/api";
import { EXCHANGE_LABELS } from "@/lib/api";
import { cn, formatPct } from "@/lib/utils";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

function ScoreCell({ value }: { value: number | null }) {
  if (value === null || value === undefined)
    return <span className="text-text-muted/40">—</span>;
  const color =
    value > 1    ? "text-green-400" :
    value > 0.3  ? "text-green-600" :
    value < -1   ? "text-red-400"   :
    value < -0.3 ? "text-red-600"   : "text-text-muted";
  return <span className={cn("font-mono", color)}>{value.toFixed(2)}</span>;
}

function RetCell({ value }: { value: number | null }) {
  if (value === null || value === undefined)
    return <span className="text-text-muted/40">—</span>;
  return (
    <span className={cn("font-mono", value >= 0 ? "text-positive" : "text-negative")}>
      {formatPct(value)}
    </span>
  );
}

function PricesBadge({ hasPrices }: { hasPrices: boolean }) {
  return (
    <span
      className={cn(
        "inline-block w-1.5 h-1.5 rounded-full",
        hasPrices ? "bg-positive" : "bg-surface-2 border border-border"
      )}
      title={hasPrices ? "Price data cached" : "No price data"}
    />
  );
}

const BASE_COLUMNS: ColumnDef<FactorScore>[] = [
  {
    accessorKey: "ticker",
    header: "Ticker",
    cell: ({ getValue }) => (
      <span className="font-semibold text-text-primary font-mono">{getValue<string>()}</span>
    ),
    size: 80,
  },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ getValue }) => (
      <span className="text-xs text-text-muted truncate max-w-[160px] block">{getValue<string>()}</span>
    ),
    size: 170,
  },
  {
    accessorKey: "sector",
    header: "Sector",
    cell: ({ getValue }) => (
      <span className="text-xs text-text-muted truncate max-w-[130px] block">{getValue<string>() || "—"}</span>
    ),
    size: 140,
  },
  {
    accessorKey: "composite",
    header: "Composite",
    cell: ({ getValue }) => <ScoreCell value={getValue<number | null>()} />,
    size: 100,
  },
  {
    accessorKey: "momentum_12_1_z",
    header: "Mom 12-1 Z",
    cell: ({ getValue }) => <ScoreCell value={getValue<number | null>()} />,
    size: 105,
  },
  {
    accessorKey: "momentum_6_1_z",
    header: "Mom 6-1 Z",
    cell: ({ getValue }) => <ScoreCell value={getValue<number | null>()} />,
    size: 100,
  },
  {
    accessorKey: "low_vol_z",
    header: "Low Vol",
    cell: ({ getValue }) => <ScoreCell value={getValue<number | null>()} />,
    size: 88,
  },
  {
    accessorKey: "liquidity_z",
    header: "Liquidity",
    cell: ({ getValue }) => <ScoreCell value={getValue<number | null>()} />,
    size: 88,
  },
  {
    accessorKey: "macro_regime_z",
    header: "Macro",
    cell: ({ getValue }) => <ScoreCell value={getValue<number | null>()} />,
    size: 80,
  },
  {
    accessorKey: "value_z",
    header: "Value",
    cell: ({ getValue }) => <ScoreCell value={getValue<number | null>()} />,
    size: 80,
  },
  {
    accessorKey: "quality_z",
    header: "Quality",
    cell: ({ getValue }) => <ScoreCell value={getValue<number | null>()} />,
    size: 80,
  },
  {
    accessorKey: "profitability_z",
    header: "Profit.",
    cell: ({ getValue }) => <ScoreCell value={getValue<number | null>()} />,
    size: 75,
  },
  {
    accessorKey: "earnings_revisions_z",
    header: "Revisions",
    cell: ({ getValue }) => <ScoreCell value={getValue<number | null>()} />,
    size: 88,
  },
  {
    accessorKey: "sentiment_z",
    header: "Sentiment",
    cell: ({ getValue }) => <ScoreCell value={getValue<number | null>()} />,
    size: 88,
  },
  {
    accessorKey: "size_z",
    header: "Size",
    cell: ({ getValue }) => <ScoreCell value={getValue<number | null>()} />,
    size: 75,
  },
  {
    accessorKey: "momentum_12_1",
    header: "12-1M Ret",
    cell: ({ getValue }) => <RetCell value={getValue<number | null>()} />,
    size: 90,
  },
  {
    accessorKey: "realized_vol",
    header: "Realized Vol",
    cell: ({ getValue }) => {
      const v = getValue<number | null>();
      return v !== null
        ? <span className="font-mono text-text-muted">{formatPct(v)}</span>
        : <span className="text-text-muted/40">—</span>;
    },
    size: 100,
  },
];

const EXCHANGE_COLUMN: ColumnDef<FactorScore> = {
  accessorKey: "exchange",
  header: "Exchange",
  cell: ({ row }) => {
    const code = row.original.exchange ?? "";
    const label = EXCHANGE_LABELS[code] ?? code;
    return (
      <div className="flex items-center gap-1.5">
        <PricesBadge hasPrices={row.original.has_prices ?? false} />
        <span className="text-xs text-text-muted">{label || "—"}</span>
        {row.original.is_etf && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-accent/20 text-accent font-medium">ETF</span>
        )}
      </div>
    );
  },
  size: 130,
};

interface Props {
  data: FactorScore[];
  showExchange?: boolean;
}

export function ScreenerTable({ data, showExchange = false }: Props) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "composite", desc: true },
  ]);

  const columns = useMemo(
    () => showExchange
      ? [BASE_COLUMNS[0], BASE_COLUMNS[1], EXCHANGE_COLUMN, ...BASE_COLUMNS.slice(2)]
      : BASE_COLUMNS,
    [showExchange]
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-border bg-surface">
              {hg.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                return (
                  <th
                    key={header.id}
                    className="text-left px-3 py-2 text-xs text-text-muted font-medium cursor-pointer select-none whitespace-nowrap hover:text-text-primary transition-colors"
                    style={{ width: header.column.columnDef.size }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {sorted === "asc"  ? <ArrowUp size={10} /> :
                       sorted === "desc" ? <ArrowDown size={10} /> :
                                           <ArrowUpDown size={10} className="opacity-30" />}
                    </div>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, i) => (
            <tr
              key={row.id}
              className={cn(
                "border-b border-border/50 hover:bg-surface-2 transition-colors",
                i % 2 === 0 ? "bg-surface" : "bg-background"
              )}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-2">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

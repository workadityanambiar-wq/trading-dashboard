"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { X, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";

interface Leg {
  symbol: string;
  direction: "buy" | "sell";
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
}

interface TradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  legs: Leg[];          // 1 leg = equity trade, 2 legs = pair trade
}

export function TradeModal({ isOpen, onClose, title, legs }: TradeModalProps) {
  const qc = useQueryClient();
  const [volume, setVolume] = useState("0.01");
  const [errors, setErrors] = useState<string[]>([]);

  const { mutate: placeOrders, isPending, isSuccess } = useMutation({
    mutationFn: async () => {
      const results = [];
      for (const leg of legs) {
        const r = await api.placeMT5Order({
          symbol:     leg.symbol,
          order_type: leg.direction,
          volume:     parseFloat(volume),
          sl:         leg.stopLoss  ?? 0,
          tp:         leg.takeProfit ?? 0,
          comment:    "QuantDesk",
        });
        results.push(r);
      }
      return results;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mt5-positions"] });
      setTimeout(onClose, 1500);
    },
    onError: (e) => setErrors([(e as Error).message]),
  });

  if (!isOpen) return null;

  const rr = legs[0]?.stopLoss && legs[0]?.takeProfit && legs[0]?.entryPrice
    ? Math.abs((legs[0].takeProfit - legs[0].entryPrice) / (legs[0].entryPrice - legs[0].stopLoss))
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="text-sm font-semibold text-text-primary">{title ?? "Place Trade"}</div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Legs */}
        <div className="px-5 py-4 space-y-3">
          {legs.map((leg, i) => (
            <div key={i} className={cn(
              "flex items-center justify-between rounded-lg px-3 py-2.5 border",
              leg.direction === "buy"
                ? "bg-emerald-500/10 border-emerald-500/30"
                : "bg-red-500/10 border-red-500/30"
            )}>
              <div className="flex items-center gap-2">
                {leg.direction === "buy"
                  ? <TrendingUp size={14} className="text-emerald-400" />
                  : <TrendingDown size={14} className="text-red-400" />}
                <span className="font-mono font-bold text-text-primary text-sm">{leg.symbol}</span>
                <span className={cn("text-xs font-bold uppercase", leg.direction === "buy" ? "text-emerald-400" : "text-red-400")}>
                  {leg.direction}
                </span>
              </div>
              <div className="text-right text-xs text-text-muted space-y-0.5">
                {leg.entryPrice  && <div>Entry: <span className="font-mono text-text-primary">{leg.entryPrice.toFixed(4)}</span></div>}
                {leg.stopLoss    && <div>SL: <span className="font-mono text-red-400">{leg.stopLoss.toFixed(4)}</span></div>}
                {leg.takeProfit  && <div>TP: <span className="font-mono text-emerald-400">{leg.takeProfit.toFixed(4)}</span></div>}
              </div>
            </div>
          ))}

          {/* Volume */}
          <div>
            <label className="text-xs text-text-muted block mb-1 uppercase tracking-wider">
              Volume (lots){legs.length > 1 && " — per leg"}
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={volume}
              onChange={e => setVolume(e.target.value)}
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-accent"
            />
          </div>

          {/* R:R display */}
          {rr && rr > 0 && (
            <div className="flex items-center justify-between text-xs bg-surface-2 rounded px-3 py-2 border border-border">
              <span className="text-text-muted">Risk:Reward</span>
              <span className={cn("font-mono font-bold", rr >= 2 ? "text-emerald-400" : rr >= 1 ? "text-yellow-400" : "text-red-400")}>
                1:{rr.toFixed(2)}
              </span>
            </div>
          )}

          {legs.length > 0 && !legs[0].stopLoss && (
            <div className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/30 rounded px-3 py-2">
              <AlertTriangle size={12} /> No stop loss — consider setting one
            </div>
          )}

          {errors.length > 0 && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
              {errors[0]}
            </div>
          )}

          {isSuccess && (
            <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded px-3 py-2">
              ✓ Order{legs.length > 1 ? "s" : ""} placed successfully
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-4 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded border border-border text-text-muted hover:text-text-primary text-sm transition-colors">
            Cancel
          </button>
          <button
            onClick={() => placeOrders()}
            disabled={isPending || isSuccess}
            className={cn(
              "flex-1 py-2 rounded font-semibold text-sm text-white transition-colors",
              legs[0]?.direction === "buy"
                ? "bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
                : "bg-red-600 hover:bg-red-500 disabled:opacity-50"
            )}>
            {isPending ? "Placing…" : isSuccess ? "Done!" : legs.length > 1 ? `Execute ${legs.length} Legs` : `${legs[0]?.direction?.toUpperCase()} ${legs[0]?.symbol}`}
          </button>
        </div>
      </div>
    </div>
  );
}

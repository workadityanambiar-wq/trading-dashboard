"use client";
import { DollarSign } from "lucide-react";

export default function DXYPage() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-text-muted">
      <DollarSign size={36} strokeWidth={1.2} className="text-accent/50" />
      <div className="text-center">
        <p className="text-sm font-medium text-text-primary">US Dollar (DXY)</p>
        <p className="text-xs mt-1">Trend, positioning &amp; cross-asset impact — coming soon</p>
      </div>
    </div>
  );
}

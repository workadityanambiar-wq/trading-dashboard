"use client";
import { Banknote } from "lucide-react";

export default function TreasuriesPage() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-text-muted">
      <Banknote size={36} strokeWidth={1.2} className="text-accent/50" />
      <div className="text-center">
        <p className="text-sm font-medium text-text-primary">Treasuries</p>
        <p className="text-xs mt-1">Yield curve, spreads &amp; duration signals — coming soon</p>
      </div>
    </div>
  );
}

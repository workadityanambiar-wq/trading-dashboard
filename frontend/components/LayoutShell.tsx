"use client";
import { useAppSettings } from "@/contexts/AppSettingsContext";
import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import { ChartModal } from "@/components/ChartModal";
import type { ReactNode } from "react";

export function LayoutShell({ children }: { children: ReactNode }) {
  const { layoutMode } = useAppSettings();

  if (layoutMode === "desktop") {
    return (
      <>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
        <ChartModal />
      </>
    );
  }

  return (
    <>
      <main className="min-h-screen page-scroll">{children}</main>
      <MobileNav />
      <ChartModal />
    </>
  );
}

import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { QueryProvider } from "@/components/QueryProvider";
import { ChartProvider } from "@/contexts/ChartContext";
import { ChartModal } from "@/components/ChartModal";
import { AuthProvider } from "@/contexts/AuthContext";

export const metadata: Metadata = {
  title: "Quant Dashboard",
  description: "Equity research and backtesting",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-text-primary font-mono antialiased">
        <AuthProvider>
          <QueryProvider>
            <ChartProvider>
              <div className="flex h-screen overflow-hidden">
                <Sidebar />
                <main className="flex-1 overflow-y-auto p-3 pt-14 md:p-6">{children}</main>
              </div>
              <ChartModal />
            </ChartProvider>
          </QueryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

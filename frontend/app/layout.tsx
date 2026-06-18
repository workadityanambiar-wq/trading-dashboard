import type { Metadata } from "next";
import "./globals.css";
import { QueryProvider } from "@/components/QueryProvider";
import { ChartProvider } from "@/contexts/ChartContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppSettingsProvider } from "@/contexts/AppSettingsContext";
import { ThemeLayoutWrapper } from "@/components/ThemeLayoutWrapper";
import { LayoutShell } from "@/components/LayoutShell";

export const metadata: Metadata = {
  title: "QuantDesk",
  description: "Institutional macro & quant research",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
      </head>
      <body className="bg-background text-text-primary font-mono antialiased">
        <AppSettingsProvider>
          <ThemeLayoutWrapper />
          <AuthProvider>
            <QueryProvider>
              <ChartProvider>
                <LayoutShell>{children}</LayoutShell>
              </ChartProvider>
            </QueryProvider>
          </AuthProvider>
        </AppSettingsProvider>
      </body>
    </html>
  );
}

"use client";
import { useEffect } from "react";
import { useAppSettings } from "@/contexts/AppSettingsContext";

export function ThemeLayoutWrapper() {
  const { theme } = useAppSettings();

  useEffect(() => {
    const html = document.documentElement;
    if (theme === "light") {
      html.classList.remove("dark");
      html.classList.add("light");
    } else {
      html.classList.remove("light");
      html.classList.add("dark");
    }
  }, [theme]);

  return null;
}

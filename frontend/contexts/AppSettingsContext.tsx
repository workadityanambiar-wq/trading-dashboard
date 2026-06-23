"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type LayoutMode = "desktop" | "mobile";
type Theme = "dark" | "light";

interface AppSettings {
  layoutMode: LayoutMode;
  theme: Theme;
  setLayoutMode: (mode: LayoutMode) => void;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const AppSettingsContext = createContext<AppSettings>({
  layoutMode: "desktop",
  theme: "dark",
  setLayoutMode: () => {},
  toggleTheme: () => {},
  setTheme: () => {},
});

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [layoutMode, setLayoutModeState] = useState<LayoutMode>("desktop");
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    const savedLayout = localStorage.getItem("qd-layout") as LayoutMode | null;
    const savedTheme  = localStorage.getItem("qd-theme")  as Theme | null;
    if (savedLayout === "desktop" || savedLayout === "mobile") setLayoutModeState(savedLayout);
    if (savedTheme  === "dark"    || savedTheme  === "light")  setThemeState(savedTheme);
  }, []);

  function setLayoutMode(mode: LayoutMode) {
    setLayoutModeState(mode);
    localStorage.setItem("qd-layout", mode);
  }

  function setTheme(t: Theme) {
    setThemeState(t);
    localStorage.setItem("qd-theme", t);
  }

  function toggleTheme() {
    setTheme(theme === "dark" ? "light" : "dark");
  }

  return (
    <AppSettingsContext.Provider value={{ layoutMode, theme, setLayoutMode, toggleTheme, setTheme }}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  return useContext(AppSettingsContext);
}

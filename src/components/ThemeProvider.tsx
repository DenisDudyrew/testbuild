"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

type Theme = "light" | "dark";
export type Accent = "violet" | "emerald" | "orange" | "crimson" | "blue";

export const ACCENTS: { id: Accent; label: string; color: string }[] = [
  { id: "violet", label: "Фиолетовый", color: "#6366f1" },
  { id: "emerald", label: "Изумрудный", color: "#10b981" },
  { id: "orange", label: "Оранжевый", color: "#f97316" },
  { id: "crimson", label: "Малиновый", color: "#e11d48" },
  { id: "blue", label: "Синий", color: "#3b82f6" },
];

interface ThemeContextType {
  theme: Theme;
  accent: Accent;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  setAccent: (accent: Accent) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  accent: "violet",
  toggleTheme: () => {},
  setTheme: () => {},
  setAccent: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [accent, setAccentState] = useState<Accent>("violet");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("zephyr-theme") as Theme | null;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial = stored || (prefersDark ? "dark" : "light");
    const storedAccent = localStorage.getItem("zephyr-accent") as Accent | null;
    const validAccent = ACCENTS.some((a) => a.id === storedAccent) ? (storedAccent as Accent) : "violet";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(initial);
    setAccentState(validAccent);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("zephyr-theme", theme);
  }, [theme, mounted]);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute("data-accent", accent);
    localStorage.setItem("zephyr-accent", accent);
  }, [accent, mounted]);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === "light" ? "dark" : "light"));
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
  }, []);

  const setAccent = useCallback((a: Accent) => {
    setAccentState(a);
  }, []);

  // Prevent hydration mismatch — render children with default theme until mounted
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider value={{ theme, accent, toggleTheme, setTheme, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}

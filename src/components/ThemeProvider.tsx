"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

/**
 * Light/dark theme, persisted to localStorage. The actual `.dark` class is set
 * before paint by the inline script in layout.tsx (no FOUC); this provider only
 * reads the class the script already applied and lets the UI toggle it.
 *
 * Persistence is localStorage-only on purpose: a DB-backed preference could not
 * run in the pre-paint script, so it would reintroduce the flash we avoid here.
 */
type Theme = "light" | "dark";

type ThemeValue = {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
};

const ThemeContext = createContext<ThemeValue | null>(null);

function apply(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem("theme", theme);
  } catch {
    // Private mode / storage disabled: the class still flips for this session.
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Seed from what the pre-paint script decided, so server and client agree.
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    setThemeState(
      document.documentElement.classList.contains("dark") ? "dark" : "light"
    );
  }, []);

  // If the user never chose, keep following the system while the page is open.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      if (localStorage.getItem("theme")) return; // manual choice wins
      const next: Theme = e.matches ? "dark" : "light";
      document.documentElement.classList.toggle("dark", e.matches);
      setThemeState(next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    apply(t);
    setThemeState(t);
  }, []);

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      apply(next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return { theme: "light", toggle: () => {}, setTheme: () => {} };
  }
  return ctx;
}

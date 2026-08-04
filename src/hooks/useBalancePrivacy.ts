"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "cadence.hideBalance";

// Module-level subscribers so every mounted balance strip flips together the
// instant the toggle is hit, without prop-drilling or a context provider.
const listeners = new Set<(v: boolean) => void>();
let current = false;

function read(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "1";
}

/**
 * Whether balances are masked, persisted in localStorage and shared across the
 * app. Returns `[hidden, toggle]`. Seeds from storage after mount so the server
 * and first client render agree (avoids a hydration mismatch).
 */
export function useBalancePrivacy(): [boolean, () => void] {
  const [hidden, setHidden] = useState(current);

  useEffect(() => {
    current = read();
    setHidden(current);
    const fn = (v: boolean) => setHidden(v);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  const toggle = useCallback(() => {
    current = !current;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(KEY, current ? "1" : "0");
    }
    listeners.forEach((fn) => fn(current));
  }, []);

  return [hidden, toggle];
}

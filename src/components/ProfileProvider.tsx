"use client";

import { createContext, useContext } from "react";
import { useProfile } from "@/hooks/useProfile";
import type { User } from "@/db/schema";

/**
 * Single shared source of profile truth. `useProfile` runs once here (it upserts
 * the Neon row on login), and everything that needs the current user reads it
 * through context instead of each spinning up its own fetch. The gate and the
 * profile page both depend on the same `user`, so they must not disagree.
 */
type ProfileValue = {
  user: User | null;
  loading: boolean;
  setRole: (role: "employer" | "employee") => void;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  authError: string | null;
  clearAuthError: () => void;
};

const ProfileContext = createContext<ProfileValue | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const profile = useProfile();
  return (
    <ProfileContext.Provider value={profile}>
      {children}
    </ProfileContext.Provider>
  );
}

/** Read the shared profile. Returns nulls before the provider has resolved. */
export function useProfileContext(): ProfileValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    // Rendered outside the provider: treat as "no profile yet" rather than
    // throwing, so a stray consumer never hard-crashes the tree.
    return {
      user: null,
      loading: false,
      setRole: () => {},
      setUser: () => {},
      authError: null,
      clearAuthError: () => {},
    };
  }
  return ctx;
}

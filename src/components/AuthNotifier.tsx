"use client";

import { useLogin } from "@privy-io/react-auth";
import { useRef } from "react";
import { useNotify } from "@/hooks/useNotify";

/**
 * Sends the welcome and sign-in emails, once per real login. Privy's onComplete
 * also fires on mount for a session that was already authenticated, and we skip
 * those so revisiting the app never triggers a "new sign-in" email. A brand new
 * account gets the welcome note; a returning login gets the sign-in alert. If
 * the account has no email on file yet, the server simply sends nothing.
 *
 * Mounted once, globally. ConnectWallet keeps its own plain useLogin() with no
 * onComplete, so the callback here is the only one that fires per login.
 */
export function AuthNotifier() {
  const { notify } = useNotify();
  const handled = useRef(false);

  useLogin({
    onComplete: ({ isNewUser, wasAlreadyAuthenticated }) => {
      if (wasAlreadyAuthenticated) return;
      if (handled.current) return;
      handled.current = true;
      notify(isNewUser ? "welcome" : "signin");
    },
  });

  return null;
}

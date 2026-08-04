"use client";

import { useEffect, useRef, useState } from "react";
import { AtSign, Check, Loader2, Mail, Wallet, X } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { WalletGate } from "@/components/WalletGate";
import { Button } from "@/components/Button";
import { useActiveAddress } from "@/hooks/useActiveAddress";
import { useApi } from "@/hooks/useApi";
import { useProfileContext } from "@/components/ProfileProvider";
import { validateUsername, USERNAME_MAX, usernameChangeUnlockAt } from "@/lib/username";
import { shortenAddress } from "@/lib/utils";

/**
 * Identity home. View and edit your @handle, display name, and which side of
 * the app you land on. Wallet and email are read-only, they come from Privy.
 */

type Status = "idle" | "checking" | "available" | "taken" | "invalid";

export default function ProfilePage() {
  const { connected } = useActiveAddress();

  if (!connected) {
    return (
      <div className="min-h-screen bg-paper">
        <Navbar />
        <WalletGate
          headline="Connect to see your profile"
          sub="Link your wallet to set up your handle and manage your account."
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper">
      <Navbar />
      <main className="mx-auto max-w-2xl px-5 pb-24 pt-28 sm:px-8">
        <p className="font-mono text-xs uppercase tracking-widest text-volt">
          your account
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tightest text-ink">
          Profile
        </h1>
        <p className="mt-1 text-sm text-ink/50">
          How you show up across Cadence.
        </p>

        <div className="mt-10 space-y-8">
          <UsernameField />
          <DisplayNameField />
          <RoleField />
          <ReadOnlyIdentity />
        </div>
      </main>
    </div>
  );
}

function UsernameField() {
  const { api } = useApi();
  const { user, setUser } = useProfileContext();

  const [value, setValue] = useState(user?.username ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const checkSeq = useRef(0);

  // Sync once the profile resolves.
  useEffect(() => {
    if (user?.username) setValue(user.username);
  }, [user?.username]);

  const current = user?.username ?? "";
  const dirty = value !== current;

  // A change (not the first set) is rate-limited to once per 14 days.
  const lockedUntil = usernameChangeUnlockAt(user?.usernameChangedAt, Date.now());
  const locked = lockedUntil !== null;

  useEffect(() => {
    if (!dirty) {
      setStatus("idle");
      setReason(null);
      return;
    }
    const check = validateUsername(value);
    if (!check.ok) {
      setStatus("invalid");
      setReason(check.error);
      return;
    }
    setStatus("checking");
    setReason(null);
    const seq = ++checkSeq.current;
    const t = setTimeout(async () => {
      try {
        const res = await api.checkUsername(check.value);
        if (seq !== checkSeq.current) return;
        if (res.available) {
          setStatus("available");
          setReason(null);
        } else {
          setStatus("taken");
          setReason(res.reason ?? "already taken");
        }
      } catch {
        if (seq !== checkSeq.current) return;
        setStatus("idle");
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, dirty]);

  async function save() {
    const check = validateUsername(value);
    if (!check.ok) {
      setStatus("invalid");
      setReason(check.error);
      return;
    }
    setBusy(true);
    try {
      const res = await api.setUsername(check.value);
      setUser(res.user);
      setStatus("idle");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/taken/i.test(msg)) {
        setStatus("taken");
        setReason("already taken");
      } else if (/day|change your handle/i.test(msg)) {
        // 14-day cooldown rejection from the server.
        setStatus("invalid");
        setReason(msg);
      } else {
        setReason("could not save, try again");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-none border border-ink/10 bg-paper-warm p-6">
      <label className="block">
        <span className="text-sm font-medium text-ink">Username</span>
        <span className="mt-0.5 block text-xs text-ink/45">
          Your public @handle. Lowercase letters, numbers, and underscores.
          You can change it once every 14 days.
        </span>
        <div className="relative mt-3">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/40">
            <AtSign size={16} />
          </span>
          <input
            value={value}
            onChange={(e) =>
              setValue(
                e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9_]/g, "")
                  .slice(0, USERNAME_MAX)
              )
            }
            placeholder="satoshi_streams"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={locked}
            className="w-full rounded-2xl border border-ink/10 bg-paper px-4 py-3 pl-10 pr-11 font-mono text-sm text-ink outline-none transition-colors placeholder:text-ink/25 focus:border-volt disabled:cursor-not-allowed disabled:opacity-60"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            {status === "checking" && (
              <Loader2 size={16} className="animate-spin text-ink/40" />
            )}
            {status === "available" && (
              <Check size={16} className="text-emerald-500" />
            )}
            {(status === "taken" || status === "invalid") && (
              <X size={16} className="text-red-500" />
            )}
          </span>
        </div>
      </label>
      <div className="mt-2 min-h-[1.25rem] text-xs">
        {locked && lockedUntil && (
          <span className="text-ink/50">
            Handle locked until{" "}
            {lockedUntil.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
            .
          </span>
        )}
        {!locked && status === "available" && (
          <span className="text-emerald-600">@{value} is free.</span>
        )}
        {!locked && (status === "taken" || status === "invalid") && reason && (
          <span className="text-red-500">{reason}</span>
        )}
        {!locked && saved && !dirty && (
          <span className="text-emerald-600">Saved.</span>
        )}
      </div>
      <div className="mt-3">
        <Button
          onClick={save}
          disabled={locked || !dirty || status !== "available" || busy}
          variant="volt"
        >
          {busy ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Saving
            </>
          ) : (
            "Save handle"
          )}
        </Button>
      </div>
    </section>
  );
}

function DisplayNameField() {
  const { api } = useApi();
  const { user, setUser } = useProfileContext();

  const [value, setValue] = useState(user?.displayName ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setValue(user?.displayName ?? "");
  }, [user?.displayName]);

  const dirty = value !== (user?.displayName ?? "");

  async function save() {
    setBusy(true);
    try {
      const res = await api.updateProfile({
        displayName: value.trim() === "" ? null : value.trim(),
      });
      setUser(res.user);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // non-fatal, leave the field as-is
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-none border border-ink/10 bg-paper-warm p-6">
      <label className="block">
        <span className="text-sm font-medium text-ink">Display name</span>
        <span className="mt-0.5 block text-xs text-ink/45">
          Optional. A friendlier name shown alongside your handle.
        </span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, 120))}
          placeholder="Satoshi Nakamoto"
          className="mt-3 w-full rounded-2xl border border-ink/10 bg-paper px-4 py-3 text-sm text-ink outline-none transition-colors placeholder:text-ink/25 focus:border-volt"
        />
      </label>
      <div className="mt-2 min-h-[1.25rem] text-xs">
        {saved && <span className="text-emerald-600">Saved.</span>}
      </div>
      <div className="mt-3">
        <Button onClick={save} disabled={!dirty || busy} variant="volt">
          {busy ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Saving
            </>
          ) : (
            "Save name"
          )}
        </Button>
      </div>
    </section>
  );
}

function RoleField() {
  const { user, setRole } = useProfileContext();
  const role = user?.role ?? null;

  const options: { key: "employer" | "employee"; label: string; sub: string }[] =
    [
      { key: "employer", label: "I pay a team", sub: "Sign the checks" },
      { key: "employee", label: "I get paid", sub: "Cash them" },
    ];

  return (
    <section className="rounded-none border border-ink/10 bg-paper-warm p-6">
      <p className="text-sm font-medium text-ink">Which side are you on?</p>
      <p className="mt-0.5 text-xs text-ink/45">
        Just picks your default dashboard. Switch anytime.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {options.map((o) => {
          const active = role === o.key;
          return (
            <button
              key={o.key}
              onClick={() => setRole(o.key)}
              className={
                active
                  ? "rounded-2xl border border-volt bg-volt-wash p-4 text-left"
                  : "rounded-2xl border border-ink/10 bg-paper p-4 text-left transition-colors hover:border-volt/40"
              }
            >
              <span className="block text-sm font-semibold text-ink">
                {o.label}
              </span>
              <span className="block text-xs text-ink/50">{o.sub}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ReadOnlyIdentity() {
  const { user } = useProfileContext();
  const { address } = useActiveAddress();
  const wallet = user?.walletAddress ?? address ?? null;

  return (
    <section className="rounded-none border border-ink/10 bg-paper-warm p-6">
      <p className="text-sm font-medium text-ink">Linked to your account</p>
      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-volt-wash text-volt">
            <Wallet size={15} />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-ink/45">Wallet</p>
            <p className="truncate font-mono text-sm text-ink">
              {wallet ? shortenAddress(wallet) : "not connected"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-volt-wash text-volt">
            <Mail size={15} />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-ink/45">Email</p>
            <p className="truncate text-sm text-ink">
              {user?.email ?? "no email on file"}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

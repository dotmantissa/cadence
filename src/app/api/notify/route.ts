import { NextResponse } from "next/server";
import { requireUser, badRequest } from "../_auth";
import { getNotifiableByAddress } from "@/db/queries";
import type { User } from "@/db/schema";
import { formatUsdc, rateToDaily, shortenAddress } from "@/lib/utils";
import {
  sendEmail,
  welcomeEmail,
  signinEmail,
  streamStartedPayerEmail,
  streamStartedPayeeEmail,
  requestReceivedEmail,
  counterOfferEmail,
  receiptEmail,
  emailEnabled,
} from "@/lib/email";

// Auth relies on runtime headers, so this is always dynamic.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Account-activity email. The client calls this after a login or a successful
 * on-chain action; we resolve who to notify and send the on-brand message to
 * each party. Counterparty emails are looked up here by wallet address and
 * never leave the server. Every send is best-effort: a delivery problem never
 * fails the request, since the on-chain action already happened.
 */

type Party = { email: string | null; username: string | null; displayName: string | null };

/** How a person is shown to the other side: @handle, then name, then address. */
function label(p: { username: string | null; displayName: string | null }, address: string): string {
  if (p.username) return `@${p.username}`;
  if (p.displayName) return p.displayName;
  return shortenAddress(address);
}

/** How we greet the recipient: their name if we have one. */
function greetName(p: { username: string | null; displayName: string | null }): string | null {
  return p.displayName ?? p.username ?? null;
}

function selfParty(user: User): Party {
  return {
    email: user.email ?? user.notificationEmail,
    username: user.username,
    displayName: user.displayName,
  };
}

/** "$1,200.00" from a base-unit string, or null if it doesn't parse. */
function money(base: unknown): string | null {
  if (typeof base !== "string" || !/^\d+$/.test(base)) return null;
  try {
    return `$${formatUsdc(BigInt(base))}`;
  } catch {
    return null;
  }
}

/** "$40.00 / day" from a per-second base-unit string, or null. */
function dailyRate(base: unknown): string | null {
  if (typeof base !== "string" || !/^\d+$/.test(base)) return null;
  try {
    return `$${rateToDaily(BigInt(base))} / day`;
  } catch {
    return null;
  }
}

function addr(v: unknown): string | null {
  return typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v) ? v : null;
}

function str(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

/** Best-effort "City, Region, Country" from Vercel's geo headers. */
function locationFrom(req: Request): string {
  const h = req.headers;
  const parts = [
    h.get("x-vercel-ip-city"),
    h.get("x-vercel-ip-country-region"),
    h.get("x-vercel-ip-country"),
  ]
    .map((p) => (p ? decodeURIComponent(p) : ""))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : "an unknown location";
}

/** A short, human device string from the user-agent. */
function deviceFrom(req: Request): string {
  const ua = req.headers.get("user-agent") ?? "";
  if (!ua) return "an unknown device";
  const os =
    /iPhone|iPad/.test(ua) ? "iOS" :
    /Android/.test(ua) ? "Android" :
    /Mac OS X/.test(ua) ? "macOS" :
    /Windows/.test(ua) ? "Windows" :
    /Linux/.test(ua) ? "Linux" : "";
  const browser =
    /Edg\//.test(ua) ? "Edge" :
    /Chrome\//.test(ua) ? "Chrome" :
    /Firefox\//.test(ua) ? "Firefox" :
    /Safari\//.test(ua) ? "Safari" : "a browser";
  return os ? `${browser} on ${os}` : browser;
}

export async function POST(req: Request) {
  const gate = await requireUser(req);
  if ("response" in gate) return gate.response;

  // Email off entirely: accept and no-op so the client never has to care.
  if (!emailEnabled) return NextResponse.json({ ok: true, sent: false });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("invalid json");
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const event = str(b.event);
  if (!event) return badRequest("missing event");

  const me = gate.user;
  const self = selfParty(me);
  const myLabel = label(self, me.walletAddress ?? "");

  // Resolve the counterparty (address -> email + identity) once, if present.
  const counterpartyAddress = addr(b.counterpartyAddress);
  let counter: Party | null = null;
  if (counterpartyAddress) counter = await getNotifiableByAddress(counterpartyAddress);
  const counterLabel = counterpartyAddress
    ? label(counter ?? { username: null, displayName: null }, counterpartyAddress)
    : "someone";

  const amount = money(b.amount);
  const rate = dailyRate(b.rate);
  const reference = str(b.reference, 120);
  const starts = str(b.starts, 60);

  const facts = {
    counterparty: counterLabel,
    amount: amount ?? "",
    rate: rate ?? "",
    reference,
    starts,
  };

  switch (event) {
    case "welcome": {
      if (self.email) await sendEmail(self.email, welcomeEmail(greetName(self)));
      break;
    }
    case "signin": {
      if (self.email)
        await sendEmail(
          self.email,
          signinEmail({
            name: greetName(self),
            location: locationFrom(req),
            device: deviceFrom(req),
            when: new Date().toUTCString(),
          })
        );
      break;
    }
    case "stream_started": {
      // The payer is the caller; the payee is the counterparty. On a batch, the
      // payer opts out of per-payee copies (notifySelf:false) so they get one
      // confirmation, not one per recipient.
      if (self.email && b.notifySelf !== false)
        await sendEmail(self.email, streamStartedPayerEmail(facts, greetName(self)));
      if (counter?.email)
        await sendEmail(
          counter.email,
          streamStartedPayeeEmail({ ...facts, counterparty: myLabel }, greetName(counter))
        );
      break;
    }
    case "request_received": {
      // The caller is the requester (payee); notify the payer they asked.
      if (counter?.email)
        await sendEmail(
          counter.email,
          requestReceivedEmail({ ...facts, counterparty: myLabel }, greetName(counter))
        );
      break;
    }
    case "counter_offer": {
      // The caller is the payer countering; notify the original requester (payee).
      if (counter?.email)
        await sendEmail(
          counter.email,
          counterOfferEmail({ ...facts, counterparty: myLabel }, greetName(counter))
        );
      break;
    }
    case "receipt": {
      const name = str(b.counterpartyName, 120);
      if (self.email)
        await sendEmail(
          self.email,
          receiptEmail(
            {
              counterparty: name ?? counterLabel,
              amount: amount ?? "the streamed amount",
              reference,
              when: str(b.when, 60) ?? new Date().toUTCString(),
            },
            greetName(self)
          )
        );
      break;
    }
    default:
      return badRequest("unknown event");
  }

  return NextResponse.json({ ok: true, sent: true });
}

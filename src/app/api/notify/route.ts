import { NextResponse } from "next/server";
import { requireUser, badRequest } from "../_auth";
import { getNotifiableByAddress } from "@/db/queries";
import type { User } from "@/db/schema";
import { formatUsdc, rateToDaily, shortenAddress } from "@/lib/utils";
import { notificationEnabled, type NotificationCategory } from "@/lib/notifications";
import {
  sendEmail,
  welcomeEmail,
  signinEmail,
  streamStartedPayerEmail,
  streamStartedPayeeEmail,
  streamActivatedPayerEmail,
  streamActivatedPayeeEmail,
  streamClaimedPayerEmail,
  streamClaimedPayeeEmail,
  streamToppedUpPayerEmail,
  streamToppedUpPayeeEmail,
  streamCancelledPayerEmail,
  streamCancelledPayeeEmail,
  requestReceivedEmail,
  counterOfferEmail,
  receiptEmail,
  emailEnabled,
  type EmailContent,
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

type Party = {
  email: string | null;
  username: string | null;
  displayName: string | null;
  settings: Record<string, unknown> | null;
};

type DeliveryStatus = "sent" | "no_email" | "disabled" | "failed";

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
    settings: user.settings ?? null,
  };
}

/**
 * Send to one party only if they have an email and haven't switched this
 * category off. Every category defaults to on, so an account that never touched
 * the toggles still gets mail. The status is returned for server-side
 * observability without exposing email addresses to the client.
 */
async function send(
  party: Party | null,
  category: NotificationCategory,
  content: EmailContent
): Promise<DeliveryStatus> {
  if (!party?.email) return "no_email";
  if (!notificationEnabled(party.settings, category)) return "disabled";
  return (await sendEmail(party.email, content)) ? "sent" : "failed";
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
  if (!emailEnabled) {
    console.warn("[notify] email provider is not configured");
    return NextResponse.json({ ok: true, sent: 0 });
  }

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
  const deliveryStatuses: DeliveryStatus[] = [];
  const sendAndRecord = async (
    party: Party | null,
    category: NotificationCategory,
    content: EmailContent
  ) => {
    const status = await send(party, category, content);
    deliveryStatuses.push(status);
    return status;
  };

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

  // Names for the greeting line on each side's copy.
  const selfName = greetName(self);
  const counterName = counter ? greetName(counter) : null;
  // The same stream, described from the counterparty's point of view: to them,
  // the "other party" is the caller.
  const factsToCounter = { ...facts, counterparty: myLabel };

  switch (event) {
    case "welcome": {
      // Onboarding: always sent, not a toggleable category.
      if (self.email) await sendEmail(self.email, welcomeEmail(selfName));
      break;
    }
    case "signin": {
      await sendAndRecord(
        self,
        "signin",
        signinEmail({
          name: selfName,
          location: locationFrom(req),
          device: deviceFrom(req),
          when: new Date().toUTCString(),
        })
      );
      break;
    }
    case "stream_started": {
      // The payer is the caller by default; `perspective:"employee"` flips it for
      // the rare payee-initiated open. On a batch, the payer opts out of per-payee
      // copies (notifySelf:false) so they get one confirmation, not one per payee.
      const callerIsPayer = str(b.perspective) !== "employee";
      const wantSelf = b.notifySelf !== false;
      if (callerIsPayer) {
        if (wantSelf) await sendAndRecord(self, "streams", streamStartedPayerEmail(facts, selfName));
        await sendAndRecord(counter, "streams", streamStartedPayeeEmail(factsToCounter, counterName));
      } else {
        if (wantSelf) await sendAndRecord(self, "streams", streamStartedPayeeEmail(facts, selfName));
        await sendAndRecord(counter, "streams", streamStartedPayerEmail(factsToCounter, counterName));
      }
      break;
    }
    case "stream_activated": {
      // A scheduled stream flipped live. Either side may detect the flip and fire
      // this, so `perspective` decides which wording goes to whom.
      const callerIsPayer = str(b.perspective) !== "employee";
      if (callerIsPayer) {
        await sendAndRecord(self, "streams", streamActivatedPayerEmail(facts, selfName));
        await sendAndRecord(counter, "streams", streamActivatedPayeeEmail(factsToCounter, counterName));
      } else {
        await sendAndRecord(self, "streams", streamActivatedPayeeEmail(facts, selfName));
        await sendAndRecord(counter, "streams", streamActivatedPayerEmail(factsToCounter, counterName));
      }
      break;
    }
    case "stream_claimed": {
      // The payee withdraws by default; `perspective:"employer"` would flip it.
      // `amount` is what was just claimed.
      const callerIsPayee = str(b.perspective) !== "employer";
      if (callerIsPayee) {
        await sendAndRecord(self, "claims", streamClaimedPayeeEmail(facts, selfName));
        await sendAndRecord(counter, "claims", streamClaimedPayerEmail(factsToCounter, counterName));
      } else {
        await sendAndRecord(self, "claims", streamClaimedPayerEmail(facts, selfName));
        await sendAndRecord(counter, "claims", streamClaimedPayeeEmail(factsToCounter, counterName));
      }
      break;
    }
    case "stream_topped_up": {
      // Always fired by the payer. `amount` is what was added; `rate` is the new
      // (raised) daily rate, or empty if the rate was left unchanged.
      await sendAndRecord(self, "topups", streamToppedUpPayerEmail(facts, selfName));
      await sendAndRecord(counter, "topups", streamToppedUpPayeeEmail(factsToCounter, counterName));
      break;
    }
    case "stream_cancelled": {
      // Always fired by the payer (cancelStream is employer-only). The payer
      // hears the refund; the payee hears they keep what already streamed.
      const streamed = money(b.streamed);
      const refund = money(b.refund);
      await sendAndRecord(
        self,
        "cancellations",
        streamCancelledPayerEmail({ counterparty: counterLabel, refund, streamed, reference }, selfName)
      );
      await sendAndRecord(
        counter,
        "cancellations",
        streamCancelledPayeeEmail({ counterparty: myLabel, streamed, reference }, counterName)
      );
      break;
    }
    case "request_received": {
      // The caller is the requester (payee); notify the payer they asked.
      await sendAndRecord(counter, "requests", requestReceivedEmail(factsToCounter, counterName));
      break;
    }
    case "counter_offer": {
      // The caller is the payer countering; notify the original requester (payee).
      await sendAndRecord(counter, "requests", counterOfferEmail(factsToCounter, counterName));
      break;
    }
    case "receipt": {
      const name = str(b.counterpartyName, 120);
      await sendAndRecord(
        self,
        "receipts",
        receiptEmail(
          {
            counterparty: name ?? counterLabel,
            amount: amount ?? "the streamed amount",
            reference,
            when: str(b.when, 60) ?? new Date().toUTCString(),
          },
          selfName
        )
      );
      break;
    }
    default:
      return badRequest("unknown event");
  }

  const sent = deliveryStatuses.filter((status) => status === "sent").length;
  const skipped = deliveryStatuses.filter((status) => status !== "sent").length;
  if (skipped > 0) {
    console.warn("[notify] delivery incomplete", {
      event,
      selfHasEmail: !!self.email,
      counterpartyMatched: !!counter,
      counterpartyHasEmail: !!counter?.email,
      statuses: deliveryStatuses,
    });
  }
  return NextResponse.json({ ok: true, sent, attempted: deliveryStatuses.length });
}

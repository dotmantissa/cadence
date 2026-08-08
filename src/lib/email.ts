import "server-only";

import { Resend } from "resend";

/**
 * Transactional email, server-side only. Everything the app sends to a user
 * about their account goes through here: one on-brand template, one sender, and
 * a set of typed builders for each kind of message.
 *
 * Two rules the copy must always keep: a plain, human tone, and no machine
 * tells. That means no em-dashes and no "sent by an assistant" style sign-off.
 * If you add a builder, read the ones below and match their voice.
 *
 * When RESEND_API_KEY is unset the whole module no-ops: sends resolve to false
 * and nothing throws, so the app runs identically without email configured.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM ?? "Cadence <hello@cadenceonarc.tech>";
const APP_URL = "https://www.cadenceonarc.tech";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

/** Whether email is configured at all. Handy for skipping work upstream. */
export const emailEnabled = resend !== null;

const BRAND = {
  volt: "#2b44e7",
  voltSoft: "#eef0fe",
  ink: "#141316",
  paper: "#ffffff",
  warm: "#f7f6f3",
  muted: "#6b6b72",
  faint: "#9a9aa2",
  border: "#e7e6e2",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

interface Row {
  label: string;
  value: string;
}

interface Compose {
  subject: string;
  /** Hidden inbox-preview line. Keep it short and specific. */
  preheader: string;
  heading: string;
  /** Body paragraphs, plain sentences. Rendered in order. */
  paragraphs: string[];
  /** Optional labelled facts (amount, rate, reference) shown in a boxed list. */
  rows?: Row[];
  /** Optional call to action. `href` is made absolute against the app. */
  cta?: { label: string; href: string };
  /** Optional closing line under the button. */
  outro?: string;
}

function absolute(href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  return `${APP_URL}${href.startsWith("/") ? "" : "/"}${href}`;
}

function rowsHtml(rows: Row[]): string {
  const items = rows
    .map(
      (r) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid ${BRAND.border};color:${BRAND.muted};font-size:14px;">${escapeHtml(
        r.label
      )}</td>
        <td style="padding:10px 0;border-bottom:1px solid ${BRAND.border};color:${BRAND.ink};font-size:14px;font-weight:600;text-align:right;font-family:'SFMono-Regular',Consolas,monospace;">${escapeHtml(
        r.value
      )}</td>
      </tr>`
    )
    .join("");
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;border-top:1px solid ${BRAND.border};">
      ${items}
    </table>`;
}

function buttonHtml(cta: { label: string; href: string }): string {
  const href = absolute(cta.href);
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 6px;">
      <tr>
        <td style="border-radius:9999px;background:${BRAND.volt};">
          <a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:9999px;">${escapeHtml(
            cta.label
          )}</a>
        </td>
      </tr>
    </table>`;
}

/** Wraps body content in the branded shell: wordmark, card, footer. */
function shell(inner: string, preheader: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light" />
  </head>
  <body style="margin:0;padding:0;background:${BRAND.warm};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(
      preheader
    )}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.warm};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${BRAND.paper};border:1px solid ${BRAND.border};border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 8px;">
                <span style="font-size:19px;font-weight:700;letter-spacing:-0.02em;color:${BRAND.ink};">Cadence</span>
                <span style="display:inline-block;margin-left:6px;font-size:12px;color:${BRAND.faint};font-family:'SFMono-Regular',Consolas,monospace;">// payments that stream</span>
              </td>
            </tr>
            <tr>
              <td style="height:2px;background:${BRAND.volt};margin:0;"></td>
            </tr>
            <tr>
              <td style="padding:28px 32px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.ink};line-height:1.6;">
                ${inner}
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
            <tr>
              <td style="padding:18px 32px;color:${BRAND.faint};font-size:12px;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                You are getting this because your email is linked to a Cadence account. Your funds and streams live on-chain and keep running whether or not you open this.
                <br />
                <a href="${APP_URL}/profile" style="color:${BRAND.muted};text-decoration:underline;">Manage your account</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Build the HTML + plaintext parts from a structured message. */
function render(c: Compose): EmailContent {
  const paras = c.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:15px;color:${BRAND.ink};">${escapeHtml(
          p
        )}</p>`
    )
    .join("");

  const inner = `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;letter-spacing:-0.02em;color:${BRAND.ink};">${escapeHtml(
      c.heading
    )}</h1>
    ${paras}
    ${c.rows && c.rows.length ? rowsHtml(c.rows) : ""}
    ${c.cta ? buttonHtml(c.cta) : ""}
    ${
      c.outro
        ? `<p style="margin:14px 0 0;font-size:13px;color:${BRAND.muted};">${escapeHtml(
            c.outro
          )}</p>`
        : ""
    }`;

  // Plaintext mirror. Keeps the same order so a text-only client loses nothing.
  const textParts: string[] = [c.heading, "", ...c.paragraphs];
  if (c.rows && c.rows.length) {
    textParts.push("");
    for (const r of c.rows) textParts.push(`${r.label}: ${r.value}`);
  }
  if (c.cta) {
    textParts.push("", `${c.cta.label}: ${absolute(c.cta.href)}`);
  }
  if (c.outro) textParts.push("", c.outro);
  textParts.push("", "Cadence // payments that stream", `${APP_URL}/profile`);

  return {
    subject: c.subject,
    html: shell(inner, c.preheader),
    text: textParts.join("\n"),
  };
}

/**
 * Send one email. Never throws: a missing key, a bad address, or a Resend
 * outage resolves to `false` so account actions are never blocked on delivery.
 * Returns `true` only when Resend accepted the message.
 */
export async function sendEmail(
  to: string,
  content: EmailContent
): Promise<boolean> {
  if (!resend) return false;
  const address = to.trim();
  if (!address || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) return false;
  try {
    const res = await resend.emails.send({
      from: FROM,
      to: address,
      subject: content.subject,
      html: content.html,
      text: content.text,
    });
    return !res.error;
  } catch {
    return false;
  }
}

/* ---- builders ------------------------------------------------------------ */
/* Each returns an EmailContent. Keep the voice plain and warm, and remember:
   no em-dashes, no assistant sign-off. Callers pass display-ready strings. */

function greeting(name?: string | null): string {
  return name && name.trim() ? `Hi ${name.trim()},` : "Hi there,";
}

/** New account. Sent the first time someone signs in. */
export function welcomeEmail(name?: string | null): EmailContent {
  return render({
    subject: "Welcome to Cadence",
    preheader: "Your account is ready. Here is how streaming payments work.",
    heading: "Welcome to Cadence",
    paragraphs: [
      greeting(name),
      "Cadence pays people by the second. You deposit once, and the money moves continuously to whoever you are paying. They can watch it add up and cash out whenever they want.",
      "Head to your dashboard to open your first stream or set up your handle so people can pay you by name instead of a wallet address.",
    ],
    cta: { label: "Open Cadence", href: "/payer" },
    outro: "Glad to have you here.",
  });
}

/** Confirmation after a wallet user links a notification email. */
export function emailConnectedEmail(name?: string | null): EmailContent {
  return render({
    subject: "Your email is connected",
    preheader: "You will now get account updates at this address.",
    heading: "Email connected",
    paragraphs: [
      greeting(name),
      "This email is now linked to your Cadence account. We will send you a note when a payment starts, when someone requests a stream, and for other activity on your account.",
      "This does not change how you sign in. Your wallet stays the only way into your account, so keep using it to log in.",
    ],
    cta: { label: "View your profile", href: "/profile" },
  });
}

/** Sign-in alert. `location` and `device` are best-effort, may be unknown. */
export function signinEmail(opts: {
  name?: string | null;
  location: string;
  device: string;
  when: string;
}): EmailContent {
  return render({
    subject: "New sign-in to your Cadence account",
    preheader: `Signed in from ${opts.location}.`,
    heading: "New sign-in",
    paragraphs: [
      greeting(opts.name),
      "Your Cadence account was just signed in to. If this was you, there is nothing to do.",
      "If you do not recognize this, disconnect and check that your wallet has not been shared.",
    ],
    rows: [
      { label: "When", value: opts.when },
      { label: "Where", value: opts.location },
      { label: "Device", value: opts.device },
    ],
    cta: { label: "Review your account", href: "/profile" },
  });
}

interface StreamFacts {
  /** Human counterparty, e.g. "@satoshi" or "0x1234...abcd". */
  counterparty: string;
  /** Formatted deposit, e.g. "$1,200.00". */
  amount: string;
  /** Formatted pay rate, e.g. "$40.00 / day". */
  rate: string;
  /** Optional invoice/reference text. */
  reference?: string | null;
  /** Optional "starts <date>" for scheduled streams. */
  starts?: string | null;
}

function streamRows(f: StreamFacts): Row[] {
  const rows: Row[] = [
    { label: "Amount", value: f.amount },
    { label: "Rate", value: f.rate },
  ];
  if (f.starts) rows.push({ label: "Starts", value: f.starts });
  if (f.reference) rows.push({ label: "Reference", value: f.reference });
  return rows;
}

/** To the payer: confirmation they opened a stream. */
export function streamStartedPayerEmail(
  f: StreamFacts,
  name?: string | null
): EmailContent {
  return render({
    subject: `Your stream to ${f.counterparty} is live`,
    preheader: `${f.amount} now streaming at ${f.rate}.`,
    heading: "Your stream is live",
    paragraphs: [
      greeting(name),
      `You opened a stream to ${f.counterparty}. It is running now, and the balance moves to them every second until the deposit runs out or you cancel.`,
      "You can top it up, watch its runway, or cancel anytime from your dashboard.",
    ],
    rows: [{ label: "To", value: f.counterparty }, ...streamRows(f)],
    cta: { label: "View your streams", href: "/payer" },
  });
}

/** To the payee: someone started paying them. */
export function streamStartedPayeeEmail(
  f: StreamFacts,
  name?: string | null
): EmailContent {
  return render({
    subject: `${f.counterparty} started a stream to you`,
    preheader: `You are earning ${f.rate}, starting now.`,
    heading: "Money is on its way",
    paragraphs: [
      greeting(name),
      `${f.counterparty} just opened a payment stream to you. You are earning in real time, and you can withdraw whatever has landed whenever you want.`,
      "Open your dashboard to watch it add up and cash out.",
    ],
    rows: [{ label: "From", value: f.counterparty }, ...streamRows(f)],
    cta: { label: "See what you have earned", href: "/payee" },
  });
}

/** To the payer: someone requested a stream from them. */
export function requestReceivedEmail(
  f: StreamFacts,
  name?: string | null
): EmailContent {
  return render({
    subject: `${f.counterparty} requested a stream`,
    preheader: `They asked for ${f.amount} at ${f.rate}.`,
    heading: "You have a stream request",
    paragraphs: [
      greeting(name),
      `${f.counterparty} is asking you to open a payment stream. You can accept it as is, counter with different terms, or ignore it.`,
      "Nothing moves until you accept, so take your time.",
    ],
    rows: [{ label: "From", value: f.counterparty }, ...streamRows(f)],
    cta: { label: "Review the request", href: "/payer" },
  });
}

/** To the requester (payee): the payer countered their request. */
export function counterOfferEmail(
  f: StreamFacts,
  name?: string | null
): EmailContent {
  return render({
    subject: `${f.counterparty} countered your request`,
    preheader: `New terms: ${f.amount} at ${f.rate}.`,
    heading: "A counter offer",
    paragraphs: [
      greeting(name),
      `${f.counterparty} responded to your stream request with different terms. Here is what they are proposing.`,
      "Open Cadence to accept the new terms or counter again.",
    ],
    rows: [{ label: "From", value: f.counterparty }, ...streamRows(f)],
    cta: { label: "See the offer", href: "/payee" },
  });
}

/** Receipt generation. Sent when a user exports a stream receipt. */
export function receiptEmail(
  opts: {
    counterparty: string;
    amount: string;
    reference?: string | null;
    when: string;
  },
  name?: string | null
): EmailContent {
  const rows: Row[] = [
    { label: "Counterparty", value: opts.counterparty },
    { label: "Amount", value: opts.amount },
    { label: "Generated", value: opts.when },
  ];
  if (opts.reference) rows.push({ label: "Reference", value: opts.reference });
  return render({
    subject: "Your Cadence receipt",
    preheader: `Receipt for your stream with ${opts.counterparty}.`,
    heading: "Here is your receipt",
    paragraphs: [
      greeting(name),
      `You just generated a receipt for your stream with ${opts.counterparty}. The details are below for your records.`,
      "The full breakdown, including the running total, is in the file you downloaded.",
    ],
    rows,
    cta: { label: "Open your dashboard", href: "/payee" },
  });
}


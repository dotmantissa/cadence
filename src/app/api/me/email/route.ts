import { NextResponse } from "next/server";
import { requireUser, badRequest } from "../../_auth";
import { setNotificationEmail, clearNotificationEmail } from "@/db/queries";
import { sendEmail, emailConnectedEmail } from "@/lib/email";

// Auth relies on runtime headers, so this is always dynamic.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Bind a notification-only email to the current account. This never becomes a
 * login: no wallet is minted for it, and a later attempt to sign in with it is
 * refused upstream. Rejects an address already tied to another account.
 */
export async function POST(req: Request) {
  const gate = await requireUser(req);
  if ("response" in gate) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("invalid json");
  }
  const raw = (body as { email?: unknown })?.email;
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return badRequest("enter a valid email address");
  }

  const result = await setNotificationEmail(gate.user.id, gate.user.privyId, email);
  if ("conflict" in result) {
    return NextResponse.json(
      {
        error: "That email is already linked to another account.",
        code: "email_taken",
      },
      { status: 409 }
    );
  }

  // Confirmation note. Fire-and-forget: never block the bind on delivery.
  void sendEmail(
    email,
    emailConnectedEmail(result.user.displayName ?? result.user.username)
  );

  return NextResponse.json({ user: result.user });
}

/** Remove the notification email from the current account. */
export async function DELETE(req: Request) {
  const gate = await requireUser(req);
  if ("response" in gate) return gate.response;
  const user = await clearNotificationEmail(gate.user.id);
  return NextResponse.json({ user });
}

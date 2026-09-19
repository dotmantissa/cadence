import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { requireAdmin } from "../../_admin";
import {
  addAdminAuditLog,
  getProjectSettings,
  listAdminAuditLogs,
  setProjectFeeRecipient,
} from "@/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await requireAdmin(req);
  if ("response" in gate) return gate.response;
  const [settings, audit] = await Promise.all([getProjectSettings(), listAdminAuditLogs()]);
  return NextResponse.json({
    settings: { feeRecipient: settings?.feeRecipient ?? null, onchainRoutingActive: false },
    audit,
  });
}

export async function PATCH(req: Request) {
  const gate = await requireAdmin(req);
  if ("response" in gate) return gate.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const value = (body as { feeRecipient?: unknown })?.feeRecipient;
  const feeRecipient = value == null || value === "" ? null : String(value).trim();
  if (feeRecipient !== null && !isAddress(feeRecipient)) {
    return NextResponse.json({ error: "feeRecipient must be a valid EVM address" }, { status: 400 });
  }
  const previous = await getProjectSettings();
  const settings = await setProjectFeeRecipient(gate.user.id, feeRecipient?.toLowerCase() ?? null);
  await addAdminAuditLog(gate.user.id, "fee_recipient_updated", {
    previous: previous?.feeRecipient ?? null,
    next: settings.feeRecipient,
    onchainRoutingActive: false,
  });
  return NextResponse.json({
    settings: { feeRecipient: settings.feeRecipient, onchainRoutingActive: false },
  });
}

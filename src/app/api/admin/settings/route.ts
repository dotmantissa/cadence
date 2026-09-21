import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { requireAdmin } from "../../_admin";
import { getProtocolFeeConfig, type ProtocolFeeConfig } from "@/lib/admin-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await requireAdmin(req);
  if ("response" in gate) return gate.response;
  let onchain: ProtocolFeeConfig;
  try {
    onchain = await getProtocolFeeConfig();
  } catch (error) {
    console.error(
      "[admin/settings] on-chain config unavailable",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: "protocol controls unavailable" },
      { status: 503 }
    );
  }
  let audit: {
    id: string;
    action: string;
    metadata: Record<string, unknown>;
    createdAt: Date;
  }[] = [];

  // Protocol controls are on-chain and should remain readable even when the
  // optional analytics database is unavailable in a deployment.
  if (process.env.DATABASE_URL) {
    try {
      const { listAdminAuditLogs } = await import("@/db/queries");
      audit = await listAdminAuditLogs();
    } catch (error) {
      console.error(
        "[admin/settings] audit unavailable",
        error instanceof Error ? error.message : error
      );
    }
  }

  return NextResponse.json({
    settings: {
      feeRecipient: onchain.feeRecipient ?? null,
      feeBps: onchain.feeBps,
      owner: onchain.owner,
      onchainRoutingActive: onchain.feeBps > 0,
    },
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

  // The client signs the actual PayrollManager transaction. This endpoint is
  // only a best-effort audit sink and must never become a second fee source of
  // truth or a server-side secret-bearing transaction path.
  if (process.env.DATABASE_URL) {
    try {
      const { addAdminAuditLog, getProjectSettings, setProjectFeeRecipient } =
        await import("@/db/queries");
      const { upsertUser } = await import("@/db/queries");
      const user = await upsertUser(gate.caller);
      const previous = await getProjectSettings();
      const settings = await setProjectFeeRecipient(
        user.id,
        feeRecipient?.toLowerCase() ?? null
      );
      await addAdminAuditLog(user.id, "fee_recipient_updated", {
        previous: previous?.feeRecipient ?? null,
        next: settings.feeRecipient,
        onchainRoutingActive: false,
      });
    } catch (error) {
      console.error(
        "[admin/settings] audit write unavailable",
        error instanceof Error ? error.message : error
      );
    }
  }

  let onchain: ProtocolFeeConfig;
  try {
    onchain = await getProtocolFeeConfig();
  } catch (error) {
    console.error(
      "[admin/settings] on-chain config unavailable after update",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: "protocol controls unavailable" },
      { status: 503 }
    );
  }
  return NextResponse.json({
    settings: {
      feeRecipient: onchain.feeRecipient,
      feeBps: onchain.feeBps,
      owner: onchain.owner,
      onchainRoutingActive: onchain.feeBps > 0,
    },
  });
}

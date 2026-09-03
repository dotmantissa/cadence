import { NextResponse } from "next/server";
import { requireUser } from "../../_auth";
import { isArcRelayerConfigured } from "@/lib/arc-server";
import { getGenLayerReadiness } from "@/lib/genlayer-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await requireUser(req);
  if ("response" in gate) return gate.response;
  const genlayer = await getGenLayerReadiness();
  const arcRelayerConfigured = isArcRelayerConfigured();
  return NextResponse.json({
    ...genlayer,
    arcRelayerConfigured,
    configured: genlayer.configured && arcRelayerConfigured,
    error:
      genlayer.error ??
      (arcRelayerConfigured ? null : "Arc adjudicator relayer is not configured"),
  });
}

import { NextResponse } from "next/server";
import { requireAdmin } from "../../_admin";
import { getAdminAnalytics } from "@/lib/admin-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await requireAdmin(req);
  if ("response" in gate) return gate.response;
  try {
    return NextResponse.json({ analytics: await getAdminAnalytics() });
  } catch (error) {
    console.error("[admin/analytics] failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "analytics unavailable" }, { status: 503 });
  }
}

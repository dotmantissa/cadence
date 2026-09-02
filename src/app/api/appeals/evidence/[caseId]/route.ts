import { NextResponse } from "next/server";
import { getCancellationAppeal } from "@/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public by design: GenLayer validators must be able to fetch the commitment. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ caseId: string }> }
) {
  const { caseId } = await params;
  const normalized = caseId.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const row = await getCancellationAppeal(`0x${normalized}`);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(row.evidencePackage, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60, must-revalidate",
    },
  });
}

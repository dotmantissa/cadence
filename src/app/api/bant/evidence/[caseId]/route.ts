import { NextResponse } from "next/server";
import { getBantRoom } from "@/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The frozen Bant transcript consumed by GenLayer validators. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ caseId: string }> }
) {
  const { caseId } = await params;
  const normalized = caseId.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const room = await getBantRoom(`0x${normalized}`);
  if (!room || room.status !== "closed" || !room.snapshot) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return new NextResponse(room.snapshot, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60, must-revalidate",
    },
  });
}

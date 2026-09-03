import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser, badRequest } from "../../_auth";
import {
  claimCancellationAppeal,
  getCancellationAppeal,
  updateCancellationAppeal,
  ensureBantRoom,
  getBantMessages,
  closeBantRoom,
  getBantRoom,
} from "@/db/queries";
import { readArcStreamAppeal, relayArcVerdict } from "@/lib/arc-server";
import {
  adjudicateGenLayerAppeal,
  fileGenLayerAppeal,
  getGenLayerTxState,
  isGenLayerConfigured,
  readGenLayerCase,
} from "@/lib/genlayer-server";
import { hasVerifiedWallet } from "@/lib/auth-wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publicAppeal(row: Awaited<ReturnType<typeof getCancellationAppeal>>) {
  if (!row) return null;
  return {
    caseId: row.caseId,
    streamId: row.streamId,
    status: row.status,
    fileTxHash: row.fileTxHash,
    adjudicationTxHash: row.adjudicationTxHash,
    relayTxHash: row.relayTxHash,
    bantUri: row.bantUri,
    bantHash: row.bantHash,
    verdict: row.verdict,
    lastError: row.lastError,
    updatedAt: row.updatedAt,
  };
}

async function authorizedCase(req: Request, caseId: string) {
  const gate = await requireUser(req);
  if ("response" in gate) return { response: gate.response } as const;
  const row = await getCancellationAppeal(caseId);
  if (!row) return { response: NextResponse.json({ error: "not found" }, { status: 404 }) } as const;
  if (
    row.ownerId !== gate.user.id &&
    ![row.payerAddress, row.payeeAddress].some((address) =>
      hasVerifiedWallet(gate.caller.walletAddresses, address)
    )
  ) {
    return { response: NextResponse.json({ error: "forbidden" }, { status: 403 }) } as const;
  }
  return { user: gate.user, row } as const;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ caseId: string }> }
) {
  const { caseId } = await params;
  const result = await authorizedCase(req, caseId.toLowerCase());
  if ("response" in result) return result.response;
  return NextResponse.json({ appeal: publicAppeal(result.row) });
}

/**
 * Advance one appeal workflow. This endpoint is intentionally idempotent:
 * clients may poll it from either dashboard, and the DB transition claim
 * ensures only one request submits each GenLayer/Arc transaction.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ caseId: string }> }
) {
  const { caseId } = await params;
  const result = await authorizedCase(req, caseId.toLowerCase());
  if ("response" in result) return result.response;
  if (!isGenLayerConfigured()) {
    return NextResponse.json(
      { error: "GenLayer adjudicator is not configured" },
      { status: 503 }
    );
  }

  const row = result.row;
  try {
    if ((row.status === "prepared" || row.status === "bant") && !row.fileTxHash) {
      const arc = await readArcStreamAppeal(BigInt(row.streamId));
      if (arc.cancellation.status !== 2) {
        return badRequest("wait for the Arc appeal transaction to confirm");
      }
      if (arc.cancellation.evidenceHash.toLowerCase() !== row.evidenceHash.toLowerCase()) {
        return badRequest("Arc evidence commitment does not match the prepared appeal");
      }
      const room = await ensureBantRoom({
        caseId: row.caseId,
        streamId: row.streamId,
        payerAddress: row.payerAddress,
        payeeAddress: row.payeeAddress,
        opensAt: new Date(Number(arc.bantDeadline - 86400n) * 1000),
        closesAt: new Date(Number(arc.bantDeadline) * 1000),
      });
      if (!room) return badRequest("could not open Bant room");
      if (BigInt(Math.floor(Date.now() / 1000)) < arc.bantDeadline) {
        await claimCancellationAppeal(row.caseId, ["prepared"], "bant");
        return NextResponse.json({ appeal: publicAppeal(await getCancellationAppeal(row.caseId)) });
      }

      const messages = await getBantMessages(room.id);
      const snapshot = JSON.stringify(
        {
          case_id: row.caseId,
          stream_id: row.streamId,
          payer: row.payerAddress,
          payee: row.payeeAddress,
          deliverables: arc.deliverables,
          messages: messages.map((message) => ({
            author: message.authorAddress,
            body: message.body,
            evidence: message.evidenceUrl
              ? {
                  type: message.evidenceType ?? "other",
                  url: message.evidenceUrl,
                  sha256: message.evidenceHash,
                  description: message.evidenceDescription ?? "",
                }
              : null,
            created_at: message.createdAt.toISOString(),
          })),
        },
        null,
        2
      );
      const bantHash = `0x${createHash("sha256").update(snapshot, "utf8").digest("hex")}`;
      const closedRoom = await closeBantRoom(row.caseId, snapshot, bantHash);
      if (!closedRoom?.snapshotHash) return badRequest("could not close Bant room");
      const bantUri = row.bantUri ?? new URL(
        `/api/bant/evidence/${row.caseId.slice(2)}`,
        new URL(req.url).origin
      ).toString();
      await updateCancellationAppeal(row.caseId, { bantUri, bantHash });
      const claimed = await claimCancellationAppeal(row.caseId, ["prepared", "bant"], "filing");
      if (!claimed) return NextResponse.json({ appeal: publicAppeal(await getCancellationAppeal(row.caseId)) });
      try {
        const txHash = await fileGenLayerAppeal(arc, bantUri, bantHash as `0x${string}`);
        await updateCancellationAppeal(row.caseId, {
          status: "filed",
          fileTxHash: txHash,
        });
      } catch (error) {
        await updateCancellationAppeal(row.caseId, {
          status: "prepared",
          lastError: error instanceof Error ? error.message : "could not file GenLayer appeal",
        });
      }
    } else if (row.status === "filed" && row.fileTxHash) {
      const state = await getGenLayerTxState(row.fileTxHash);
      if (state.state === "failed") {
        await updateCancellationAppeal(row.caseId, { status: "failed", lastError: state.error });
      } else if (state.state === "finalized") {
        const claimed = await claimCancellationAppeal(row.caseId, ["filed"], "adjudicating");
        if (claimed) {
          try {
            const txHash = await adjudicateGenLayerAppeal(row.caseId);
            await updateCancellationAppeal(row.caseId, {
              status: "adjudicating",
              adjudicationTxHash: txHash,
            });
          } catch (error) {
            await updateCancellationAppeal(row.caseId, {
              status: "filed",
              lastError: error instanceof Error ? error.message : "could not start adjudication",
            });
          }
        }
      }
    } else if (row.status === "adjudicating" && row.adjudicationTxHash) {
      const state = await getGenLayerTxState(row.adjudicationTxHash);
      if (state.state === "failed") {
        await updateCancellationAppeal(row.caseId, { status: "failed", lastError: state.error });
      } else if (state.state === "finalized") {
        const verdict = await readGenLayerCase(row.caseId);
        if (verdict.ready !== true || typeof verdict.verdict_hash !== "string") {
          return NextResponse.json({ appeal: publicAppeal(await getCancellationAppeal(row.caseId)) });
        }
        const claimed = await claimCancellationAppeal(row.caseId, ["adjudicating"], "relaying");
        if (claimed) {
          try {
            const verdictHash = (verdict.verdict_hash.startsWith("0x")
              ? verdict.verdict_hash
              : `0x${verdict.verdict_hash}`) as `0x${string}`;
            const relayTxHash = await relayArcVerdict(
              BigInt(row.streamId),
              verdict.appeal_upheld === true,
              verdictHash
            );
            await updateCancellationAppeal(row.caseId, {
              status: "complete",
              relayTxHash,
              verdict,
            });
          } catch (error) {
            await updateCancellationAppeal(row.caseId, {
              status: "adjudicating",
              lastError: error instanceof Error ? error.message : "could not relay verdict",
            });
          }
        }
      }
    }
  } catch (error) {
    await updateCancellationAppeal(row.caseId, {
      lastError: error instanceof Error ? error.message : "appeal workflow failed",
    });
  }

  return NextResponse.json({
    appeal: publicAppeal(await getCancellationAppeal(row.caseId)),
  });
}

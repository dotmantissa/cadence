"use client";

import { useMemo } from "react";
import { Modal } from "./Modal";
import type { StreamMeta } from "@/hooks/usePayroll";
import { streamMath } from "@/lib/stream-math";
import { formatUsdc, shortenAddress } from "@/lib/utils";
import { Download, Loader2 } from "lucide-react";
import { useState } from "react";

interface Props {
  account: `0x${string}`;
  perspective: "employer" | "employee";
  streams: StreamMeta[];
  identities: Record<string, { username: string | null; displayName: string | null }>;
  onClose: () => void;
}

function fmtDate(unixSeconds: bigint): string {
  if (!unixSeconds) return "—";
  return new Date(Number(unixSeconds) * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function streamedToDate(s: StreamMeta): bigint {
  return streamMath(s).streamedSoFar;
}

function counterpartyLabel(
  s: StreamMeta,
  perspective: "employer" | "employee",
  identities: Props["identities"]
): string {
  const addr = (perspective === "employer" ? s.employee : s.employer).toLowerCase();
  const id = identities[addr];
  const handle = id?.username ? `@${id.username}` : id?.displayName ?? "";
  const short = shortenAddress(addr);
  return handle ? `${handle} · ${short}` : short;
}

/**
 * In-app statement preview: renders the account statement content directly in
 * the browser as styled HTML rather than generating a PDF. Offers a "Download
 * PDF" button for when the user wants the file.
 */
export function StatementPreviewModal({
  account,
  perspective,
  streams,
  identities,
  onClose,
}: Props) {
  const [downloading, setDownloading] = useState(false);

  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const isScheduled = (s: StreamMeta) => s.active && s.startTime > nowSec;

  const { scheduled, active, totalDeposited, totalStreamed, firstOpened, lastOpened } =
    useMemo(() => {
      const sched = streams.filter(isScheduled).length;
      const act = streams.filter((s) => s.active && !isScheduled(s)).length;
      const deposited = streams.reduce((a, s) => a + s.totalDeposited, 0n);
      const streamed = streams.reduce((a, s) => a + streamedToDate(s), 0n);
      const opened = streams.map((s) => s.startTime).filter((t) => t > 0n);
      const first = opened.length ? opened.reduce((a, b) => (a < b ? a : b)) : 0n;
      const last = opened.length ? opened.reduce((a, b) => (a > b ? a : b)) : 0n;
      return {
        scheduled: sched,
        active: act,
        totalDeposited: deposited,
        totalStreamed: streamed,
        firstOpened: first,
        lastOpened: last,
      };
    }, [streams]);

  const roleLabel = perspective === "employer" ? "Payer (outgoing)" : "Payee (incoming)";
  const flowLabel = perspective === "employer" ? "Total paid out" : "Total received";

  function statusLabel(s: StreamMeta): string {
    switch (streamMath(s).phase) {
      case "scheduled":
        return "Scheduled";
      case "live":
        return "Ongoing";
      case "awaiting_claim":
        return "Awaiting claim";
      case "claimed":
        return "Claimed";
      default:
        return "Complete";
    }
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const { generateStatementPdf } = await import("@/lib/statement");
      generateStatementPdf({ account, perspective, streams, identities });
    } catch {
      /* generation failed silently */
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Modal title="Account statement" onClose={onClose} wide>
      <div className="space-y-6">
        {/* Header summary */}
        <div className="space-y-4 rounded-2xl border border-ink/10 bg-paper-warm p-6">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink/50">Account</p>
              <p className="font-mono text-ink">{shortenAddress(account)}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink/50">Role</p>
              <p className="text-ink">{roleLabel}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink/50">Streams</p>
              <p className="text-ink">
                {streams.length} total · {active} ongoing
                {scheduled > 0 && ` · ${scheduled} scheduled`}
              </p>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink/50">Period</p>
              <p className="text-ink">
                {firstOpened > 0n ? `${fmtDate(firstOpened)} – ${fmtDate(lastOpened)}` : "—"}
              </p>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink/50">
                Total deposited
              </p>
              <p className="font-mono text-ink">${formatUsdc(totalDeposited)}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink/50">{flowLabel}</p>
              <p className="font-mono text-ink">${formatUsdc(totalStreamed)}</p>
            </div>
          </div>
        </div>

        {/* Streams table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-ink text-xs font-medium uppercase tracking-wide text-paper">
                <th className="px-3 py-2.5 text-left">ID</th>
                <th className="px-3 py-2.5 text-left">Opened</th>
                <th className="px-3 py-2.5 text-left">
                  {perspective === "employer" ? "Paid to" : "Paid by"}
                </th>
                <th className="px-3 py-2.5 text-left">Remark</th>
                <th className="px-3 py-2.5 text-right">Deposited</th>
                <th className="px-3 py-2.5 text-right">Streamed</th>
                <th className="px-3 py-2.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {streams.map((s, i) => (
                <tr
                  key={s.id.toString()}
                  className={i % 2 === 0 ? "bg-paper" : "bg-paper-warm"}
                >
                  <td className="px-3 py-2.5 font-mono text-xs text-ink/70">
                    #{s.id.toString()}
                  </td>
                  <td className="px-3 py-2.5 text-ink/70">{fmtDate(s.startTime)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-ink/70">
                    {counterpartyLabel(s, perspective, identities)}
                  </td>
                  <td className="px-3 py-2.5 text-ink/70">{s.invoiceRef || "—"}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-ink">
                    ${formatUsdc(s.totalDeposited)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-ink">
                    ${formatUsdc(streamedToDate(s))}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span
                      className={
                        statusLabel(s) === "Complete"
                          ? "text-ink/50"
                          : "font-medium text-volt"
                      }
                    >
                      {statusLabel(s)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer note + actions */}
        <div className="flex items-center justify-between text-xs text-ink/50">
          <p>Figures derive from the Arc payroll contract. Amounts in USDC.</p>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-2 rounded-full bg-volt px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-volt-bright disabled:opacity-40"
          >
            {downloading ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Download size={15} />
            )}
            Download PDF
          </button>
        </div>
      </div>
    </Modal>
  );
}

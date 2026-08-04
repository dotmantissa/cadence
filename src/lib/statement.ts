import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { StreamMeta } from "@/hooks/usePayroll";
import { formatUsdc, shortenAddress } from "@/lib/utils";

/** Brand palette, as PDF-friendly RGB tuples. */
const INK: [number, number, number] = [23, 22, 24]; // #171618
const VOLT: [number, number, number] = [43, 68, 231]; // #2b44e7
const PAPER: [number, number, number] = [247, 246, 242]; // #f7f6f2
const MUTE: [number, number, number] = [120, 118, 122];

export interface StatementOptions {
  /** The account holder's wallet address. */
  account: `0x${string}`;
  /** "employer" pays out; "employee" receives. Frames the columns + summary. */
  perspective: "employer" | "employee";
  /** Newest-first streams for this account. */
  streams: StreamMeta[];
  /** Resolved handles/names, keyed by lowercased counterparty address. */
  identities?: Record<string, { username: string | null; displayName: string | null }>;
}

/** USDC (6dp) withdrawn to date, derived from the on-chain claim clock. */
function withdrawnToDate(s: StreamMeta): bigint {
  if (s.lastClaimTime <= s.startTime) return 0n;
  return s.ratePerSecond * (s.lastClaimTime - s.startTime);
}

function fmtDate(unixSeconds: bigint): string {
  if (!unixSeconds) return "—";
  return new Date(Number(unixSeconds) * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function counterpartyLabel(
  s: StreamMeta,
  perspective: "employer" | "employee",
  identities?: StatementOptions["identities"]
): string {
  const addr = (perspective === "employer" ? s.employee : s.employer).toLowerCase();
  const id = identities?.[addr];
  const handle = id?.username ? `@${id.username}` : id?.displayName ?? "";
  const short = shortenAddress(addr);
  return handle ? `${handle}\n${short}` : short;
}

/**
 * Draw the Cadence brand mark (rounded ink tile + volt waveform) at (x, y).
 * Vector, so it stays crisp at any zoom.
 */
function drawMark(doc: jsPDF, x: number, y: number, size: number) {
  doc.setFillColor(...INK);
  doc.roundedRect(x, y, size, size, size * 0.25, size * 0.25, "F");
  // Waveform path scaled from the 64x64 source viewBox into the tile.
  const s = size / 64;
  const pts: [number, number][] = [
    [13, 39],
    [19, 39],
    [25, 25],
    [31, 25],
    [37, 39],
    [43, 39],
    [51, 25],
  ];
  doc.setDrawColor(...VOLT);
  doc.setLineWidth(size * 0.07);
  doc.setLineCap("round");
  doc.setLineJoin("round");
  for (let i = 0; i < pts.length - 1; i++) {
    doc.line(x + pts[i][0] * s, y + pts[i][1] * s, x + pts[i + 1][0] * s, y + pts[i + 1][1] * s);
  }
}

/**
 * Build an on-brand account statement PDF summarising every stream on this
 * account, and trigger a download. All figures are USDC and derive from the
 * on-chain stream structs (no fragile log queries): deposited, streamed-so-far
 * (via withdrawn-to-date on the claim clock), and status.
 */
export function generateStatementPdf(opts: StatementOptions): void {
  const { account, perspective, streams, identities } = opts;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;

  // Faint page-wide watermark, drawn first so everything sits over it.
  doc.setTextColor(235, 234, 230);
  doc.setFontSize(64);
  doc.setFont("helvetica", "bold");
  doc.text("CADENCE", pageW / 2, 420, { align: "center", angle: 32 });

  // ---- Header band ----
  drawMark(doc, margin, 36, 30);
  doc.setTextColor(...INK);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Cadence", margin + 40, 50);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTE);
  doc.text("Account statement", margin + 40, 63);

  // Generated-at, right aligned.
  const generated = new Date().toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  doc.setFontSize(9);
  doc.setTextColor(...MUTE);
  doc.text(`Generated ${generated}`, pageW - margin, 50, { align: "right" });

  // ---- Account + period summary ----
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const isScheduled = (s: (typeof streams)[number]) => s.active && s.startTime > nowSec;
  const scheduled = streams.filter(isScheduled).length;
  const active = streams.filter((s) => s.active && !isScheduled(s)).length;
  const totalDeposited = streams.reduce((a, s) => a + s.deposit, 0n);
  const totalStreamed = streams.reduce((a, s) => a + withdrawnToDate(s), 0n);
  const opened = streams.map((s) => s.startTime).filter((t) => t > 0n);
  const firstOpened = opened.length ? opened.reduce((a, b) => (a < b ? a : b)) : 0n;
  const lastOpened = opened.length ? opened.reduce((a, b) => (a > b ? a : b)) : 0n;

  const roleLabel = perspective === "employer" ? "Payer (outgoing)" : "Payee (incoming)";
  const flowLabel = perspective === "employer" ? "Total paid out" : "Total received";

  let y = 92;
  doc.setDrawColor(225, 224, 220);
  doc.setLineWidth(1);
  doc.line(margin, y, pageW - margin, y);
  y += 18;

  doc.setFontSize(9);
  const col2 = margin + (pageW - 2 * margin) / 2;
  const put = (label: string, value: string, x: number, yy: number) => {
    doc.setTextColor(...MUTE);
    doc.setFont("helvetica", "normal");
    doc.text(label.toUpperCase(), x, yy);
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.text(value, x, yy + 13);
  };

  put("Account", shortenAddress(account), margin, y);
  put("Role", roleLabel, col2, y);
  y += 34;
  put(
    "Streams",
    `${streams.length} total · ${active} ongoing${scheduled > 0 ? ` · ${scheduled} scheduled` : ""}`,
    margin,
    y
  );
  put(
    "Period",
    opened.length ? `${fmtDate(firstOpened)} – ${fmtDate(lastOpened)}` : "—",
    col2,
    y
  );
  y += 34;
  put("Total deposited", `$${formatUsdc(totalDeposited)}`, margin, y);
  put(flowLabel, `$${formatUsdc(totalStreamed)}`, col2, y);
  y += 26;

  doc.line(margin, y, pageW - margin, y);
  y += 10;

  // ---- Transactions table ----
  const cpHeader = perspective === "employer" ? "Paid to" : "Paid by";
  const body = streams.map((s) => [
    `#${s.id.toString()}`,
    fmtDate(s.startTime),
    counterpartyLabel(s, perspective, identities),
    s.invoiceRef || "—",
    `$${formatUsdc(s.deposit)}`,
    `$${formatUsdc(withdrawnToDate(s))}`,
    isScheduled(s) ? "Scheduled" : s.active ? "Ongoing" : "Ended",
  ]);

  autoTable(doc, {
    startY: y + 4,
    head: [["ID", "Opened", cpHeader, "Remark", "Deposited", "Streamed", "Status"]],
    body,
    theme: "striped",
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: 6,
      textColor: INK,
      lineColor: [230, 229, 225],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: INK,
      textColor: PAPER,
      fontStyle: "bold",
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: [246, 245, 241] },
    columnStyles: {
      0: { cellWidth: 34, font: "courier" },
      2: { font: "courier", fontSize: 7.5 },
      4: { halign: "right", font: "courier" },
      5: { halign: "right", font: "courier" },
      6: { halign: "center" },
    },
    // Color the status cell without a plugin: volt for live/scheduled, muted for ended.
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 6) {
        const ended = data.cell.raw === "Ended";
        data.cell.styles.textColor = ended ? MUTE : VOLT;
        data.cell.styles.fontStyle = "bold";
      }
    },
    margin: { left: margin, right: margin },
  });

  // ---- Footer: totals note + page numbers ----
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const h = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(...MUTE);
    doc.setFont("helvetica", "normal");
    doc.text(
      "Figures derive from the Arc payroll contract. Amounts in USDC. Not a tax document.",
      margin,
      h - 24
    );
    doc.text(`Page ${p} of ${pageCount}`, pageW - margin, h - 24, { align: "right" });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`cadence-statement-${shortenAddress(account)}-${stamp}.pdf`);
}

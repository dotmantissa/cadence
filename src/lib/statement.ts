import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { StreamMeta } from "@/hooks/usePayroll";
import { streamMath } from "@/lib/stream-math";
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

/** USDC (6dp) total streamed to date — cumulative, never resets on withdrawal. */
function streamedToDate(s: StreamMeta): bigint {
  return streamMath(s).streamedSoFar;
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
function drawMark(doc: jsPDF, x: number, y: number, size: number, ghost = false) {
  if (!ghost) {
    doc.setFillColor(...INK);
    doc.roundedRect(x, y, size, size, size * 0.25, size * 0.25, "F");
  }
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
 * Anti-tamper backdrop mirroring the on-screen receipt: a faint tiled diagonal
 * "CADENCE · CADENCE" wordmark, a repeating waveform guilloche, and an oversized
 * ghost brand mark bleeding off the top-right corner. Drawn first so all content
 * sits above it, exactly like the receipt's <AntiTamperBackdrop>.
 */
function drawBackdrop(doc: jsPDF, pageW: number, pageH: number) {
  // 1) Waveform guilloche — repeating brand wave, tiled across the page on a
  //    slight rotation. Faint volt lines echo the receipt's <pattern id="wave">.
  doc.saveGraphicsState();
  // @ts-expect-error jsPDF GState alpha is untyped but supported at runtime.
  doc.setGState(new doc.GState({ opacity: 0.025 }));
  doc.setDrawColor(...VOLT);
  doc.setLineWidth(0.6);
  doc.setLineCap("round");
  doc.setLineJoin("round");
  const tileW = 120;
  const wave: [number, number][] = [
    [0, 20],
    [15, 20],
    [30, 6],
    [45, 6],
    [60, 20],
    [75, 20],
    [90, 6],
    [105, 6],
    [120, 20],
  ];
  const rad = (-8 * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  for (let row = -60; row < pageH + 60; row += 26) {
    for (let col = -tileW; col < pageW + tileW; col += tileW) {
      for (let i = 0; i < wave.length - 1; i++) {
        const rot = (px: number, py: number): [number, number] => {
          const x = col + px;
          const y = row + py;
          return [x * cos - y * sin, x * sin + y * cos];
        };
        const [x1, y1] = rot(wave[i][0], wave[i][1]);
        const [x2, y2] = rot(wave[i + 1][0], wave[i + 1][1]);
        doc.line(x1, y1, x2, y2);
      }
    }
  }
  doc.restoreGraphicsState();

  // 2) Diagonal tiled wordmark — very low opacity ink "CADENCE · CADENCE",
  //    matching the receipt's <pattern id="mark">.
  doc.saveGraphicsState();
  // @ts-expect-error jsPDF GState alpha is untyped but supported at runtime.
  doc.setGState(new doc.GState({ opacity: 0.018 }));
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  for (let row = 40; row < pageH + 120; row += 115) {
    for (let col = -120; col < pageW + 120; col += 300) {
      doc.text("CADENCE · CADENCE", col, row, { angle: 24, charSpace: 3 });
    }
  }
  doc.restoreGraphicsState();

  // 3) Oversized ghost mark bleeding off the top-right corner, like the receipt.
  doc.saveGraphicsState();
  // @ts-expect-error jsPDF GState alpha is untyped but supported at runtime.
  doc.setGState(new doc.GState({ opacity: 0.03 }));
  drawMark(doc, pageW - 96, -40, 150, true);
  doc.restoreGraphicsState();
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
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;

  // Brand security backdrop, matching the on-screen receipt graphics.
  drawBackdrop(doc, pageW, pageH);

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
  const totalDeposited = streams.reduce((a, s) => a + s.totalDeposited, 0n);
  const totalStreamed = streams.reduce((a, s) => a + streamedToDate(s), 0n);
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
  const statusLabel = (s: StreamMeta): string => {
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
  };
  const body = streams.map((s) => [
    `#${s.id.toString()}`,
    fmtDate(s.startTime),
    counterpartyLabel(s, perspective, identities),
    s.invoiceRef || "—",
    `$${formatUsdc(s.totalDeposited)}`,
    `$${formatUsdc(streamedToDate(s))}`,
    statusLabel(s),
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
        const muted = data.cell.raw === "Complete";
        data.cell.styles.textColor = muted ? MUTE : VOLT;
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

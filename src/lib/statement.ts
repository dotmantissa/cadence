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

/**
 * Watermark colors with the receipt's exact alpha baked straight into the RGB,
 * blended over PAPER. We do NOT use jsPDF's GState opacity: the browser build
 * silently ignores the alpha and renders the backdrop at full strength, which is
 * what made a nominal "1%" watermark collide with the statement text. Baking the
 * blend into an opaque near-paper color makes the faintness deterministic — it
 * can never render darker than intended, regardless of GState support.
 *
 * blend(channel) = PAPER + (color − PAPER) · alpha, matching the on-screen
 * <AntiTamperBackdrop>: waveform volt @0.06, wordmark ink @0.035, ghost @0.05.
 */
const WAVE_STROKE: [number, number, number] = [235, 235, 241]; // VOLT @ 0.06 over paper
const WORDMARK_FILL: [number, number, number] = [239, 238, 234]; // INK @ 0.035 over paper
const GHOST_STROKE: [number, number, number] = [237, 237, 241]; // VOLT @ 0.05 over paper

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
 * Vector, so it stays crisp at any zoom. `ghost` skips the ink tile (waveform
 * only); `strokeColor` overrides the waveform color so the backdrop's ghost mark
 * can render in a pre-blended faint tone instead of full-strength volt.
 */
function drawMark(
  doc: jsPDF,
  x: number,
  y: number,
  size: number,
  ghost = false,
  strokeColor: [number, number, number] = VOLT
) {
  if (!ghost) {
    doc.setFillColor(...INK);
    doc.roundedRect(x, y, size, size, size * 0.25, size * 0.25, "F");
  }
  // Waveform as smooth cubic béziers, scaled from the 64x64 source viewBox —
  // the exact path the brand SVG and receipt use, so the curve is rounded at
  // every crest instead of the sharp polyline the old segment loop produced.
  // SVG: M13 39 C19 39 19 25 25 25 C31 25 31 39 37 39 C43 39 43 25 51 25
  const s = size / 64;
  doc.setDrawColor(...strokeColor);
  doc.setLineWidth(size * 0.07);
  doc.setLineCap("round");
  doc.setLineJoin("round");
  // Each entry is a relative cubic: [c1x, c1y, c2x, c2y, endx, endy].
  const segs: number[][] = [
    [6, 0, 6, -14, 12, -14],
    [6, 0, 6, 14, 12, 14],
    [6, 0, 6, -14, 14, -14],
  ];
  doc.lines(segs, x + 13 * s, y + 39 * s, [s, s], "S");
}

/**
 * Anti-tamper backdrop mirroring the on-screen receipt: a faint waveform
 * guilloche, a diagonal tiled "CADENCE · CADENCE" wordmark, and an oversized
 * ghost brand mark bleeding off the top-right corner. Drawn first so all content
 * sits above it, exactly like the receipt's <AntiTamperBackdrop>.
 *
 * Faintness comes from pre-blended near-paper colors (see WAVE_STROKE etc.), NOT
 * from GState opacity — the browser jsPDF build ignores the alpha and would
 * otherwise render this at full strength, drowning the text.
 */
function drawBackdrop(doc: jsPDF, pageW: number, pageH: number) {
  // 1) Waveform guilloche — repeating brand wave, tiled across the page on a
  //    slight rotation. Echoes the receipt's <pattern id="wave">.
  doc.setDrawColor(...WAVE_STROKE);
  doc.setLineWidth(0.8);
  doc.setLineCap("round");
  doc.setLineJoin("round");
  const tileW = 120;
  // Smooth waveform, one tile, as relative cubic béziers — the same crest curve
  // as the receipt's <path d="M0 20C15 20 15 6 30 6…">. Rotated by hand to keep
  // the -8° drift while still using doc.lines() for the curve rendering.
  const rad = (-8 * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rot = (px: number, py: number): [number, number] => [
    px * cos - py * sin,
    px * sin + py * cos,
  ];
  // Relative cubic segments of the tile wave, pre-rotation (dx,dy pairs).
  const waveSegs: number[][] = [
    [15, 0, 15, -14, 30, -14],
    [15, 0, 15, 14, 30, 14],
    [15, 0, 15, -14, 30, -14],
    [15, 0, 15, 14, 30, 14],
  ];
  // Rotate each relative control vector into the drifted frame.
  const rotatedSegs = waveSegs.map((seg) => {
    const out: number[] = [];
    for (let i = 0; i < seg.length; i += 2) {
      const [rx, ry] = rot(seg[i], seg[i + 1]);
      out.push(rx, ry);
    }
    return out;
  });
  for (let row = -60; row < pageH + 60; row += 26) {
    for (let col = -tileW; col < pageW + tileW; col += tileW) {
      const [sx, sy] = rot(col + 0, row + 20);
      doc.lines(rotatedSegs, sx, sy, [1, 1], "S");
    }
  }

  // 2) Diagonal tiled wordmark — pre-blended faint ink "CADENCE · CADENCE",
  //    matching the receipt's <pattern id="mark"> (staggered on alternate rows
  //    so the tiling reads like the receipt's two-line pattern).
  doc.setTextColor(...WORDMARK_FILL);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  let markRow = 0;
  for (let row = 20; row < pageH + 150; row += 78) {
    const stagger = markRow % 2 === 0 ? 0 : -140;
    for (let col = -160; col < pageW + 160; col += 300) {
      doc.text("CADENCE · CADENCE", col + stagger, row, { angle: 22, charSpace: 4 });
    }
    markRow++;
  }

  // 3) Oversized ghost mark bleeding off the top-right corner, like the receipt.
  drawMark(doc, pageW - 96, -40, 150, true, GHOST_STROKE);
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

  // Warm paper base so the whole page matches the receipt card and the
  // pre-blended watermark colors sit on their intended background.
  doc.setFillColor(...PAPER);
  doc.rect(0, 0, pageW, pageH, "F");

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
    const m = streamMath(s);
    if (m.cancelled) return "Cancelled";
    switch (m.phase) {
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
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: 6,
      textColor: INK,
      lineColor: [226, 225, 220],
      lineWidth: 0.5,
      fillColor: false, // transparent cells let the paper + watermark show through uniformly
    },
    headStyles: {
      fillColor: INK,
      textColor: PAPER,
      fontStyle: "bold",
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 34, font: "courier" },
      2: { font: "courier", fontSize: 7.5 },
      4: { halign: "right", font: "courier" },
      5: { halign: "right", font: "courier" },
      6: { halign: "center" },
    },
    // Color the status cell: volt for active streams, muted for ended, red for cancelled.
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 6) {
        const status = data.cell.raw as string;
        if (status === "Cancelled") {
          data.cell.styles.textColor = [220, 38, 38]; // red-600
          data.cell.styles.fontStyle = "bold";
        } else if (status === "Complete") {
          data.cell.styles.textColor = MUTE;
          data.cell.styles.fontStyle = "bold";
        } else {
          data.cell.styles.textColor = VOLT;
          data.cell.styles.fontStyle = "bold";
        }
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

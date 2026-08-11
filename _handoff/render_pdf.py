#!/usr/bin/env python3
"""Render the Cadence technical Markdown into a clean, branded PDF using reportlab.

Deliberately a focused Markdown subset renderer (headings, paragraphs, fenced
code, tables, bullet/numbered lists, bold, inline code, links) — enough for our
document, no external HTML/PDF engine needed.
"""
import re
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Preformatted,
    Table, TableStyle, HRFlowable,
)

SRC = "/home/mceesquare/arc/cadence/_handoff/cadence-technical-document.md"
OUT = "/home/mceesquare/arc/cadence/_handoff/cadence-technical-document.pdf"

# ---- Brand palette (matches the app: volt indigo on paper/ink) ---------------
INK = colors.HexColor("#171618")
VOLT = colors.HexColor("#2B44E7")
VOLT_BRIGHT = colors.HexColor("#4B63FF")
PAPER_WARM = colors.HexColor("#F5F3EE")
CODE_BG = colors.HexColor("#F4F5F7")
CODE_BORDER = colors.HexColor("#E2E5EA")
MUTE = colors.HexColor("#6B6B72")
RULE = colors.HexColor("#D9D6CF")
TABLE_HEAD_BG = colors.HexColor("#EEF0FB")
TABLE_STRIPE = colors.HexColor("#FAFAF8")

styles = getSampleStyleSheet()

def mk(name, **kw):
    kw.setdefault("parent", styles["Normal"])
    return ParagraphStyle(name, **kw)

BODY = mk("Body", fontName="Helvetica", fontSize=9.6, leading=14.5, textColor=INK,
          spaceAfter=7, alignment=TA_LEFT)
H1 = mk("H1", fontName="Helvetica-Bold", fontSize=21, leading=25, textColor=INK,
        spaceBefore=6, spaceAfter=8)
H2 = mk("H2", fontName="Helvetica-Bold", fontSize=14.5, leading=18, textColor=VOLT,
        spaceBefore=16, spaceAfter=6)
H3 = mk("H3", fontName="Helvetica-Bold", fontSize=11.5, leading=15, textColor=INK,
        spaceBefore=11, spaceAfter=4)
H4 = mk("H4", fontName="Helvetica-Bold", fontSize=10, leading=13.5, textColor=MUTE,
        spaceBefore=8, spaceAfter=3)
SUBTITLE = mk("Subtitle", fontName="Helvetica-Oblique", fontSize=11.5, leading=16,
              textColor=MUTE, spaceAfter=4)
CODE = mk("Code", fontName="Courier", fontSize=8.0, leading=11.0, textColor=INK)
LI = mk("LI", parent=BODY, leftIndent=16, bulletIndent=4, spaceAfter=3.5)
LI2 = mk("LI2", parent=BODY, leftIndent=32, bulletIndent=20, spaceAfter=3)
TCELL = mk("TCell", fontName="Helvetica", fontSize=8.4, leading=11.2, textColor=INK)
THEAD = mk("THead", fontName="Helvetica-Bold", fontSize=8.4, leading=11.2, textColor=INK)
FOOT = mk("Foot", fontName="Helvetica", fontSize=7.5, leading=9, textColor=MUTE)

# ---- Inline formatting: `code`, **bold**, *italic*, [text](url) --------------
def esc(t):
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def inline(text):
    # Protect inline code spans first.
    spans = []
    def stash(m):
        spans.append(m.group(1))
        return f"\x00{len(spans)-1}\x00"
    text = re.sub(r"`([^`]+)`", stash, text)
    text = esc(text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"(?<![\*\w])\*([^*]+)\*(?!\w)", r"<i>\1</i>", text)
    text = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)",
                  r'<link href="\2" color="#2B44E7"><u>\1</u></link>', text)
    def unstash(m):
        code = esc(spans[int(m.group(1))])
        return (f'<font face="Courier" size="8.6" color="#2B44E7"'
                f' backColor="#F4F5F7"> {code} </font>')
    text = re.sub(r"\x00(\d+)\x00", unstash, text)
    return text

def table_flow(header, rows):
    data = [[Paragraph(inline(c), THEAD) for c in header]]
    for r in rows:
        data.append([Paragraph(inline(c), TCELL) for c in r])
    ncol = len(header)
    avail = 7.0 * inch
    # Give the first column a touch more room; distribute the rest evenly.
    if ncol >= 3:
        widths = [avail * 0.26] + [avail * 0.74 / (ncol - 1)] * (ncol - 1)
    else:
        widths = [avail / ncol] * ncol
    t = Table(data, colWidths=widths, repeatRows=1)
    ts = [
        ("BACKGROUND", (0, 0), (-1, 0), TABLE_HEAD_BG),
        ("LINEBELOW", (0, 0), (-1, 0), 0.75, VOLT),
        ("GRID", (0, 0), (-1, -1), 0.4, CODE_BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            ts.append(("BACKGROUND", (0, i), (-1, i), TABLE_STRIPE))
    t.setStyle(TableStyle(ts))
    return t

def code_flow(lines):
    txt = "\n".join(lines) if lines else " "
    p = Preformatted(txt, CODE)
    box = Table([[p]], colWidths=[7.0 * inch])
    box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CODE_BG),
        ("BOX", (0, 0), (-1, -1), 0.5, CODE_BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return box

# ---- Parse the markdown into flowables ---------------------------------------
def parse(md):
    lines = md.split("\n")
    flow = []
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]

        # Fenced code block
        if line.strip().startswith("```"):
            i += 1
            buf = []
            while i < n and not lines[i].strip().startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1
            flow.append(code_flow(buf))
            flow.append(Spacer(1, 6))
            continue

        # Table (a header row of pipes followed by a |---| separator)
        if (line.strip().startswith("|") and i + 1 < n
                and re.match(r"^\s*\|[\s:|-]+\|\s*$", lines[i + 1])):
            def cells(row):
                parts = row.strip().strip("|").split("|")
                return [c.strip() for c in parts]
            header = cells(line)
            i += 2
            rows = []
            while i < n and lines[i].strip().startswith("|"):
                rows.append(cells(lines[i]))
                i += 1
            flow.append(Spacer(1, 2))
            flow.append(table_flow(header, rows))
            flow.append(Spacer(1, 8))
            continue

        # Horizontal rule
        if re.match(r"^\s*---+\s*$", line):
            flow.append(Spacer(1, 3))
            flow.append(HRFlowable(width="100%", thickness=0.6, color=RULE,
                                   spaceBefore=2, spaceAfter=8))
            i += 1
            continue

        # Headings
        m = re.match(r"^(#{1,4})\s+(.*)$", line)
        if m:
            level = len(m.group(1))
            text = m.group(2).strip()
            if level == 1:
                flow.append(Paragraph(inline(text), H1))
            elif level == 2:
                flow.append(Paragraph(inline(text), H2))
            elif level == 3:
                flow.append(Paragraph(inline(text), H3))
            else:
                flow.append(Paragraph(inline(text), H4))
            i += 1
            continue

        # Nested bullet (two-space indent)
        m = re.match(r"^(\s{2,})[-*]\s+(.*)$", line)
        if m:
            flow.append(Paragraph(inline(m.group(2)), LI2, bulletText="–"))
            i += 1
            continue

        # Top-level bullet
        m = re.match(r"^[-*]\s+(.*)$", line)
        if m:
            flow.append(Paragraph(inline(m.group(1)), LI, bulletText="•"))
            i += 1
            continue

        # Numbered list
        m = re.match(r"^(\d+)\.\s+(.*)$", line)
        if m:
            flow.append(Paragraph(inline(m.group(2)), LI,
                                  bulletText=f"{m.group(1)}."))
            i += 1
            continue

        # Blank line
        if line.strip() == "":
            i += 1
            continue

        # Subtitle (bold-only line right under the H1) or normal paragraph.
        # Gather the paragraph (single line in our source, but be tolerant).
        para = line.strip()
        # Bold-wrapped standalone line near the top → subtitle styling.
        if para.startswith("**") and para.endswith("**") and len(flow) < 3:
            flow.append(Paragraph(inline(para), SUBTITLE))
        else:
            flow.append(Paragraph(inline(para), BODY))
        i += 1

    return flow

# ---- Page furniture ----------------------------------------------------------
def draw_furniture(canvas, doc):
    canvas.saveState()
    w, h = LETTER
    # Top accent rule
    canvas.setStrokeColor(VOLT)
    canvas.setLineWidth(2)
    canvas.line(0.9 * inch, h - 0.62 * inch, w - 0.9 * inch, h - 0.62 * inch)
    # Running header
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTE)
    if doc.page > 1:
        canvas.drawString(0.9 * inch, h - 0.5 * inch, "Cadence — Technical Implementation Document")
    # Footer
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.5)
    canvas.line(0.9 * inch, 0.62 * inch, w - 0.9 * inch, 0.62 * inch)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTE)
    canvas.drawString(0.9 * inch, 0.46 * inch, "Real-time USDC payment streaming on Arc L1")
    canvas.drawRightString(w - 0.9 * inch, 0.46 * inch, f"Page {doc.page}")
    canvas.restoreState()

def build():
    with open(SRC, encoding="utf-8") as f:
        md = f.read()
    flow = parse(md)
    doc = BaseDocTemplate(
        OUT, pagesize=LETTER,
        leftMargin=0.9 * inch, rightMargin=0.9 * inch,
        topMargin=0.85 * inch, bottomMargin=0.8 * inch,
        title="Cadence — Technical Implementation Document",
        author="Cadence",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin,
                  doc.width, doc.height, id="main")
    doc.addPageTemplates([PageTemplate(id="all", frames=[frame],
                                       onPage=draw_furniture)])
    doc.build(flow)
    print("wrote", OUT)

if __name__ == "__main__":
    build()

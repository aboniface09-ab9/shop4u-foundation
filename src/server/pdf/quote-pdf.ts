import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { computeTotals, formatCents, lineTotalCents } from "@/lib/money";
import type { QuoteDocument } from "@/lib/quote-document";

/**
 * Renders a quote as a branded A4 PDF. Pure JS (pdf-lib), runs in a Cloudflare Worker.
 * Standard Helvetica only supports WinAnsi, so text is sanitised first (see safeText).
 */

const NAVY = rgb(0.07, 0.16, 0.3);
const TEAL = rgb(0.05, 0.62, 0.56);
const GREY = rgb(0.4, 0.4, 0.4);
const LINE = rgb(0.85, 0.85, 0.85);

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 50;

/** Replace characters Helvetica/WinAnsi can't encode (and odd spaces) so drawText never throws. */
export function safeText(input: string): string {
  return input
    .replace(/[   ]/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7e\xa1-\xff\n]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of safeText(text).split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let current = "";
    for (const w of words) {
      const next = current ? `${current} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) current = next;
      else {
        if (current) out.push(current);
        current = w;
      }
    }
    out.push(current);
  }
  return out;
}

const money = (cents: number) => safeText(formatCents(cents));
const dateZA = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

export async function renderQuotePdf(doc: QuoteDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Quotation ${doc.number}`);
  pdf.setAuthor(safeText(doc.business.legal_name));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H;

  page.drawRectangle({ x: 0, y: PAGE_H - 70, width: PAGE_W, height: 70, color: NAVY });
  page.drawText("YouCommerce", {
    x: MARGIN,
    y: PAGE_H - 44,
    size: 20,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawRectangle({ x: 0, y: PAGE_H - 74, width: PAGE_W, height: 4, color: TEAL });
  y = PAGE_H - 110;

  const ensure = (needed: number) => {
    if (y - needed < 60) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - 60;
    }
  };
  const text = (s: string, x: number, size = 10, f: PDFFont = font, color = rgb(0, 0, 0)) =>
    page.drawText(safeText(s), { x, y, size, font: f, color });
  const textRight = (s: string, xRight: number, size = 10, f: PDFFont = font) => {
    const t = safeText(s);
    page.drawText(t, { x: xRight - f.widthOfTextAtSize(t, size), y, size, font: f });
  };
  const paragraph = (s: string, size = 10, color = rgb(0, 0, 0), width = PAGE_W - MARGIN * 2) => {
    for (const l of wrap(s, font, size, width)) {
      ensure(size + 4);
      page.drawText(l, { x: MARGIN, y, size, font, color });
      y -= size + 4;
    }
  };

  text("QUOTATION", MARGIN, 22, bold, NAVY);
  textRight(doc.number, PAGE_W - MARGIN, 14, bold);
  y -= 24;
  text(`Prepared for: ${doc.client.company_name}`, MARGIN, 11, bold);
  textRight(`Valid until: ${dateZA(doc.valid_until)}`, PAGE_W - MARGIN, 10);
  y -= 16;
  if (doc.client.billing_address) {
    for (const l of wrap(doc.client.billing_address, font, 9, 260)) {
      text(l, MARGIN, 9, font, GREY);
      y -= 12;
    }
  }
  const b = doc.business;
  y -= 6;
  text(
    `Prepared by: ${b.legal_name}${b.registration_number ? `  |  Reg ${b.registration_number}` : ""}`,
    MARGIN,
    9,
    font,
    GREY,
  );
  y -= 12;
  const contact = [b.email, b.phone].filter(Boolean).join("  |  ");
  if (contact) {
    text(contact, MARGIN, 9, font, GREY);
    y -= 12;
  }
  y -= 8;

  const hasVat = doc.vat_rate_bps > 0;
  paragraph(
    hasVat
      ? `All prices are in South African Rand and exclude VAT. VAT at ${(doc.vat_rate_bps / 100).toFixed(0)}% is added on invoices.`
      : "All prices are in South African Rand. No VAT is charged.",
    9,
    GREY,
  );
  y -= 6;
  if (doc.intro) {
    paragraph(doc.intro, 10);
    y -= 6;
  }

  const xQty = PAGE_W - MARGIN - 150;
  const xUnit = PAGE_W - MARGIN - 80;
  const xTotal = PAGE_W - MARGIN;

  const section = (title: string, kind: "once_off" | "monthly", totalLabel: string) => {
    const rows = doc.lines.filter((l) => l.kind === kind);
    if (rows.length === 0) return;
    ensure(60);
    page.drawRectangle({
      x: MARGIN,
      y: y - 6,
      width: PAGE_W - MARGIN * 2,
      height: 20,
      color: rgb(0.95, 0.97, 0.98),
    });
    text(title, MARGIN + 6, 10, bold, NAVY);
    textRight("Qty", xQty, 9, bold);
    textRight("Unit", xUnit, 9, bold);
    textRight(kind === "monthly" ? "Per month" : "Amount", xTotal - 4, 9, bold);
    y -= 24;

    for (const l of rows) {
      const nameLines = wrap(l.name, bold, 10, xQty - MARGIN - 50);
      const descLines = l.description ? wrap(l.description, font, 8.5, xQty - MARGIN - 50) : [];
      ensure((nameLines.length + descLines.length) * 12 + 10);
      const top = y;
      for (const nl of nameLines) {
        page.drawText(nl, { x: MARGIN + 6, y, size: 10, font: bold });
        y -= 12;
      }
      for (const dl of descLines) {
        page.drawText(dl, { x: MARGIN + 6, y, size: 8.5, font, color: GREY });
        y -= 11;
      }
      const bottom = y;
      y = top;
      textRight(String(l.quantity), xQty, 10);
      textRight(money(l.unit_price_cents), xUnit, 10);
      textRight(money(lineTotalCents(l)), xTotal - 4, 10);
      y = bottom - 4;
      page.drawLine({
        start: { x: MARGIN, y },
        end: { x: PAGE_W - MARGIN, y },
        thickness: 0.5,
        color: LINE,
      });
      y -= 10;
    }
    const sum = rows.reduce((a, l) => a + lineTotalCents(l), 0);
    text(totalLabel, MARGIN + 6, 10, bold);
    textRight(money(sum), xTotal - 4, 10, bold);
    y -= 26;
  };

  section("Once-off build", "once_off", "Total once-off build");
  section("Monthly hosting and maintenance", "monthly", "Total per month");

  const t = computeTotals(doc.lines, {
    depositPercent: doc.deposit_percent,
    vatRateBps: doc.vat_rate_bps,
  });
  ensure(110);
  text("Payment terms", MARGIN, 12, bold, NAVY);
  y -= 18;
  const termRows: [string, string][] = [
    [`On acceptance (${doc.deposit_percent}% deposit)`, money(t.depositCents)],
    ["On launch (balance of build)", money(t.balanceCents)],
    ["Monthly, starting at launch", money(t.monthlyCents)],
    ["First-year total (build + 12 months)", money(t.firstYearCents)],
  ];
  for (const [label, value] of termRows) {
    text(label, MARGIN + 6, 10);
    textRight(value, xTotal - 4, 10, bold);
    y -= 15;
  }
  if (hasVat) {
    y -= 2;
    paragraph(
      `With VAT: deposit ${money(t.incl.deposit)}, balance ${money(t.incl.balance)}, monthly ${money(t.incl.monthly)}.`,
      9,
      GREY,
    );
  }
  y -= 12;

  if (doc.terms) {
    ensure(40);
    text("Terms", MARGIN, 12, bold, NAVY);
    y -= 16;
    paragraph(doc.terms, 9);
  }

  if (doc.accepted_name && doc.accepted_at) {
    y -= 14;
    ensure(40);
    const when = new Date(doc.accepted_at).toLocaleString("en-ZA", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "Africa/Johannesburg",
    });
    page.drawRectangle({
      x: MARGIN,
      y: y - 10,
      width: PAGE_W - MARGIN * 2,
      height: 28,
      color: rgb(0.9, 0.97, 0.95),
    });
    text(`Accepted online by ${doc.accepted_name} on ${when} (SAST)`, MARGIN + 8, 10, bold, NAVY);
  }

  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const label = `${doc.number}  |  Page ${i + 1} of ${pages.length}`;
    p.drawText(label, {
      x: PAGE_W - MARGIN - font.widthOfTextAtSize(label, 8),
      y: 30,
      size: 8,
      font,
      color: GREY,
    });
  });

  return pdf.save();
}

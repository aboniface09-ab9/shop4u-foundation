import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { INVOICE_KIND_TITLE, invoiceHeading, type InvoiceDocument } from "@/lib/invoice-document";
import { formatCents } from "@/lib/money";
import { safeText } from "./quote-pdf";

/** Renders an invoice as a branded A4 PDF (pdf-lib, Worker-safe). Same look as the quote PDF. */

const NAVY = rgb(0.07, 0.16, 0.3);
const TEAL = rgb(0.05, 0.62, 0.56);
const GREY = rgb(0.4, 0.4, 0.4);
const LINE = rgb(0.85, 0.85, 0.85);
const RED = rgb(0.7, 0.1, 0.1);

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 50;

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
const monthZA = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-ZA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

export async function renderInvoicePdf(doc: InvoiceDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Invoice ${doc.number}`);
  pdf.setAuthor(safeText(doc.business.legal_name));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({ x: 0, y: PAGE_H - 70, width: PAGE_W, height: 70, color: NAVY });
  page.drawText("YouCommerce", {
    x: MARGIN,
    y: PAGE_H - 44,
    size: 20,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawRectangle({ x: 0, y: PAGE_H - 74, width: PAGE_W, height: 4, color: TEAL });
  let y = PAGE_H - 110;

  const ensure = (needed: number) => {
    if (y - needed < 60) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - 60;
    }
  };
  const text = (s: string, x: number, size = 10, f: PDFFont = font, color = rgb(0, 0, 0)) =>
    page.drawText(safeText(s), { x, y, size, font: f, color });
  const textRight = (
    s: string,
    xRight: number,
    size = 10,
    f: PDFFont = font,
    color = rgb(0, 0, 0),
  ) => {
    const t = safeText(s);
    page.drawText(t, { x: xRight - f.widthOfTextAtSize(t, size), y, size, font: f, color });
  };
  const paragraph = (s: string, size = 10, color = rgb(0, 0, 0)) => {
    for (const l of wrap(s, font, size, PAGE_W - MARGIN * 2)) {
      ensure(size + 4);
      page.drawText(l, { x: MARGIN, y, size, font, color });
      y -= size + 4;
    }
  };

  // Title block
  text(invoiceHeading(doc), MARGIN, 22, bold, NAVY);
  textRight(doc.number, PAGE_W - MARGIN, 14, bold);
  y -= 22;
  text(
    INVOICE_KIND_TITLE[doc.kind] + (doc.period_start ? ` (${monthZA(doc.period_start)})` : ""),
    MARGIN,
    10,
    font,
    GREY,
  );
  if (doc.status === "paid") textRight("PAID", PAGE_W - MARGIN, 14, bold, TEAL);
  if (doc.status === "void") textRight("VOID", PAGE_W - MARGIN, 14, bold, RED);
  y -= 22;

  const colX = PAGE_W / 2 + 10;
  const topY = y;
  text("Billed to", MARGIN, 9, bold, GREY);
  y -= 13;
  text(doc.client.company_name, MARGIN, 11, bold);
  y -= 14;
  if (doc.client.billing_address) {
    for (const l of wrap(doc.client.billing_address, font, 9, 230)) {
      text(l, MARGIN, 9, font, GREY);
      y -= 12;
    }
  }
  if (doc.client.vat_number) {
    text(`VAT no: ${doc.client.vat_number}`, MARGIN, 9, font, GREY);
    y -= 12;
  }
  const leftBottom = y;

  y = topY;
  const b = doc.business;
  text("From", colX, 9, bold, GREY);
  y -= 13;
  text(b.legal_name, colX, 11, bold);
  y -= 14;
  const bizLines = [
    b.registration_number ? `Reg ${b.registration_number}` : "",
    b.vat_registered && b.vat_number ? `VAT no: ${b.vat_number}` : "",
    ...(b.address ? wrap(b.address, font, 9, 230) : []),
    b.email,
    b.phone,
  ].filter(Boolean);
  for (const l of bizLines) {
    text(l, colX, 9, font, GREY);
    y -= 12;
  }
  y = Math.min(y, leftBottom) - 12;

  text(`Issued: ${dateZA(doc.issue_date)}`, MARGIN, 10);
  textRight(`Due: ${dateZA(doc.due_date)}`, PAGE_W - MARGIN, 10, bold);
  y -= 24;

  // Lines
  const xQty = PAGE_W - MARGIN - 150;
  const xUnit = PAGE_W - MARGIN - 80;
  const xTotal = PAGE_W - MARGIN;
  page.drawRectangle({
    x: MARGIN,
    y: y - 6,
    width: PAGE_W - MARGIN * 2,
    height: 20,
    color: rgb(0.95, 0.97, 0.98),
  });
  text("Description", MARGIN + 6, 9, bold, NAVY);
  textRight("Qty", xQty, 9, bold);
  textRight("Unit (ex VAT)", xUnit + 14, 9, bold);
  textRight("Amount", xTotal - 4, 9, bold);
  y -= 24;

  for (const l of doc.lines) {
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
    textRight(money(l.unit_price_cents), xUnit + 14, 10);
    textRight(money(l.quantity * l.unit_price_cents), xTotal - 4, 10);
    y = bottom - 4;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.5,
      color: LINE,
    });
    y -= 14;
  }

  // Totals
  ensure(90);
  text("Subtotal (ex VAT)", xUnit - 120, 10, font, GREY);
  textRight(money(doc.subtotal_cents), xTotal - 4, 10);
  y -= 15;
  text(
    doc.vat_rate_bps > 0 ? `VAT (${(doc.vat_rate_bps / 100).toFixed(0)}%)` : "VAT",
    xUnit - 120,
    10,
    font,
    GREY,
  );
  textRight(doc.vat_rate_bps > 0 ? money(doc.vat_cents) : "Not charged", xTotal - 4, 10);
  y -= 18;
  text(doc.status === "paid" ? "Total (paid)" : "Total due", xUnit - 120, 12, bold, NAVY);
  textRight(money(doc.total_cents), xTotal - 4, 12, bold);
  y -= 34;

  // Payment details (only while unpaid) or paid note
  if (doc.status === "sent" && doc.bank) {
    ensure(110);
    text("Pay by EFT", MARGIN, 12, bold, NAVY);
    y -= 18;
    const rows: [string, string][] = [
      ["Bank", doc.bank.bank_name],
      ["Account holder", doc.bank.account_holder],
      ["Account number", doc.bank.account_number],
      ["Branch code", doc.bank.branch_code],
      ["Payment reference", doc.number],
    ];
    for (const [k, v] of rows) {
      text(k, MARGIN + 6, 10, font, GREY);
      text(v, MARGIN + 130, 10, bold);
      y -= 15;
    }
    y -= 6;
    paragraph(
      "Please use the invoice number as your payment reference so we can match your payment.",
      9,
      GREY,
    );
  } else if (doc.status === "paid" && doc.paid_on) {
    paragraph(`Paid on ${dateZA(doc.paid_on)}. Thank you.`, 10, TEAL);
  }

  if (doc.notes) {
    y -= 8;
    paragraph(doc.notes, 9, GREY);
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

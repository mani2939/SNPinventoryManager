import { PDFDocument, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Invoice } from "./types";
const navy = rgb(0.11, 0.16, 0.28),
  rose = rgb(0.73, 0.47, 0.36),
  muted = rgb(0.43, 0.48, 0.57),
  line = rgb(0.89, 0.9, 0.93);
const gbp = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
    n,
  );
const displayDate = (s: string) =>
  new Date(s + "T12:00:00Z").toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
function wrap(
  text: string,
  font: PDFFont,
  size: number,
  width: number,
): string[] {
  const result: string[] = [];
  for (const paragraph of text.replaceAll("\t", " ").split(/\r?\n/)) {
    let current = "";
    for (const token of paragraph.split(/\s+/)) {
      if (!token) continue;
      if (
        font.widthOfTextAtSize((current ? current + " " : "") + token, size) <=
        width
      ) {
        current += (current ? " " : "") + token;
        continue;
      }
      if (current) {
        result.push(current);
        current = "";
      }
      for (const ch of token) {
        if (current && font.widthOfTextAtSize(current + ch, size) > width) {
          result.push(current);
          current = "";
        }
        current += ch;
      }
    }
    result.push(current);
  }
  return result;
}
export async function generateInvoicePdf(
  invoice: Invoice,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [regularBytes, boldBytes, logoBytes] = await Promise.all([
    readFile(path.join(process.cwd(), "assets/invoice-fonts/DejaVuSans.ttf")),
    readFile(
      path.join(process.cwd(), "assets/invoice-fonts/DejaVuSans-Bold.ttf"),
    ),
    readFile(path.join(process.cwd(), "assets/invoice-logo.png")),
  ]);
  const font = await doc.embedFont(regularBytes, { subset: true }),
    bold = await doc.embedFont(boldBytes, { subset: true }),
    logo = await doc.embedPng(logoBytes);
  const width = 595.28,
    height = 841.89,
    margin = 42,
    inner = width - 2 * margin;
  let page!: PDFPage,
    y = 0;
  function text(
    value: string,
    x: number,
    baseline: number,
    size = 10,
    weight = font,
    color = navy,
  ) {
    page.drawText(value, { x, y: baseline, size, font: weight, color });
  }
  function right(
    value: string,
    rightEdge: number,
    baseline: number,
    size = 10,
    weight = font,
    color = navy,
    maxWidth = 120,
  ) {
    while (weight.widthOfTextAtSize(value, size) > maxWidth && size > 5)
      size -= 0.25;
    text(
      value,
      rightEdge - weight.widthOfTextAtSize(value, size),
      baseline,
      size,
      weight,
      color,
    );
  }
  function newPage() {
    page = doc.addPage([width, height]);
    page.drawImage(logo, { x: margin, y: height - 90, width: 48, height: 48 });
    text("SHAPES & PIECES", margin + 61, height - 57, 14, bold);
    text("CUSTOMER INVOICE", margin + 61, height - 77, 9, font, rose);
    text(invoice.invoice_number, margin, height - 111, 10, bold);
    text(
      displayDate(invoice.invoice_date),
      width - margin - 100,
      height - 111,
      10,
      font,
      muted,
    );
    page.drawLine({
      start: { x: margin, y: height - 124 },
      end: { x: width - margin, y: height - 124 },
      thickness: 1,
      color: line,
    });
    y = height - 146;
  }
  function ensure(space: number) {
    if (y - space < 70) newPage();
  }
  function paragraph(value: string, size = 10, weight = font, color = navy) {
    for (const row of wrap(value, weight, size, inner)) {
      ensure(size + 5);
      text(row, margin, y, size, weight, color);
      y -= size + 5;
    }
    y -= 5;
  }
  function tableHeader() {
    ensure(28);
    page.drawRectangle({
      x: margin,
      y: y - 22,
      width: inner,
      height: 25,
      color: rgb(0.96, 0.94, 0.93),
    });
    text("ITEM / SKU", margin + 7, y - 13, 8, bold);
    text("QTY", margin + 278, y - 13, 8, bold);
    text("UNIT", margin + 320, y - 13, 8, bold);
    text("DISC.", margin + 385, y - 13, 8, bold);
    text("TOTAL", margin + 448, y - 13, 8, bold);
    y -= 34;
  }
  newPage();
  if (invoice.status === "void")
    paragraph("VOID INVOICE - DO NOT PAY", 14, bold, rose);
  paragraph("FROM", 8, bold, muted);
  paragraph(invoice.seller.business_name, 12, bold);
  if (invoice.seller.address) paragraph(invoice.seller.address);
  if (invoice.seller.email || invoice.seller.phone)
    paragraph(
      [invoice.seller.email, invoice.seller.phone]
        .filter(Boolean)
        .join("  |  "),
      9,
      font,
      muted,
    );
  y -= 5;
  paragraph("BILL TO", 8, bold, muted);
  paragraph(invoice.customer_name, 12, bold);
  if (invoice.customer_address) paragraph(invoice.customer_address);
  if (invoice.customer_phone) paragraph(invoice.customer_phone, 9, font, muted);
  paragraph(
    `Invoice date: ${displayDate(invoice.invoice_date)}   |   Due date: ${displayDate(invoice.due_date)}`,
    9,
  );
  tableHeader();
  for (const item of invoice.items) {
    const rows = wrap(item.description, font, 9, 258),
      skuRows = item.sku ? wrap(item.sku, font, 7, 258) : [];
    const rowHeight = Math.max(30, rows.length * 13 + skuRows.length * 11 + 10);
    if (y - rowHeight < 70) {
      newPage();
      tableHeader();
    }
    let rowY = y;
    for (const row of rows) {
      text(row, margin + 7, rowY, 9);
      rowY -= 13;
    }
    for (const sku of skuRows) {
      text(sku, margin + 7, rowY, 7, font, muted);
      rowY -= 11;
    }
    const figures = [
      [String(item.quantity), 278],
      [gbp(item.unit_price), 320],
      [`${item.discount_percent}%`, 385],
      [gbp(item.line_total), 448],
    ] as const;
    // Wrap unusual large monetary amounts in their own cell rather than crossing columns.
    for (const [value, offset] of figures) {
      const available =
        offset === 448 ? inner - offset - 5 : offset === 278 ? 38 : 60;
      let figureY = y;
      for (const part of wrap(value, font, 8, available)) {
        text(part, margin + offset, figureY, 8);
        figureY -= 11;
      }
    }
    y -= Math.max(rowHeight, 40);
    page.drawLine({
      start: { x: margin, y: y + 7 },
      end: { x: width - margin, y: y + 7 },
      color: line,
      thickness: 0.5,
    });
  }
  ensure(122);
  y -= 10;
  for (const [label, value] of [
    ["Subtotal", invoice.subtotal_gbp],
    ["Discount", -invoice.discount_gbp],
    ["Shipping", invoice.shipping_gbp],
  ] as const) {
    text(label, margin + 290, y, 10, font, muted);
    right(gbp(value), width - margin - 10, y, 10, font, navy, 125);
    y -= 20;
  }
  page.drawRectangle({
    x: margin + 278,
    y: y - 28,
    width: inner - 278,
    height: 38,
    color: navy,
  });
  text("TOTAL DUE", margin + 291, y - 15, 10, bold, rgb(1, 1, 1));
  right(
    gbp(invoice.total_gbp),
    width - margin - 10,
    y - 15,
    12,
    bold,
    rgb(1, 1, 1),
    120,
  );
  y -= 50;
  if (invoice.status === "paid") paragraph("Payment recorded", 10, bold, rose);
  if (invoice.seller.payment_details) {
    paragraph("PAYMENT DETAILS", 8, bold, muted);
    paragraph(invoice.seller.payment_details, 9);
  }
  if (invoice.notes) {
    paragraph("NOTES", 8, bold, muted);
    paragraph(invoice.notes, 9);
  }
  if (invoice.seller.footer) paragraph(invoice.seller.footer, 9, font, rose);
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawLine({
      start: { x: margin, y: 48 },
      end: { x: width - margin, y: 48 },
      color: line,
      thickness: 0.5,
    });
    p.drawText(
      `${invoice.invoice_number}   |   Page ${i + 1} of ${pages.length}`,
      { x: margin, y: 32, size: 8, font, color: muted },
    );
  });
  doc.setTitle(`Invoice ${invoice.invoice_number}`);
  doc.setAuthor(invoice.seller.business_name);
  doc.setCreationDate(new Date(invoice.created_at));
  return doc.save();
}

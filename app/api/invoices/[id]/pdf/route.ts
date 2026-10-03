import { NextRequest } from "next/server";
import { z } from "zod";
import { guard, HttpError } from "@/lib/http";
import { getInvoice } from "@/lib/invoices/repository";
import { generateInvoicePdf } from "@/lib/invoices/pdf";
import { invoiceFailure } from "@/lib/invoices/http";
export const runtime = "nodejs";
export async function GET(
  req: NextRequest,
  c: { params: Promise<{ id: string }> },
) {
  try {
    await guard(req);
    const invoice = await getInvoice(z.uuid().parse((await c.params).id));
    if (!invoice) throw new HttpError("Invoice not found.", 404);
    return new Response(new Uint8Array(await generateInvoicePdf(invoice)), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoice.invoice_number}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return invoiceFailure(e, req);
  }
}

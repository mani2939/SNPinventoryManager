import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard, HttpError } from "@/lib/http";
import {
  getInvoice,
  claimDelivery,
  completeDelivery,
} from "@/lib/invoices/repository";
import { sendSchema } from "@/lib/invoices/validation";
import { generateInvoicePdf } from "@/lib/invoices/pdf";
import {
  sendInvoiceWhatsApp,
  whatsappConfiguration,
  WhatsAppError,
} from "@/lib/invoices/whatsapp";
import { invoiceFailure } from "@/lib/invoices/http";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(
  req: NextRequest,
  c: { params: Promise<{ id: string }> },
) {
  try {
    await guard(req);
    const id = z.uuid().parse((await c.params).id),
      body = sendSchema.parse(await req.json());
    if (!whatsappConfiguration())
      throw new HttpError(
        "WhatsApp API is not configured. Add the Meta credentials and approved template in Vercel, or download the PDF and attach it manually.",
        503,
      );
    const invoice = await getInvoice(id);
    if (!invoice) throw new HttpError("Invoice not found.", 404);
    if (invoice.status === "void" || invoice.privacy_redacted_at)
      throw new HttpError("Void or redacted invoices cannot be sent.", 409);
    const pdf = await generateInvoicePdf(invoice);
    const { delivery, claimed } = await claimDelivery(
      id,
      body.request_token,
      body.recipient,
    );
    if (!claimed) return NextResponse.json({ delivery });
    try {
      const messageId = await sendInvoiceWhatsApp(invoice, body.recipient, pdf);
      const accepted = await completeDelivery(
        delivery.id,
        "accepted",
        messageId,
        null,
      );
      return NextResponse.json({ delivery: accepted });
    } catch (e) {
      const known = e instanceof WhatsAppError;
      const uncertain = !known || e.uncertain;
      const message = known
        ? e.message
        : "The send result is unknown. Check WhatsApp before retrying.";
      await completeDelivery(
        delivery.id,
        uncertain ? "uncertain" : "failed",
        null,
        message,
      );
      return NextResponse.json({ error: message }, { status: 502 });
    }
  } catch (e) {
    return invoiceFailure(e, req);
  }
}

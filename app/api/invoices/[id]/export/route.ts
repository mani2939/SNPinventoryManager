import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard, HttpError } from "@/lib/http";
import { getInvoice, listDeliveries } from "@/lib/invoices/repository";
import { invoiceFailure } from "@/lib/invoices/http";
export async function GET(
  req: NextRequest,
  c: { params: Promise<{ id: string }> },
) {
  try {
    await guard(req);
    const id = z.uuid().parse((await c.params).id);
    const invoice = await getInvoice(id);
    if (!invoice) throw new HttpError("Invoice not found.", 404);
    const { request_token: _token, payload_hash: _hash, ...data } = invoice;
    const deliveries = await listDeliveries(id);
    return NextResponse.json(
      {
        invoice: data,
        whatsapp_history: deliveries.map(
          ({ recipient, status, created_at, consent_confirmed_at }) => ({
            recipient,
            status,
            created_at,
            consent_confirmed_at,
          }),
        ),
      },
      {
        headers: {
          "Content-Disposition": `attachment; filename="${invoice.invoice_number}-customer-data.json"`,
        },
      },
    );
  } catch (e) {
    return invoiceFailure(e, req);
  }
}

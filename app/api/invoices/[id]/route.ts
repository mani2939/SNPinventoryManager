import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard, HttpError } from "@/lib/http";
import {
  getInvoice,
  listDeliveries,
  updateInvoiceStatus,
} from "@/lib/invoices/repository";
import { statusSchema } from "@/lib/invoices/validation";
import { invoiceFailure } from "@/lib/invoices/http";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, c: Context) {
  try {
    await guard(req);
    const id = z.uuid().parse((await c.params).id);
    const [invoice, deliveries] = await Promise.all([
      getInvoice(id),
      listDeliveries(id),
    ]);
    if (!invoice) throw new HttpError("Invoice not found.", 404);
    return NextResponse.json({ invoice, deliveries });
  } catch (e) {
    return invoiceFailure(e, req);
  }
}
export async function PATCH(req: NextRequest, c: Context) {
  try {
    await guard(req);
    const id = z.uuid().parse((await c.params).id);
    const v = statusSchema.parse(await req.json());
    return NextResponse.json(
      await updateInvoiceStatus(id, v.status, v.updated_at),
    );
  } catch (e) {
    return invoiceFailure(e, req);
  }
}

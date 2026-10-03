import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/http";
import { redactInvoiceCustomer } from "@/lib/invoices/repository";
import { invoiceFailure } from "@/lib/invoices/http";
export async function POST(
  req: NextRequest,
  c: { params: Promise<{ id: string }> },
) {
  try {
    await guard(req);
    const id = z.uuid().parse((await c.params).id);
    const body = z
      .object({ updated_at: z.string().min(1), confirm: z.literal(true) })
      .parse(await req.json());
    return NextResponse.json(await redactInvoiceCustomer(id, body.updated_at));
  } catch (e) {
    return invoiceFailure(e, req);
  }
}

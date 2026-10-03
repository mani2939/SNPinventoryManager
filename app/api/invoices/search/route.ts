import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/http";
import { invoiceFiltersSchema } from "@/lib/invoices/validation";
import { listInvoices } from "@/lib/invoices/repository";
import { invoiceFailure } from "@/lib/invoices/http";
// Customer names belong in a private request body, never URL/access-log fields.
export async function POST(req: NextRequest) {
  try {
    await guard(req);
    return NextResponse.json(
      await listInvoices(invoiceFiltersSchema.parse(await req.json())),
    );
  } catch (e) {
    return invoiceFailure(e, req);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { guard, HttpError } from "@/lib/http";
import { invoiceSchema, invoiceFiltersSchema } from "@/lib/invoices/validation";
import { listInvoices, saveInvoice } from "@/lib/invoices/repository";
import { invoiceFailure } from "@/lib/invoices/http";
export async function GET(req: NextRequest) {
  try {
    await guard(req);
    const p = req.nextUrl.searchParams;
    if (p.has("name"))
      throw new HttpError(
        "Use the private invoice search endpoint for customer names.",
      );
    const filters = invoiceFiltersSchema.parse({
      name: "",
      from: p.get("from") || undefined,
      to: p.get("to") || undefined,
      page: p.get("page") || 1,
    });
    return NextResponse.json(await listInvoices(filters));
  } catch (e) {
    return invoiceFailure(e, req);
  }
}
export async function POST(req: NextRequest) {
  try {
    await guard(req);
    return NextResponse.json(
      await saveInvoice(invoiceSchema.parse(await req.json())),
      { status: 201 },
    );
  } catch (e) {
    return invoiceFailure(e, req);
  }
}

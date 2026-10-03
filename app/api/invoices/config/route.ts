import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/http";
import { profileSchema } from "@/lib/invoices/validation";
import {
  getInvoiceProfile,
  saveInvoiceProfile,
} from "@/lib/invoices/repository";
import { invoiceFailure } from "@/lib/invoices/http";
import { whatsappConfiguration } from "@/lib/invoices/whatsapp";
export async function GET(req: NextRequest) {
  try {
    await guard(req);
    return NextResponse.json({
      profile: await getInvoiceProfile(),
      whatsapp_ready: !!whatsappConfiguration(),
    });
  } catch (e) {
    return invoiceFailure(e, req);
  }
}
export async function PATCH(req: NextRequest) {
  try {
    await guard(req);
    return NextResponse.json({
      profile: await saveInvoiceProfile(profileSchema.parse(await req.json())),
    });
  } catch (e) {
    return invoiceFailure(e, req);
  }
}

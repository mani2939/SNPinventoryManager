import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/http";
import { listProducts } from "@/lib/repository";
import { skuSchema } from "@/lib/validation";
import { invoiceFailure } from "@/lib/invoices/http";
export async function GET(req: NextRequest) {
  try {
    await guard(req);
    const sku = skuSchema.parse(req.nextUrl.searchParams.get("sku"));
    const result = await listProducts({ sku, page: 1 });
    return NextResponse.json({
      products: result.products.map(({ id, item_name, retail_gbp, sku }) => ({
        id,
        item_name,
        retail_gbp,
        sku,
      })),
    });
  } catch (e) {
    return invoiceFailure(e, req);
  }
}

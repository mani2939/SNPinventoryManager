import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard, failure, HttpError } from "@/lib/http";
import { listProducts, saveProduct } from "@/lib/repository";
import { productSchema, skuSchema } from "@/lib/validation";
import { verifyPhoto } from "@/lib/storage";
export async function GET(req: NextRequest) {
  try {
    await guard(req);
    const p = req.nextUrl.searchParams;
    const f = z
      .object({
        vendor: z.string().uuid().optional(),
        from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        page: z.coerce.number().int().min(1).max(100000),
        sku: skuSchema.optional(),
      })
      .parse({
        vendor: p.get("vendor") || undefined,
        from: p.get("from") || undefined,
        to: p.get("to") || undefined,
        page: p.get("page") || 1,
        sku: p.get("sku") || undefined,
      });
    if (f.from && f.to && f.from > f.to)
      throw new HttpError("The start date must be before the end date.");
    return NextResponse.json(await listProducts(f));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    await guard(req);
    const v = productSchema.parse(await req.json());
    if (v.photo_key) await verifyPhoto(v.photo_key);
    return NextResponse.json(await saveProduct(v), { status: 201 });
  } catch (e) {
    return failure(e);
  }
}

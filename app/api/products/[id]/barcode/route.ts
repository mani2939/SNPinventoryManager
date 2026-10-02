import { NextRequest } from "next/server";
import { z } from "zod";
import { guard, failure, HttpError } from "@/lib/http";
import { getProduct } from "@/lib/repository";
export async function GET(
  req: NextRequest,
  c: { params: Promise<{ id: string }> },
) {
  try {
    await guard(req);
    const id = z
      .string()
      .uuid()
      .parse((await c.params).id);
    const p = await getProduct(id);
    if (!p?.barcode_svg)
      throw new HttpError(
        "Barcode not available. Run the SKU backfill for older products.",
        404,
      );
    return new Response(p.barcode_svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (e) {
    return failure(e);
  }
}

import { NextRequest } from "next/server";
import { z } from "zod";
import { guard, failure, HttpError } from "@/lib/http";
import { getProduct } from "@/lib/repository";
import { photoResponse } from "@/lib/storage";
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
    if (!p?.photo_key) throw new HttpError("Photo not found.", 404);
    return await photoResponse(p.photo_key);
  } catch (e) {
    return failure(e);
  }
}

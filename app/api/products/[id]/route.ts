import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard, failure, HttpError } from "@/lib/http";
import { getProduct, saveProduct, deleteProduct } from "@/lib/repository";
import { productSchema } from "@/lib/validation";
import { verifyPhoto, removePhoto } from "@/lib/storage";
type Context = { params: Promise<{ id: string }> };
export async function PUT(req: NextRequest, c: Context) {
  try {
    await guard(req);
    const id = z
      .string()
      .uuid()
      .parse((await c.params).id);
    const v = productSchema.parse(await req.json());
    const old = await getProduct(id);
    if (!old) throw new HttpError("Product not found.", 404);
    if (v.photo_key && v.photo_key !== old.photo_key)
      await verifyPhoto(v.photo_key);
    const saved = await saveProduct(v, id);
    if (old.photo_key && old.photo_key !== v.photo_key)
      await removePhoto(old.photo_key).catch((e) =>
        console.error("Photo cleanup failed:", e.message),
      );
    return NextResponse.json(saved);
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(req: NextRequest, c: Context) {
  try {
    await guard(req);
    const id = z
      .string()
      .uuid()
      .parse((await c.params).id);
    const { updated_at } = z
      .object({ updated_at: z.string().min(1) })
      .parse(await req.json());
    const old = await getProduct(id);
    if (!old) throw new HttpError("Product not found.", 404);
    await deleteProduct(id, updated_at);
    if (old.photo_key)
      await removePhoto(old.photo_key).catch((e) =>
        console.error("Photo cleanup failed:", e.message),
      );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}

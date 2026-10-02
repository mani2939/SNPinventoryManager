import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard, failure, HttpError } from "@/lib/http";
import { prepareUpload, saveDemoPhoto } from "@/lib/storage";
import { demoMode } from "@/lib/auth";
export async function POST(req: NextRequest) {
  try {
    await guard(req);
    const { size } = z
      .object({ size: z.number().int().min(1).max(2097152) })
      .parse(await req.json());
    return NextResponse.json(await prepareUpload(size));
  } catch (e) {
    return failure(e);
  }
}
export async function PUT(req: NextRequest) {
  try {
    await guard(req);
    if (!demoMode())
      throw new HttpError("Use the signed storage upload URL.", 403);
    const key = req.nextUrl.searchParams.get("key") || "";
    if (Number(req.headers.get("content-length")) > 2097152)
      throw new HttpError("Photo is too large.");
    const reader = req.body?.getReader();
    if (!reader) throw new HttpError("Photo is empty.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2097152) {
        await reader.cancel();
        throw new HttpError("Photo is too large.");
      }
      chunks.push(value);
    }
    await saveDemoPhoto(key, Buffer.concat(chunks));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}

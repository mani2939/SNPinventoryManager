import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard, failure } from "@/lib/http";
import { addVendor, setVendorActive } from "@/lib/repository";
import { vendorSchema } from "@/lib/validation";
export async function POST(req: NextRequest) {
  try {
    await guard(req);
    const v = vendorSchema.parse(await req.json());
    return NextResponse.json(await addVendor(v.name), { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(req: NextRequest) {
  try {
    await guard(req);
    const v = z
      .object({ id: z.string().uuid(), active: z.boolean() })
      .parse(await req.json());
    return NextResponse.json(await setVendorActive(v.id, v.active));
  } catch (e) {
    return failure(e);
  }
}

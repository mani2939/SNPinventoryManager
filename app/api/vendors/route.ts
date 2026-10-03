import { NextRequest, NextResponse } from "next/server";
import { guard, failure } from "@/lib/http";
import { addVendor, updateVendor } from "@/lib/repository";
import { vendorSchema, vendorUpdateSchema } from "@/lib/validation";
export async function POST(req: NextRequest) {
  try {
    await guard(req);
    const v = vendorSchema.parse(await req.json());
    return NextResponse.json(await addVendor(v.name,v.pseudo_code), { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(req: NextRequest) {
  try {
    await guard(req);
    const {id,...changes} = vendorUpdateSchema.parse(await req.json());
    return NextResponse.json(await updateVendor(id,changes));
  } catch (e) {
    return failure(e);
  }
}

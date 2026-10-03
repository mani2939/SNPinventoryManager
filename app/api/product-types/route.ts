import { NextRequest, NextResponse } from "next/server";
import { guard, failure } from "@/lib/http";
import { addProductType, updateProductType } from "@/lib/repository";
import { productTypeSchema, productTypeUpdateSchema } from "@/lib/validation";
export async function POST(req: NextRequest) {
  try {
    await guard(req);
    const {name} = productTypeSchema.parse(await req.json());
    return NextResponse.json(await addProductType(name),{status:201});
  } catch(e) { return failure(e); }
}
export async function PATCH(req: NextRequest) {
  try {
    await guard(req);
    const {id,...changes} = productTypeUpdateSchema.parse(await req.json());
    return NextResponse.json(await updateProductType(id,changes));
  } catch(e) { return failure(e); }
}

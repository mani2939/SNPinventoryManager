import { NextRequest, NextResponse } from "next/server";
import { guard, failure } from "@/lib/http";
import { getConfig, setRate } from "@/lib/repository";
import { settingsSchema } from "@/lib/validation";
export async function GET(req: NextRequest) {
  try {
    await guard(req);
    return NextResponse.json(await getConfig());
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(req: NextRequest) {
  try {
    await guard(req);
    const v = settingsSchema.parse(await req.json());
    return NextResponse.json(await setRate(v.exchange_rate));
  } catch (e) {
    return failure(e);
  }
}

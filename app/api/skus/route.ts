import { NextRequest, NextResponse } from "next/server";
import { guard, failure } from "@/lib/http";
import { reservationSchema } from "@/lib/validation";
import { reserveSku } from "@/lib/repository";
export async function POST(req: NextRequest) {
  try {
    await guard(req);
    const input = reservationSchema.parse(await req.json());
    return NextResponse.json(await reserveSku(input), { status: 201 });
  } catch (e) {
    return failure(e);
  }
}

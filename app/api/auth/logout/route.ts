import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { checkOrigin, failure } from "@/lib/http";
export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    (await cookies()).delete("snp_session");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}

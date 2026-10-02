import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { checkOrigin, failure, HttpError } from "@/lib/http";
import { createSession, demoMode, verifyCredentials } from "@/lib/auth";
import { query } from "@/lib/database";
const attempts = new Map<string, { count: number; start: number }>();
export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    const body = z
      .object({
        username: z.string().min(1).max(100),
        password: z.string().min(1).max(200),
      })
      .parse(await req.json());
    const ip = process.env.VERCEL
      ? req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown"
      : "local";
    const key = createHmac("sha256", process.env.SESSION_SECRET || "local")
      .update(ip)
      .digest("hex");
    let allowed = false;
    if (demoMode()) {
      const now = Date.now();
      for (const [k, v] of attempts)
        if (now - v.start > 900000) attempts.delete(k);
      const a = attempts.get(key) || { count: 0, start: now };
      a.count++;
      attempts.set(key, a);
      allowed = a.count <= 10;
    } else {
      const r = await query<{allowed:boolean}>("select consume_login_attempt($1) as allowed",[key]);
      allowed = r[0]?.allowed === true;
    }
    if (!allowed)
      throw new HttpError(
        "Too many sign-in attempts. Try again in 15 minutes.",
        429,
      );
    if (!verifyCredentials(body.username, body.password))
      throw new HttpError("Username or password is incorrect.", 401);
    await createSession();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}

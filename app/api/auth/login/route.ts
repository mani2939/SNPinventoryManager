import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomUUID } from "node:crypto";
import { z, ZodError } from "zod";
import { checkOrigin, failure, HttpError } from "@/lib/http";
import { createSession, demoMode, verifyCredentials } from "@/lib/auth";
import { query } from "@/lib/database";
import { assertAuthConfiguration, AuthConfigurationError } from "@/lib/auth-config.mjs";
const attempts = new Map<string, { count: number; start: number }>();
export async function POST(req: NextRequest) {
  let stage = "request";
  const requestId = (req.headers.get("x-vercel-id") || randomUUID()).slice(0,200);
  try {
    checkOrigin(req);
    const body = z
      .object({
        username: z.string().min(1).max(100),
        password: z.string().min(1).max(200),
      })
      .parse(await req.json());
    stage = "configuration";
    if (!demoMode()) assertAuthConfiguration();
    const ip = process.env.VERCEL
      ? req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown"
      : "local";
    const key = createHmac("sha256", process.env.SESSION_SECRET || "local")
      .update(ip)
      .digest("hex");
    let allowed = false;
    stage = "rate_limit";
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
    stage = "credentials";
    if (!verifyCredentials(body.username, body.password))
      throw new HttpError("Username or password is incorrect.", 401);
    stage = "session";
    await createSession();
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ZodError || e instanceof HttpError) return failure(e);
    if (e instanceof SyntaxError && stage === "request")
      return NextResponse.json({error:"Send valid JSON containing username and password."},{status:400});
    const databaseCode = e && typeof e === "object" && "code" in e && typeof e.code === "string" && /^[A-Z0-9]{5}$/.test(e.code) ? e.code : undefined;
    const code = e instanceof AuthConfigurationError ? e.code
      : stage === "rate_limit" ? "AUTH_DATABASE_UNAVAILABLE"
      : stage === "session" ? "AUTH_SESSION_FAILED" : "AUTH_LOGIN_FAILED";
    // Never log submitted credentials, DB URLs, secrets or raw driver messages.
    console.error(JSON.stringify({event:"auth_login_failed",requestId,stage,code,databaseCode}));
    let error = e instanceof AuthConfigurationError ? e.message : "Sign-in failed. Reference: "+code+".";
    if (stage === "rate_limit") {
      error = databaseCode === "42883" || databaseCode === "42P01"
        ? "Login database setup is missing. Deploy the updated app so its migration creates the login limiter."
        : databaseCode === "42501"
          ? "Login cannot access the database. Check the owner-role DATABASE_URL in Vercel Production and redeploy."
          : "Login could not reach its database. Check DATABASE_URL and Neon availability. Reference: AUTH_DATABASE_UNAVAILABLE.";
    }
    return NextResponse.json({error,code,requestId},{status:500,headers:{"X-Request-Id":requestId}});
  }
}

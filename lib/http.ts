import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "./auth";
import { ZodError } from "zod";
export class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function guard(req: NextRequest) {
  const session = await currentSession();
  if (!session) throw new HttpError("Please sign in again.", 401);
  const workspace = req.nextUrl.pathname.startsWith("/api/invoices")
    ? "invoicing"
    : "inventory";
  if (session.role !== "master" && session.role !== workspace)
    throw new HttpError("Sign in with an account for this workspace.", 403);
  checkOrigin(req);
}
export function checkOrigin(req: NextRequest) {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const origin = req.headers.get("origin");
    // Next.js can normalise nextUrl.hostname to localhost in development.
    // Host is the browser's actual destination; the browser controls Origin.
    const host = req.headers.get("host");
    const protocol = process.env.VERCEL ? "https:" : req.nextUrl.protocol;
    if (!origin || !host || origin !== `${protocol}//${host}`)
      throw new HttpError("Request origin was rejected.", 403);
  }
}
export function failure(e: unknown) {
  if (e instanceof ZodError)
    return NextResponse.json(
      {
        error: e.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      { status: 400 },
    );
  if (e instanceof HttpError)
    return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(
    "Inventory request failed:",
    e instanceof Error ? e.message : "Unknown error",
  );
  return NextResponse.json(
    {
      error:
        "Unable to complete the request. Check your connection and server configuration.",
    },
    { status: 500 },
  );
}

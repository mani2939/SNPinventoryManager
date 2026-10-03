import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { CustomerEncryptionError } from "./crypto";
import { HttpError, failure } from "../http";
export function invoiceFailure(e: unknown, req?: { signal: AbortSignal }) {
  if (req?.signal.aborted || (e instanceof Error && e.name === "AbortError"))
    return new NextResponse(null, { status: 499 });
  if (e instanceof SyntaxError)
    return NextResponse.json(
      { error: "Enter a valid JSON request." },
      { status: 400 },
    );
  if (e instanceof CustomerEncryptionError)
    return NextResponse.json({ error: e.message }, { status: 503 });
  if (e instanceof ZodError || e instanceof HttpError) return failure(e);
  // Raw provider/database messages can contain personal data: never log them.
  const code = (e as { code?: unknown })?.code;
  console.error("invoice_request_failed", {
    code:
      typeof code === "string" && /^[A-Z0-9]{5}$/.test(code)
        ? code
        : "INVOICE_REQUEST_FAILED",
  });
  return NextResponse.json(
    {
      error:
        "Unable to complete the invoice request. Check your connection and server configuration.",
    },
    { status: 500 },
  );
}

import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { scryptSync, timingSafeEqual } from "node:crypto";
import { assertAuthConfiguration } from "./auth-config.mjs";
export const demoMode = () =>
  process.env.DEMO_MODE === "true" &&
  process.env.NODE_ENV === "development" &&
  !process.env.VERCEL;
function secret() {
  if (!demoMode()) assertAuthConfiguration();
  const value =
    process.env.SESSION_SECRET ||
    (demoMode() ? "local-only-preview-secret-never-deploy-32chars" : "");
  if (value.length < 32)
    throw new Error("Set SESSION_SECRET to at least 32 random characters.");
  return new TextEncoder().encode(value);
}
export function verifyCredentials(username: string, password: string) {
  if (!demoMode()) assertAuthConfiguration();
  const expectedUser = process.env.ADMIN_USERNAME || "SNPAdmin";
  if (username.length > 100 || password.length > 200) return false;
  let hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash && demoMode())
    hash = `local:${scryptSync("SNPRocks", "local", 64).toString("hex")}`;
  if (!hash)
    throw new Error("Configure ADMIN_PASSWORD_HASH before signing in.");
  const [salt, hex] = hash.split(":");
  if (!salt || !hex || !/^[a-f0-9]{128}$/i.test(hex))
    throw new Error("Invalid ADMIN_PASSWORD_HASH configuration.");
  const matches = timingSafeEqual(
    scryptSync(password, salt, 64),
    Buffer.from(hex, "hex"),
  );
  return matches && username === expectedUser;
}
export async function createSession(workspace: "inventory" | "invoicing" = "inventory") {
  const token = await new SignJWT({ role: "admin", workspace })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("snp-admin")
    .setIssuer("snp-inventory")
    .setAudience("snp-inventory")
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret());
  (await cookies()).set("snp_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 28800,
  });
}
export async function authenticated() {
  const token = (await cookies()).get("snp_session")?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret(), {
      algorithms: ["HS256"],
      issuer: "snp-inventory",
      audience: "snp-inventory",
    });
    return payload.role === "admin" && payload.sub === "snp-admin";
  } catch {
    return false;
  }
}

export async function preferredWorkspace() {
 const token=(await cookies()).get('snp_session')?.value;
 if(!token)return '/login';
 try{const {payload}=await jwtVerify(token,secret(),{algorithms:['HS256'],issuer:'snp-inventory',audience:'snp-inventory'});if(payload.role!=='admin'||payload.sub!=='snp-admin')return '/login';return payload.workspace==='invoicing'?'/invoices':'/inventory';}catch{return '/login';}
}

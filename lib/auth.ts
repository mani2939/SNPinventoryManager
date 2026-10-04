import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { assertAuthConfiguration } from "./auth-config.mjs";
import {
  accounts,
  accountStamp,
  canAccess,
  verifyAccount,
} from "./auth-accounts.mjs";
export type Workspace = "inventory" | "invoicing";
export type AccountRole = Workspace | "master";
export type Session = {
  username: string;
  role: AccountRole;
  workspace: Workspace;
};
export const demoMode = () =>
  process.env.DEMO_MODE === "true" &&
  process.env.NODE_ENV === "development" &&
  !process.env.VERCEL;
function secret() {
  if (!demoMode()) assertAuthConfiguration();
  const v =
    process.env.SESSION_SECRET ||
    (demoMode() ? "local-only-preview-secret-never-deploy-32chars" : "");
  if (v.length < 32)
    throw new Error("Set SESSION_SECRET to at least 32 random characters.");
  return new TextEncoder().encode(v);
}
export function verifyCredentials(
  username: string,
  password: string,
  workspace: Workspace,
) {
  if (!demoMode()) assertAuthConfiguration();
  const a = verifyAccount(
    username,
    password,
    workspace,
    process.env,
    demoMode(),
  );
  return a
    ? {
        username: String(a.username),
        role: a.role as AccountRole,
        stamp: a.stamp,
      }
    : null;
}
export async function createSession(
  a: { username: string; role: AccountRole; stamp: string },
  workspace: Workspace,
) {
  const token = await new SignJWT({
    role: a.role,
    username: a.username,
    workspace,
    auth_version: 2,
    auth_stamp: a.stamp,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(`${a.role}:${a.username}`)
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
export async function currentSession(): Promise<Session | null> {
  const token = (await cookies()).get("snp_session")?.value;
  if (!token) return null;
  try {
    const { payload: p } = await jwtVerify(token, secret(), {
      algorithms: ["HS256"],
      issuer: "snp-inventory",
      audience: "snp-inventory",
    });
    if (
      p.auth_version !== 2 ||
      !["inventory", "invoicing", "master"].includes(String(p.role)) ||
      !["inventory", "invoicing"].includes(String(p.workspace))
    )
      return null;
    const a = accounts(process.env, demoMode()).find(
      (a) => a.username === p.username && a.role === p.role,
    );
    if (
      !a ||
      p.sub !== `${a.role}:${a.username}` ||
      p.auth_stamp !== accountStamp(a) ||
      !canAccess(a.role, String(p.workspace))
    )
      return null;
    return {
      username: String(a.username),
      role: a.role as AccountRole,
      workspace: p.workspace as Workspace,
    };
  } catch {
    return null;
  }
}
export async function authenticated() {
  return !!(await currentSession());
}
export async function requireWorkspace(workspace: Workspace) {
  const s = await currentSession();
  if (!s || !canAccess(s.role, workspace))
    redirect(`/login?workspace=${workspace}`);
  return s;
}
export async function preferredWorkspace() {
  const s = await currentSession();
  return !s
    ? "/login"
    : s.workspace === "invoicing"
      ? "/invoices"
      : "/inventory";
}

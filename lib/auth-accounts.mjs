import { createHash, scryptSync, timingSafeEqual } from "node:crypto";
export function accounts(env = process.env, demo = false) {
  const hash =
    env.INVENTORY_PASSWORD_HASH ||
    env.ADMIN_PASSWORD_HASH ||
    (demo
      ? `local:${scryptSync("SNPRocks", "local", 64).toString("hex")}`
      : "");
  return [
    {
      username: env.INVENTORY_USERNAME || env.ADMIN_USERNAME || "SNPAdmin",
      hash,
      role: "inventory",
    },
    {
      username: env.INVOICING_USERNAME,
      hash: env.INVOICING_PASSWORD_HASH,
      role: "invoicing",
    },
    {
      username: env.MASTER_USERNAME,
      hash: env.MASTER_PASSWORD_HASH,
      role: "master",
    },
  ].filter((a) => a.username && a.hash);
}
export function accountStamp(a) {
  return createHash("sha256")
    .update(JSON.stringify([a.username, a.role, a.hash]))
    .digest("hex");
}
export function canAccess(role, workspace) {
  return role === "master" || role === workspace;
}
export function verifyAccount(
  username,
  password,
  workspace,
  env = process.env,
  demo = false,
) {
  if (username.length > 100 || password.length > 200) return null;
  const list = accounts(env, demo),
    a = list.find((a) => a.username === username);
  const [salt, hex] = (
    a?.hash ||
    list[0]?.hash ||
    `dummy:${"0".repeat(128)}`
  ).split(":");
  if (!salt || !hex || !/^[a-f0-9]{128}$/i.test(hex)) return null;
  const matches = timingSafeEqual(
    scryptSync(password, salt, 64),
    Buffer.from(hex, "hex"),
  );
  return matches && a && canAccess(a.role, workspace)
    ? { username: a.username, role: a.role, stamp: accountStamp(a) }
    : null;
}

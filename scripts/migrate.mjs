import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Client, neonConfig } from "@neondatabase/serverless";
import { assertAuthConfiguration } from "../lib/auth-config.mjs";

class MigrationError extends Error {
  constructor(stage, cause) {
    // Driver errors may contain connection details. Build logs show only stage/code.
    const code = /^[A-Z0-9]{5}$/.test(cause?.code ?? "") ? " (" + cause.code + ")" : "";
    super("Database migration failed during " + stage + code + ". Deployment stopped.", { cause });
  }
}

export function migrationBody(sql) {
  if (!/^\s*begin\s*;/i.test(sql) || !/commit\s*;\s*$/i.test(sql)) {
    throw new Error("The migration must have its expected BEGIN/COMMIT wrapper.");
  }
  return sql.replace(/^\s*begin\s*;\s*/i, "").replace(/\s*commit\s*;\s*$/i, "");
}

export async function applyMigration(client, { migrationSql, verificationSql }) {
  const body = migrationBody(migrationSql);
  let stage = "starting the transaction";
  let inTransaction = false;
  try {
    await client.query("BEGIN");
    inTransaction = true;
    await client.query("SET LOCAL lock_timeout = '60s'");
    await client.query("SET LOCAL statement_timeout = '120s'");
    stage = "acquiring the deployment lock";
    // Transaction locks also work through Neon's transaction pooler.
    await client.query("SELECT pg_advisory_xact_lock(1946955344, 1)");
    stage = "creating the schema";
    await client.query(body);
    stage = "verifying the schema";
    const result = await client.query(verificationSql);
    const results = Array.isArray(result) ? result : [result];
    const report = results.flatMap((r) => r.rows ?? []).find((r) => r.schema_status === "schema verified");
    if (!report || Number(report.app_tables) !== 5) throw new Error("The schema readiness report is incomplete.");
    stage = "committing the schema";
    await client.query("COMMIT");
    inTransaction = false;
    return report;
  } catch (error) {
    if (inTransaction) await client.query("ROLLBACK").catch(() => {});
    throw new MigrationError(stage, error);
  }
}

export function migrationMode({ build, env }) {
  // Ordinary local builds stay offline. Manual db:migrate always requires a DB.
  if (build && !env.VERCEL) return "skip-local-build";
  if (!env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required for database migration. Enable the Neon connection for this Vercel deployment environment.");
  }
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { throw new Error("DATABASE_URL must be a valid PostgreSQL connection string."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.username || !url.pathname.slice(1)) {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection string.");
  }
  return "migrate";
}

async function main() {
  const build = process.argv.includes("--build");
  // Vercel supplies variables directly; the local file is only for manual runs.
  if (!process.env.VERCEL) {
    try { process.loadEnvFile(".env.local"); } catch (error) { if (error.code !== "ENOENT") throw new Error("Could not load .env.local for migration."); }
  }
  if (migrationMode({ build, env: process.env }) === "skip-local-build") {
    console.log("Automatic DB migration runs on Vercel. For local database setup, use npm run db:migrate.");
    return;
  }
  // Catch incomplete production login setup before publishing a broken login.
  // Manual database migrations do not require admin/session configuration.
  if (build) assertAuthConfiguration();
  if (typeof globalThis.WebSocket !== "function") throw new Error("Database migration requires Node.js 22 or 24 with WebSocket support.");
  neonConfig.webSocketConstructor = globalThis.WebSocket;
  const [migrationSql, verificationSql] = await Promise.all([
    readFile(new URL("../database/migration.sql", import.meta.url), "utf8"),
    readFile(new URL("../database/verify.sql", import.meta.url), "utf8"),
  ]);
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000, query_timeout: 180000 });
  client.on("error", () => {}); // The pending query/connect promise reports failure.
  try {
    console.log("Creating and verifying the inventory database schema…");
    try { await client.connect(); } catch (error) { throw new MigrationError("connecting to Neon", error); }
    const report = await applyMigration(client, { migrationSql, verificationSql });
    console.log("Database schema verified: " + report.app_tables + " app tables. Existing inventory preserved.");
    if (report.configured_inr_per_gbp === null || Number(report.active_vendors) === 0) {
      console.log("After deployment, add your vendors and exchange rate in Settings.");
    }
    if (Number(report.products_needing_sku_backfill) > 0) console.log("Existing products need SKU backfill: run npm run backfill:skus.");
  } finally {
    await client.end().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message ?? "Database migration could not start.");
    process.exitCode = 1;
  });
}

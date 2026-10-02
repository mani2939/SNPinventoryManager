import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { applyMigration, migrationMode } from "../scripts/migrate.mjs";
import { generateBarcode } from "../lib/barcode.ts";

const files = async () => ({
  migrationSql: await readFile("database/migration.sql", "utf8"),
  verificationSql: await readFile("database/verify.sql", "utf8"),
});
// Adapt PGlite's multi-statement API to the pg-compatible Client result shape.
const clientFor = (pg) => ({
  async query(sql) {
    const result = await pg.exec(sql);
    return result.length === 1 ? result[0] : result;
  },
});

test("deployment migration creates the schema and preserves a saved product on redeployment", async () => {
  const pg = new PGlite();
  try {
    const sql = await files();
    const first = await applyMigration(clientFor(pg), sql);
    assert.equal(first.app_tables, 5);
    const vendor = (await pg.query("insert into vendors(name) values('Test') returning id")).rows[0].id;
    await pg.query("update settings set exchange_rate=100 where id=1");
    const sku = "TES-BAZCK-001", svg = generateBarcode(sku);
    await pg.query("insert into sku_reservations(sku,vendor_id,unit_gbp,exchange_rate,barcode_svg,redeemed) values($1,$2,12.34,100,$3,true)", [sku,vendor,svg]);
    await pg.query("insert into products(item_name,vendor_id,price_inr,quantity,exchange_rate,sku,barcode_svg) values('Saved necklace',$1,1234,1,100,$2,$3)",[vendor,sku,svg]);
    const original = (await pg.query("select * from products")).rows[0];
    const second = await applyMigration(clientFor(pg), sql);
    assert.equal(second.app_tables,5);
    assert.equal(second.configured_inr_per_gbp,"100.0000");
    assert.deepEqual((await pg.query("select * from products")).rows[0], original);
  } finally { await pg.close(); }
});

test("a failed verification rolls back creation and leaves existing data untouched", async () => {
  const pg = new PGlite();
  try {
    const sql = await files();
    const broken = {...sql, verificationSql:"alter table products disable trigger product_identity_guard;\n"+sql.verificationSql};
    await assert.rejects(()=>applyMigration(clientFor(pg),broken),/verifying the schema/);
    assert.equal((await pg.query("select to_regclass('public.products') as table_id")).rows[0].table_id,null);
    await applyMigration(clientFor(pg),sql);
    await pg.query("insert into vendors(name) values('Keep this vendor')");
    await assert.rejects(()=>applyMigration(clientFor(pg),broken),/verifying the schema/);
    assert.equal((await pg.query("select name from vendors")).rows[0].name,"Keep this vendor");
    assert.equal((await pg.query("select tgenabled from pg_trigger where tgname='product_identity_guard'")).rows[0].tgenabled,"O");
  } finally { await pg.close(); }
});

test("Vercel requires a database even with demo mode; local builds remain offline",()=>{
  assert.equal(migrationMode({build:true,env:{}}),"skip-local-build");
  assert.throws(()=>migrationMode({build:true,env:{VERCEL:"1",DEMO_MODE:"true"}}),/DATABASE_URL is required/);
  assert.throws(()=>migrationMode({build:false,env:{}}),/DATABASE_URL is required/);
  assert.throws(()=>migrationMode({build:true,env:{VERCEL:"1",DATABASE_URL:"invalid-secret"}}),/valid PostgreSQL/);
  assert.equal(migrationMode({build:true,env:{VERCEL:"1",DATABASE_URL:"postgresql://owner:secret@ep-example-pooler.neon.tech/neondb?sslmode=require"}}),"migrate");
});

test("the real npm build stops in prebuild when Vercel lacks DATABASE_URL",()=>{
  const result=spawnSync("npm",["run","build"],{encoding:"utf8",env:{...process.env,VERCEL:"1",DATABASE_URL:"",DEMO_MODE:"true"}});
  assert.equal(result.status,1);
  assert.match(result.stdout+result.stderr,/DATABASE_URL is required/);
  assert.doesNotMatch(result.stdout,/Creating an optimized production build/);
});

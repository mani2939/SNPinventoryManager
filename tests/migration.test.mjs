import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { applyMigration, migrationMode } from "../scripts/migrate.mjs";
import { generateBarcode } from "../lib/barcode.ts";
import { anonymousVendorCode } from "../lib/sku.ts";
import { reserveSkuSql, saveNewProductSql } from "../lib/product-sql.ts";

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
    assert.equal(first.app_tables, 9);
    const vendor = (await pg.query("insert into vendors(name,pseudo_code) values('Test','V01') returning id")).rows[0].id;
    await pg.query("update settings set exchange_rate=100 where id=1");
    const sku = "V01-BAZCK-001", svg = generateBarcode(sku);
    await pg.query("insert into sku_reservations(sku,vendor_id,unit_gbp,exchange_rate,barcode_svg,redeemed) values($1,$2,12.34,100,$3,true)", [sku,vendor,svg]);
    await pg.query("insert into products(item_name,vendor_id,price_inr,quantity,exchange_rate,sku,barcode_svg) values('Saved necklace',$1,1234,1,100,$2,$3)",[vendor,sku,svg]);
    const original = (await pg.query("select * from products")).rows[0];
    const second = await applyMigration(clientFor(pg), sql);
    assert.equal(second.app_tables,9);
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
    await pg.query("insert into vendors(name,pseudo_code) values('Keep this vendor','V02')");
    await assert.rejects(()=>applyMigration(clientFor(pg),broken),/verifying the schema/);
    assert.equal((await pg.query("select name from vendors")).rows[0].name,"Keep this vendor");
    assert.equal((await pg.query("select tgenabled from pg_trigger where tgname='product_identity_guard'")).rows[0].tgenabled,"O");
  } finally { await pg.close(); }
});

test("upgrading the previous schema assigns anonymous unique codes and preserves saved identities", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(await readFile("tests/fixtures/legacy-migration.sql","utf8"));
    const ids=["00000100-0000-4000-8000-000000000001","00000100-0000-4000-8000-000000000002"];
    for (const [i,id] of ids.entries()) await pg.query("insert into vendors(id,name) values($1,$2)",[id,"Private supplier "+i]);
    const sku="PRI-BAZCK-001",svg=generateBarcode(sku);
    await pg.query("insert into sku_reservations(sku,vendor_id,unit_gbp,exchange_rate,barcode_svg,redeemed) values($1,$2,12.34,100,$3,true)",[sku,ids[0],svg]);
    await pg.query("insert into products(item_name,vendor_id,price_inr,quantity,exchange_rate,sku,barcode_svg) values('Legacy necklace',$1,1234,1,100,$2,$3)",[ids[0],sku,svg]);
    const before=(await pg.query("select * from products")).rows[0];
    const sql=await files();
    await applyMigration(clientFor(pg),sql);
    const vendors=(await pg.query("select * from vendors order by id")).rows;
    assert.deepEqual(vendors.map(v=>v.pseudo_code),[anonymousVendorCode(ids[0]),anonymousVendorCode(ids[1],1)]);
    assert.deepEqual((await pg.query("select * from products")).rows[0],{...before,product_type_id:null});
    await pg.query("update vendors set name='Renamed supplier',pseudo_code='Q99' where id=$1",[ids[0]]);
    await applyMigration(clientFor(pg),sql);
    assert.equal((await pg.query("select pseudo_code from vendors where id=$1",[ids[0]])).rows[0].pseudo_code,"Q99");
    assert.deepEqual((await pg.query("select * from products")).rows[0],{...before,product_type_id:null});
    await assert.rejects(()=>pg.query("insert into vendors(name,pseudo_code) values('Duplicate','Q99')"));
    await assert.rejects(()=>pg.query("insert into vendors(name,pseudo_code) values('Invalid','long-code')"));
    await assert.rejects(()=>pg.query("insert into vendors(name) values('Missing code')"));
  } finally {await pg.close();}
});

test("product type constraints, archival and stale vendor-code claims are enforced by PostgreSQL", async () => {
  const pg=new PGlite();
  try {
    await pg.exec(await readFile("database/setup.sql","utf8"));
    await pg.exec(await readFile("database/setup.sql","utf8"));
    const vendor=(await pg.query("insert into vendors(name,pseudo_code) values('Secret name','Z01') returning id")).rows[0].id;
    const type=(await pg.query("insert into product_types(name) values('Necklace sets') returning id")).rows[0].id;
    await assert.rejects(()=>pg.query("insert into product_types(name) values('NECKLACE SETS')"));
    const sku="Z01-BAZCK-001",svg=generateBarcode(sku);
    assert.equal((await pg.query(reserveSkuSql,[sku,vendor,12.34,100,svg,'OLD'])).rows.length,0);
    const token=(await pg.query(reserveSkuSql,[sku,vendor,12.34,100,svg,'Z01'])).rows[0].token;
    assert.equal((await pg.query(reserveSkuSql,[sku,vendor,12.34,100,svg,'Z01'])).rows.length,0);
    const params=['Typed necklace','',vendor,'2026-10-03',1234,1,0,0,100,null,token,12.34,type];
    await pg.query("update vendors set pseudo_code='Z02' where id=$1",[vendor]);
    assert.equal((await pg.query(saveNewProductSql,params)).rows.length,0);
    assert.equal((await pg.query("select redeemed from sku_reservations where token=$1",[token])).rows[0].redeemed,false);
    await pg.query("update vendors set pseudo_code='Z01' where id=$1",[vendor]);
    await pg.query("update product_types set active=false where id=$1",[type]);
    await assert.rejects(()=>pg.query(saveNewProductSql,params));
    assert.equal((await pg.query("select redeemed from sku_reservations where token=$1",[token])).rows[0].redeemed,false);
    await pg.query("update product_types set active=true where id=$1",[type]);
    const saved=(await pg.query(saveNewProductSql,params)).rows[0];
    assert.equal(saved.product_type_id,type);
    await pg.query("update product_types set active=false where id=$1",[type]);
    await pg.query("update products set description='Edited with archived type' where id=$1",[saved.id]);
    await assert.rejects(()=>pg.query("delete from product_types where id=$1",[type]));
    await pg.exec("create role type_untrusted; set role type_untrusted;");
    await assert.rejects(()=>pg.query("select * from product_types"));
    await pg.exec("reset role;");
  } finally {await pg.close();}
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

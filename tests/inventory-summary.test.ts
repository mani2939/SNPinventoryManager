import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { inventorySummarySql, productFilter, summarizeInventory } from "../lib/inventory-summary";
import type { Product } from "../lib/types";

test("PostgreSQL filtered totals include every page, stored exchange rates and quantity-weighted retail values", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`create table products (id int, vendor_id text, entry_date date, sku text,
      quantity int, total_before_discount numeric, total_after_discount numeric,
      shipping_amount numeric, final_total_inr numeric, batch_gbp numeric, retail_gbp numeric);
      insert into products select n,'a','2026-01-15','SKU-'||n,2,200,180,9,189,1.89,2.85 from generate_series(1,26) n;
      insert into products values(27,'a','2025-12-31','OLD',3,300,300,0,300,1.5,1.5),
        (28,'b','2026-01-15','OTHER',1,100,100,0,100,2,6);`);
    const selected = productFilter({page:2,vendor:"a",from:"2026-01-15",to:"2026-01-15"});
    const summary = async (f: ReturnType<typeof productFilter>) => Object.fromEntries(Object.entries((await pg.query<Record<string,string>>(inventorySummarySql(f.clause), f.params)).rows[0]).map(([k,v])=>[k,Number(v)]));
    assert.deepEqual(await summary(selected), {count:26,quantity:52,total_before_discount:5200,
      discount_amount:520,total_after_discount:4680,shipping_amount:234,final_total_inr:4914,
      batch_gbp:49.14,retail_value_gbp:148.2});
    assert.equal((await pg.query(`select id from products p ${selected.clause} order by id limit 25 offset 25`,selected.params)).rows.length,1);
    assert.equal((await summary(productFilter({page:1,vendor:"a"}))).batch_gbp,50.64);
    assert.equal((await summary(productFilter({page:1,sku:"OTHER"}))).retail_value_gbp,6);
    const empty = await summary(productFilter({page:1,vendor:"missing"}));
    assert.ok(Object.values(empty).every(v=>v===0));
    await pg.exec("delete from products where id=26");
    assert.equal((await summary(selected)).final_total_inr,4725);
    const rows = (await pg.query(`select * from products p ${selected.clause}`,selected.params)).rows as unknown as Product[];
    // Demo and PostgreSQL must agree on money arithmetic (including 0.1/0.2 precision).
    assert.deepEqual(summarizeInventory(rows), Object.fromEntries(Object.entries(await summary(selected)).filter(([k])=>k!=="count")));
    assert.equal(summarizeInventory([{...rows[0],batch_gbp:0.1},{...rows[0],batch_gbp:0.2}]).batch_gbp,0.3);
    assert.ok(Object.values(summarizeInventory([])).every(v=>v===0));
  } finally { await pg.close(); }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { calculatePricing } from "../lib/pricing";
import { buildSku } from "../lib/sku";
import { generateBarcode } from "../lib/barcode";
test("real PostgreSQL migration, pricing trigger, constraints, RLS and persistent login limiter", async () => {
  const pg = new PGlite();
  try {
    await pg.exec("create role untrusted;");
    const sql = await readFile("database/migration.sql", "utf8");
    await pg.exec(sql);
    await pg.exec(sql);
    const v = await pg.query<{ id: string }>(
      "insert into vendors(name) values('Test vendor') returning id",
    );
    const vendor = v.rows[0].id;
    for (const input of [
      {
        price_inr: 1000,
        quantity: 10,
        discount_percent: 10,
        shipping_percent: 5,
        exchange_rate: 100,
      },
      {
        price_inr: 0.05,
        quantity: 3,
        discount_percent: 10,
        shipping_percent: 5,
        exchange_rate: 1,
      },
      {
        price_inr: 1299.99,
        quantity: 7,
        discount_percent: 12.25,
        shipping_percent: 3.15,
        exchange_rate: 117.4231,
      },
      {
        price_inr: 9999999.99,
        quantity: 100000,
        discount_percent: 0,
        shipping_percent: 1000,
        exchange_rate: 0.0001,
      },
    ]) {
      const expected = calculatePricing(input);
      const sku = buildSku("Test vendor", expected.unit_gbp, 1);
      const barcode = generateBarcode(sku);
      await pg.query(
        "insert into sku_reservations(sku,vendor_id,unit_gbp,exchange_rate,barcode_svg,redeemed) values($1,$2,$3,$4,$5,true)",
        [sku, vendor, expected.unit_gbp, input.exchange_rate, barcode],
      );
      const p = await pg.query<Record<string, unknown>>(
        "insert into products(item_name,vendor_id,price_inr,quantity,discount_percent,shipping_percent,exchange_rate,sku,barcode_svg) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *",
        [
          "Test product",
          vendor,
          input.price_inr,
          input.quantity,
          input.discount_percent,
          input.shipping_percent,
          input.exchange_rate,
          sku,
          barcode,
        ],
      );
      for (const [k, value] of Object.entries(expected))
        assert.equal(Number(p.rows[0][k]), value, k);
      await assert.rejects(() =>
        pg.query("update products set sku=null where id=$1", [p.rows[0].id]),
      );
      await assert.rejects(() =>
        pg.query("update products set barcode_svg='forged' where id=$1", [
          p.rows[0].id,
        ]),
      );
      const changed = await pg.query<{ sku: string }>(
        "update products set price_inr=price_inr/2 where id=$1 returning sku",
        [p.rows[0].id],
      );
      assert.equal(changed.rows[0].sku, sku);
    }
    await assert.rejects(() =>
      pg.query(
        "insert into products(item_name,vendor_id,price_inr,quantity,exchange_rate) values($1,$2,100,0,100)",
        ["Bad", vendor],
      ),
    );
    await pg.exec("set role untrusted;");
    await assert.rejects(() => pg.query("select * from products"));
    await assert.rejects(() => pg.query("select * from sku_reservations"));
    await assert.rejects(() => pg.query("select consume_login_attempt('x')"));
    await pg.exec("reset role;");
    for (let i = 0; i < 10; i++) {
      const r = await pg.query<{ allowed: boolean }>(
        "select consume_login_attempt('test') as allowed",
      );
      assert.equal(r.rows[0].allowed, true);
    }
    const blocked = await pg.query<{ allowed: boolean }>(
      "select consume_login_attempt('test') as allowed",
    );
    assert.equal(blocked.rows[0].allowed, false);
    await pg.exec(
      "update login_limits set window_start=now()-interval '16 minutes' where key='test'",
    );
    const reset = await pg.query<{ allowed: boolean }>(
      "select consume_login_attempt('test') as allowed",
    );
    assert.equal(reset.rows[0].allowed, true);
  } finally {
    await pg.close();
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { buildSku, encodePrice, vendorPrefix } from "../lib/sku";
import { generateBarcode } from "../lib/barcode";
import { skuSchema } from "../lib/validation";
import { saveNewProductSql } from "../lib/product-sql";

test("BACKGROUND encodes GBP including pence and preserves all three suffix digits", () => {
  assert.equal(encodePrice("1234567890.12"), "BACKGROUNDZBA");
  assert.equal(buildSku("V01", 12.34, 1), "V01-BAZCK-001");
  assert.equal(buildSku("V02", 9.45, 0), "V02-NZKG-000");
  assert.equal(buildSku("Tes", 0, 999), "TES-DZDD-999");
  assert.equal(encodePrice("1.005"), "BZDB");
  assert.throws(() => vendorPrefix("Jaipur"));
  assert.equal(vendorPrefix(" v01 "), "V01");
  assert.throws(() => encodePrice(-1));
  assert.throws(() => buildSku("Tes", 1, 1000));
  assert.equal(skuSchema.safeParse("tes-bazck-001").success, true);
  assert.equal(skuSchema.safeParse("TES-XYZ-001").success, false);
  const svg = generateBarcode("TES-BAZCK-001");
  assert.match(svg, /<svg/);
  assert.match(svg, /<path/);
  assert.doesNotMatch(svg, /<script/);
});

test("Postgres reservations are unique and claims plus product saves are atomic", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(await readFile("database/migration.sql", "utf8"));
    const vendor = (
      await pg.query<{ id: string }>(
        "insert into vendors(name,pseudo_code) values('Test','V01') returning id",
      )
    ).rows[0].id;
    const sku = buildSku("V01", 12.34, 1),
      svg = generateBarcode(sku);
    const token = (
      await pg.query<{ token: string }>(
        "insert into sku_reservations(sku,vendor_id,unit_gbp,exchange_rate,barcode_svg) values($1,$2,12.34,100,$3) returning token",
        [sku, vendor, svg],
      )
    ).rows[0].token;
    const duplicate = await pg.query(
      "insert into sku_reservations(sku,vendor_id,unit_gbp,exchange_rate,barcode_svg) values($1,$2,12.34,100,$3) on conflict(sku) do nothing returning *",
      [sku, vendor, svg],
    );
    assert.equal(duplicate.rows.length, 0);
    await assert.rejects(() =>
      pg.query(
        "insert into products(item_name,vendor_id,price_inr,quantity,exchange_rate) values($1,$2,1234,1,100)",
        ["Missing SKU", vendor],
      ),
    );
    const params = [
      "Necklace",
      "",
      vendor,
      "2026-10-02",
      1234,
      1,
      0,
      0,
      100,
      null,
      token,
      12.34,
      null,
    ];
    // A mismatched GBP cost cannot claim this reservation.
    assert.equal(
      (await pg.query(saveNewProductSql, [...params.slice(0, 11), 99, null])).rows
        .length,
      0,
    );
    // A failed product constraint rolls back the reservation claim too.
    await assert.rejects(() =>
      pg.query(saveNewProductSql, ["", ...params.slice(1)]),
    );
    assert.equal(
      (
        await pg.query<{ redeemed: boolean }>(
          "select redeemed from sku_reservations where token=$1",
          [token],
        )
      ).rows[0].redeemed,
      false,
    );
    const first = await pg.query<{ sku: string; barcode_svg: string }>(
      saveNewProductSql,
      params,
    );
    assert.equal(first.rows[0].sku, sku);
    assert.equal(first.rows[0].barcode_svg, svg);
    assert.equal((await pg.query(saveNewProductSql, params)).rows.length, 0);
    assert.equal((await pg.query("select * from products")).rows.length, 1);
    await pg.query("delete from products where sku=$1", [sku]);
    assert.equal(
      (
        await pg.query<{ redeemed: boolean }>(
          "select redeemed from sku_reservations where token=$1",
          [token],
        )
      ).rows[0].redeemed,
      true,
    );
  } finally {
    await pg.close();
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { calculatePricing } from "../lib/pricing";
import { productSchema, settingsSchema, vendorSchema, vendorUpdateSchema, productTypeUpdateSchema } from "../lib/validation";
test("landed cost, per-piece conversion and fixed 3× retail", () => {
  assert.deepEqual(
    calculatePricing({
      price_inr: 1000,
      quantity: 10,
      discount_percent: 10,
      shipping_percent: 5,
      exchange_rate: 100,
    }),
    {
      total_before_discount: 10000,
      total_after_discount: 9000,
      shipping_amount: 450,
      final_total_inr: 9450,
      batch_gbp: 94.5,
      unit_gbp: 9.45,
      retail_gbp: 28.35,
    },
  );
});

test("vendor pseudonyms normalize and configuration updates require valid changes",()=>{
  assert.equal(vendorSchema.parse({name:"Hidden supplier",pseudo_code:" v01 "}).pseudo_code,"V01");
  for (const pseudo_code of ["", "V", "V01X", "V-1", "supplier"])
    assert.equal(vendorSchema.safeParse({name:"Hidden supplier",pseudo_code}).success,false);
  const id="00000000-0000-4000-8000-000000000001";
  assert.equal(vendorUpdateSchema.safeParse({id}).success,false);
  assert.equal(productTypeUpdateSchema.safeParse({id}).success,false);
  assert.equal(vendorUpdateSchema.safeParse({id,active:false}).success,true);
});
test("half-up money rounding avoids floating-point drift", () => {
  const p = calculatePricing({
    price_inr: 0.05,
    quantity: 3,
    discount_percent: 10,
    shipping_percent: 5,
    exchange_rate: 1,
  });
  assert.equal(p.total_before_discount, 0.15);
  assert.equal(p.total_after_discount, 0.14);
  assert.equal(p.shipping_amount, 0.01);
  assert.equal(p.final_total_inr, 0.15);
  assert.equal(p.unit_gbp, 0.05);
  assert.equal(p.retail_gbp, 0.15);
});
test("100% discount zeroes landed cost including shipping", () => {
  const p = calculatePricing({
    price_inr: 1000,
    quantity: 5,
    discount_percent: 100,
    shipping_percent: 100,
    exchange_rate: 110,
  });
  assert.equal(p.final_total_inr, 0);
  assert.equal(p.retail_gbp, 0);
});
test("reject invalid quantity, percentages, precision, dates and rates", () => {
  const base = {
    item_name: "Necklace",
    description: "",
    vendor_id: "a555af5c-d971-4f41-b818-3ee167614f6b",
    entry_date: "2026-10-02",
    price_inr: 100,
    quantity: 1,
    discount_percent: 0,
    shipping_percent: 0,
    photo_key: null,
  };
  for (const patch of [
    { quantity: 0 },
    { quantity: 1.5 },
    { price_inr: -1 },
    { price_inr: 0.001 },
    { discount_percent: 101 },
    { shipping_percent: -1 },
    { entry_date: "2026-02-30" },
    { photo_key: "../secrets" },
  ])
    assert.equal(productSchema.safeParse({ ...base, ...patch }).success, false);
  for (const value of [0, -1, Infinity, NaN, 100001, 1.23456])
    assert.equal(
      settingsSchema.safeParse({ exchange_rate: value }).success,
      false,
    );
});

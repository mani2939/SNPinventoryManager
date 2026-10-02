import "server-only";
import { randomUUID, randomInt } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { query } from "./database";
import { demoMode } from "./auth";
import { HttpError } from "./http";
import { calculatePricing } from "./pricing";
import { buildSku } from "./sku";
import { generateBarcode } from "./barcode";
import { saveNewProductSql } from "./product-sql";
import type { Product, Settings, Vendor, SkuReservation } from "./types";
import type { productSchema, reservationSchema } from "./validation";
import type { z } from "zod";
type Demo = {
  vendors: Vendor[];
  settings: Settings;
  products: Product[];
  reservations: SkuReservation[];
};
const demoFile = path.join(process.cwd(), ".demo-data", "data.json");
let queue: Promise<unknown> = Promise.resolve();
async function readDemo(): Promise<Demo> {
  try {
    const data = JSON.parse(await readFile(demoFile, "utf8"));
    return { ...data, reservations: data.reservations || [] };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    return {
      vendors: [],
      settings: { id: 1, exchange_rate: null },
      products: [],
      reservations: [],
    };
  }
}
async function mutateDemo<T>(fn: (d: Demo) => T): Promise<T> {
  const task = queue.then(async () => {
    const d = await readDemo();
    const result = fn(d);
    await mkdir(path.dirname(demoFile), { recursive: true });
    await writeFile(`${demoFile}.tmp`, JSON.stringify(d));
    await rename(`${demoFile}.tmp`, demoFile);
    return result;
  });
  queue = task.catch(() => {});
  return task;
}
function productRow(row: Record<string, unknown>): Product {
  const result = { ...row };
  for (const k of [
    "price_inr",
    "quantity",
    "discount_percent",
    "shipping_percent",
    "exchange_rate",
    "total_before_discount",
    "total_after_discount",
    "shipping_amount",
    "final_total_inr",
    "batch_gbp",
    "unit_gbp",
    "retail_gbp",
  ])
    result[k] = Number(result[k]);
  if (result.vendor_name) result.vendors = { name: result.vendor_name };
  delete result.vendor_name;
  return result as Product;
}
function reservationRow(row: Record<string, unknown>): SkuReservation {
  return {
    ...row,
    unit_gbp: Number(row.unit_gbp),
    exchange_rate: Number(row.exchange_rate),
  } as SkuReservation;
}
export async function getConfig() {
  if (demoMode()) {
    const d = await readDemo();
    return { vendors: d.vendors, settings: d.settings, demo: true };
  }
  const [vendors, settings] = await Promise.all([
    query<Vendor>("select id,name,active from vendors order by name"),
    query<Record<string, unknown>>("select * from settings where id=1"),
  ]);
  if (!settings[0]) throw new Error("Run the database migration.");
  return {
    vendors,
    settings: {
      id: 1,
      exchange_rate:
        settings[0].exchange_rate === null
          ? null
          : Number(settings[0].exchange_rate),
    },
    demo: false,
  };
}
export async function addVendor(name: string) {
  if (demoMode())
    return mutateDemo((d) => {
      if (d.vendors.some((v) => v.name.toLowerCase() === name.toLowerCase()))
        throw new HttpError("A vendor with this name already exists.", 409);
      const v = { id: randomUUID(), name, active: true };
      d.vendors.push(v);
      return v;
    });
  try {
    return (
      await query<Vendor>(
        "insert into vendors(name) values($1) returning id,name,active",
        [name],
      )
    )[0];
  } catch (e) {
    if ((e as { code?: string }).code === "23505")
      throw new HttpError("A vendor with this name already exists.", 409);
    throw e;
  }
}
export async function setVendorActive(id: string, active: boolean) {
  if (demoMode())
    return mutateDemo((d) => {
      const v = d.vendors.find((v) => v.id === id);
      if (!v) throw new HttpError("Vendor not found.", 404);
      v.active = active;
      return v;
    });
  const r = await query<Vendor>(
    "update vendors set active=$2 where id=$1 returning id,name,active",
    [id, active],
  );
  if (!r[0]) throw new HttpError("Vendor not found.", 404);
  return r[0];
}
export async function setRate(exchange_rate: number) {
  if (demoMode())
    return mutateDemo((d) => {
      d.settings.exchange_rate = exchange_rate;
      return d.settings;
    });
  const r = await query<Record<string, unknown>>(
    "update settings set exchange_rate=$1 where id=1 returning *",
    [exchange_rate],
  );
  if (!r[0]) throw new Error("Run the database migration.");
  return { id: 1, exchange_rate: Number(r[0].exchange_rate) };
}
export type Filters = {
  vendor?: string;
  from?: string;
  to?: string;
  sku?: string;
  page: number;
};
export async function listProducts(f: Filters) {
  if (demoMode()) {
    const d = await readDemo();
    const rows = d.products
      .filter(
        (p) =>
          (!f.vendor || p.vendor_id === f.vendor) &&
          (!f.from || p.entry_date >= f.from) &&
          (!f.to || p.entry_date <= f.to) &&
          (!f.sku || p.sku === f.sku),
      )
      .sort(
        (a, b) =>
          b.entry_date.localeCompare(a.entry_date) ||
          b.created_at.localeCompare(a.created_at),
      );
    return {
      products: rows
        .slice((f.page - 1) * 25, f.page * 25)
        .map((p) => ({
          ...p,
          vendors: {
            name:
              d.vendors.find((v) => v.id === p.vendor_id)?.name || "Unknown",
          },
        })),
      count: rows.length,
    };
  }
  const params: unknown[] = [],
    where: string[] = [];
  for (const [field, operator, value] of [
    ["vendor_id", "=", f.vendor],
    ["entry_date", ">=", f.from],
    ["entry_date", "<=", f.to],
    ["sku", "=", f.sku],
  ])
    if (value) {
      params.push(value);
      where.push(`p.${field} ${operator} $${params.length}`);
    }
  const clause = where.length ? "where " + where.join(" and ") : "";
  const [rows, count] = await Promise.all([
    query<Record<string, unknown>>(
      `select p.*,v.name as vendor_name from products p join vendors v on v.id=p.vendor_id ${clause} order by p.entry_date desc,p.created_at desc,p.id limit 25 offset $${params.length + 1}`,
      [...params, (f.page - 1) * 25],
    ),
    query<{ count: string }>(
      `select count(*) from products p ${clause}`,
      params,
    ),
  ]);
  return { products: rows.map(productRow), count: Number(count[0].count) };
}
export async function getProduct(id: string): Promise<Product | null> {
  if (demoMode())
    return (await readDemo()).products.find((p) => p.id === id) || null;
  const r = await query<Record<string, unknown>>(
    "select * from products where id=$1",
    [id],
  );
  return r[0] ? productRow(r[0]) : null;
}
async function getReservation(token: string): Promise<SkuReservation | null> {
  if (demoMode())
    return (
      (await readDemo()).reservations.find((r) => r.token === token) || null
    );
  const r = await query<Record<string, unknown>>(
    "select * from sku_reservations where token=$1",
    [token],
  );
  return r[0] ? reservationRow(r[0]) : null;
}
export async function reserveSku(input: z.infer<typeof reservationSchema>) {
  const { vendors, settings } = await getConfig();
  const vendor = vendors.find((v) => v.id === input.vendor_id && v.active);
  if (!vendor) throw new HttpError("Select an active vendor.");
  if (!settings.exchange_rate)
    throw new HttpError("Set your exchange rate first.");
  const rate = settings.exchange_rate;
  const unit = calculatePricing({ ...input, exchange_rate: rate }).unit_gbp;
  const start = randomInt(1000);
  if (demoMode())
    return mutateDemo((d) => {
      for (let n = 0; n < 1000; n++) {
        const sku = buildSku(vendor.name, unit, (start + n) % 1000);
        if (
          d.reservations.some((r) => r.sku === sku) ||
          d.products.some((p) => p.sku === sku)
        )
          continue;
        const r = {
          token: randomUUID(),
          sku,
          barcode_svg: generateBarcode(sku),
          vendor_id: vendor.id,
          unit_gbp: unit,
          exchange_rate: rate,
          redeemed: false,
        };
        d.reservations.push(r);
        return r;
      }
      throw new HttpError(
        "All 1,000 suffixes for this vendor prefix and price have been used. A longer suffix is needed.",
        409,
      );
    });
  const prefix = buildSku(vendor.name, unit, 0).slice(0, -3);
  const used = new Set(
    (
      await query<{ sku: string }>(
        "select sku from sku_reservations where sku like $1",
        [prefix + "%"],
      )
    ).map((r) => r.sku),
  );
  for (let n = 0; n < 1000; n++) {
    const sku = buildSku(vendor.name, unit, (start + n) % 1000);
    if (used.has(sku)) continue;
    const svg = generateBarcode(sku);
    const r = await query<Record<string, unknown>>(
      "insert into sku_reservations(sku,vendor_id,unit_gbp,exchange_rate,barcode_svg) values($1,$2,$3,$4,$5) on conflict(sku) do nothing returning *",
      [sku, vendor.id, unit, rate, svg],
    );
    if (r[0]) return reservationRow(r[0]);
  }
  throw new HttpError(
    "All 1,000 suffixes for this vendor prefix and price have been used. A longer suffix is needed.",
    409,
  );
}
export async function saveProduct(
  input: z.infer<typeof productSchema>,
  id?: string,
) {
  const { vendors } = await getConfig();
  const old = id ? await getProduct(id) : null;
  if (id && !old) throw new HttpError("Product not found.", 404);
  if (old && !old.sku)
    throw new HttpError(
      "Run the SKU backfill before editing older products.",
      409,
    );
  const vendor = vendors.find((v) => v.id === input.vendor_id);
  if (!vendor || (!vendor.active && old?.vendor_id !== input.vendor_id))
    throw new HttpError("Select an active vendor.");
  const reserved =
    !old?.sku && input.sku_token ? await getReservation(input.sku_token) : null;
  if (!old?.sku && !reserved)
    throw new HttpError("Generate the SKU and barcode before saving.");
  const rate = old?.exchange_rate || reserved!.exchange_rate;
  const pricing = calculatePricing({ ...input, exchange_rate: rate });
  if (
    reserved &&
    (reserved.vendor_id !== input.vendor_id ||
      reserved.unit_gbp !== pricing.unit_gbp ||
      reserved.exchange_rate !== rate)
  )
    throw new HttpError(
      "Pricing changed. Generate a new SKU before saving.",
      409,
    );
  const { updated_at, sku_token, ...fields } = input;
  const values = { ...fields, exchange_rate: rate };
  const sku = old?.sku || reserved!.sku;
  const barcode_svg = old?.barcode_svg || reserved!.barcode_svg;
  if (demoMode())
    return mutateDemo((d) => {
      const reservation = reserved
        ? d.reservations.find((r) => r.token === reserved.token)
        : null;
      if (reservation?.redeemed && !id) {
        const p = d.products.find((p) => p.sku === sku);
        if (p && matches(p, values)) return p;
        throw new HttpError(
          "This SKU was already saved. Generate a new one.",
          409,
        );
      }
      if (
        input.photo_key &&
        d.products.some((p) => p.id !== id && p.photo_key === input.photo_key)
      )
        throw new HttpError(
          "This photo belongs to another product. Upload it again.",
          409,
        );
      const now = new Date().toISOString();
      if (id) {
        const index = d.products.findIndex((p) => p.id === id);
        if (index < 0) throw new HttpError("Product not found.", 404);
        if (d.products[index].updated_at !== updated_at)
          throw new HttpError(
            "This product changed. Refresh and try again.",
            409,
          );
        if (reservation) reservation.redeemed = true;
        const p = {
          ...d.products[index],
          ...values,
          ...pricing,
          sku,
          barcode_svg,
          updated_at: now,
        };
        d.products[index] = p;
        return p;
      }
      if (!reservation || reservation.redeemed)
        throw new HttpError("Generate a new SKU before saving.", 409);
      reservation.redeemed = true;
      const p = {
        ...values,
        ...pricing,
        sku,
        barcode_svg,
        id: randomUUID(),
        created_at: now,
        updated_at: now,
      };
      d.products.push(p);
      return p;
    });
  const params = [
    fields.item_name,
    fields.description,
    fields.vendor_id,
    fields.entry_date,
    fields.price_inr,
    fields.quantity,
    fields.discount_percent,
    fields.shipping_percent,
    rate,
    fields.photo_key,
  ];
  let rows: Record<string, unknown>[];
  try {
    if (id) {
      rows = await query<Record<string, unknown>>(
        "update products set item_name=$1,description=$2,vendor_id=$3,entry_date=$4,price_inr=$5,quantity=$6,discount_percent=$7,shipping_percent=$8,exchange_rate=$9,photo_key=$10 where id=$11 and updated_at=$12 returning *",
        [...params, id, updated_at || null],
      );
    } else {
      rows = await query<Record<string, unknown>>(
        saveNewProductSql,
        [...params, reserved!.token, pricing.unit_gbp],
      );
      if (!rows.length) {
        const saved = await query<Record<string, unknown>>(
          "select * from products where sku=$1",
          [sku],
        );
        if (saved[0] && matches(productRow(saved[0]), values))
          return productRow(saved[0]);
        throw new HttpError(
          "This SKU was already saved. Generate a new one.",
          409,
        );
      }
    }
  } catch (e) {
    if ((e as { code?: string }).code === "23505")
      throw new HttpError("This photo or SKU belongs to another product.", 409);
    throw e;
  }
  if (!rows.length)
    throw new HttpError("This product changed. Refresh and try again.", 409);
  return productRow(rows[0]);
}
function matches(p: Product, values: Record<string, unknown>) {
  return Object.entries(values).every(([k, v]) => p[k as keyof Product] === v);
}
export async function deleteProduct(id: string, version: string) {
  if (demoMode())
    return mutateDemo((d) => {
      const p = d.products.find((p) => p.id === id);
      if (!p) throw new HttpError("Product not found.", 404);
      if (p.updated_at !== version)
        throw new HttpError(
          "This product changed. Refresh and try again.",
          409,
        );
      d.products = d.products.filter((p) => p.id !== id);
    });
  const r = await query(
    "delete from products where id=$1 and updated_at=$2 returning id",
    [id, version],
  );
  if (!r.length)
    throw new HttpError("This product changed. Refresh and try again.", 409);
}

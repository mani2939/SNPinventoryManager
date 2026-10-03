import "server-only";
import { randomUUID, randomInt } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { query } from "./database";
import { demoMode } from "./auth";
import { HttpError } from "./http";
import { calculatePricing } from "./pricing";
import { buildSku, anonymousVendorCode } from "./sku";
import { generateBarcode } from "./barcode";
import { reserveSkuSql, saveNewProductSql } from "./product-sql";
import type { Product, ProductType, Settings, Vendor, SkuReservation } from "./types";
import type { productSchema, reservationSchema } from "./validation";
import type { z } from "zod";
type Demo = {
  vendors: Vendor[];
  productTypes: ProductType[];
  settings: Settings;
  products: Product[];
  reservations: SkuReservation[];
};
const demoFile = path.join(process.cwd(), ".demo-data", "data.json");
let queue: Promise<unknown> = Promise.resolve();
async function readDemo(): Promise<Demo> {
  try {
    const data = JSON.parse(await readFile(demoFile, "utf8"));
    const used = new Set<string>(data.vendors.map((v: Vendor) => v.pseudo_code).filter(Boolean));
    const vendors = data.vendors.map((v: Vendor) => {
      if (v.pseudo_code) return v;
      for (let n = 0; n < 46656; n++) {
        const code = anonymousVendorCode(v.id, n);
        if (!used.has(code)) { used.add(code); return { ...v, pseudo_code: code }; }
      }
      throw new Error("All vendor codes are used.");
    });
    return { ...data, vendors, productTypes: data.productTypes || [],
      products: data.products.map((p: Product) => ({...p, product_type_id:p.product_type_id || null})),
      reservations: data.reservations || [] };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    return {
      vendors: [],
      productTypes: [],
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
  if (result.product_type_name) result.product_types = { name: result.product_type_name };
  delete result.product_type_name;
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
    return { vendors: d.vendors, productTypes:d.productTypes, settings: d.settings, demo: true };
  }
  const [vendors, settings, productTypes] = await Promise.all([
    query<Vendor>("select id,name,pseudo_code,active from vendors order by name"),
    query<Record<string, unknown>>("select * from settings where id=1"),
    query<ProductType>("select id,name,active from product_types order by name"),
  ]);
  if (!settings[0]) throw new Error("Run the database migration.");
  return {
    vendors,
    productTypes,
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
export async function addVendor(name: string, pseudo_code: string) {
  if (demoMode())
    return mutateDemo((d) => {
      if (d.vendors.some((v) => v.name.toLowerCase() === name.toLowerCase()))
        throw new HttpError("A vendor with this name already exists.", 409);
      if (d.vendors.some(v => v.pseudo_code === pseudo_code))
        throw new HttpError("This vendor code is already in use.",409);
      const v = { id: randomUUID(), name, pseudo_code, active: true };
      d.vendors.push(v);
      return v;
    });
  try {
    return (
      await query<Vendor>(
        "insert into vendors(name,pseudo_code) values($1,$2) returning id,name,pseudo_code,active",
        [name,pseudo_code],
      )
    )[0];
  } catch (e) {
    if ((e as { code?: string }).code === "23505")
      throw new HttpError("A vendor with this name or code already exists.", 409);
    throw e;
  }
}
export async function updateVendor(id: string, changes: Partial<Pick<Vendor,"name"|"pseudo_code"|"active">>) {
  if (demoMode())
    return mutateDemo((d) => {
      const v = d.vendors.find((v) => v.id === id);
      if (!v) throw new HttpError("Vendor not found.", 404);
      if (d.vendors.some(other => other.id !== id &&
        ((changes.name !== undefined && other.name.toLowerCase() === changes.name.toLowerCase()) ||
         (changes.pseudo_code !== undefined && other.pseudo_code === changes.pseudo_code))))
        throw new HttpError("A vendor with this name or code already exists.",409);
      Object.assign(v, changes);
      return v;
    });
  try {
    const r = await query<Vendor>(
      "update vendors set name=coalesce($2,name),pseudo_code=coalesce($3,pseudo_code),active=coalesce($4,active) where id=$1 returning id,name,pseudo_code,active",
      [id, changes.name ?? null, changes.pseudo_code ?? null, changes.active ?? null],
    );
    if (!r[0]) throw new HttpError("Vendor not found.", 404);
    return r[0];
  } catch(e) {
    if ((e as {code?:string}).code === "23505") throw new HttpError("A vendor with this name or code already exists.",409);
    throw e;
  }
}
export async function addProductType(name: string) {
  if (demoMode()) return mutateDemo(d => {
    if (d.productTypes.some(t => t.name.toLowerCase() === name.toLowerCase()))
      throw new HttpError("A product type with this name already exists.",409);
    const value = {id:randomUUID(),name,active:true};
    d.productTypes.push(value); return value;
  });
  try {
    return (await query<ProductType>("insert into product_types(name) values($1) returning id,name,active",[name]))[0];
  } catch(e) {
    if ((e as {code?:string}).code === "23505") throw new HttpError("A product type with this name already exists.",409);
    throw e;
  }
}
export async function updateProductType(id: string, changes: Partial<Pick<ProductType,"name"|"active">>) {
  if (demoMode()) return mutateDemo(d => {
    const value=d.productTypes.find(t => t.id === id);
    if (!value) throw new HttpError("Product type not found.",404);
    if (changes.name !== undefined && d.productTypes.some(t => t.id !== id && t.name.toLowerCase() === changes.name!.toLowerCase()))
      throw new HttpError("A product type with this name already exists.",409);
    Object.assign(value,changes); return value;
  });
  try {
    const rows=await query<ProductType>("update product_types set name=coalesce($2,name),active=coalesce($3,active) where id=$1 returning id,name,active",[id,changes.name ?? null,changes.active ?? null]);
    if (!rows[0]) throw new HttpError("Product type not found.",404);
    return rows[0];
  } catch(e) {
    if ((e as {code?:string}).code === "23505") throw new HttpError("A product type with this name already exists.",409);
    throw e;
  }
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
          product_types: d.productTypes.find(t => t.id === p.product_type_id) || null,
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
      `select p.*,v.name as vendor_name,t.name as product_type_name from products p join vendors v on v.id=p.vendor_id left join product_types t on t.id=p.product_type_id ${clause} order by p.entry_date desc,p.created_at desc,p.id limit 25 offset $${params.length + 1}`,
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
      const currentVendor = d.vendors.find(v => v.id === vendor.id);
      if (!currentVendor?.active || currentVendor.pseudo_code !== vendor.pseudo_code)
        throw new HttpError("Vendor settings changed. Try generating the barcode again.",409);
      for (let n = 0; n < 1000; n++) {
        const sku = buildSku(vendor.pseudo_code, unit, (start + n) % 1000);
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
  const prefix = buildSku(vendor.pseudo_code, unit, 0).slice(0, -3);
  const used = new Set(
    (
      await query<{ sku: string }>(
        "select sku from sku_reservations where sku like $1",
        [prefix + "%"],
      )
    ).map((r) => r.sku),
  );
  for (let n = 0; n < 1000; n++) {
    const sku = buildSku(vendor.pseudo_code, unit, (start + n) % 1000);
    if (used.has(sku)) continue;
    const svg = generateBarcode(sku);
    const r = await query<Record<string, unknown>>(
      reserveSkuSql,
      [sku, vendor.id, unit, rate, svg,vendor.pseudo_code],
    );
    if (r[0]) return reservationRow(r[0]);
    const currentVendor = (await query<Vendor>("select id,name,pseudo_code,active from vendors where id=$1",[vendor.id]))[0];
    if (!currentVendor?.active || currentVendor.pseudo_code !== vendor.pseudo_code)
      throw new HttpError("Vendor settings changed. Try generating the barcode again.",409);
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
  const { vendors, productTypes } = await getConfig();
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
  if (input.product_type_id) {
    const type = productTypes.find(t => t.id === input.product_type_id);
    if (!type || (!type.active && old?.product_type_id !== type.id))
      throw new HttpError("Select an active product type.");
  }
  const reserved =
    !old?.sku && input.sku_token ? await getReservation(input.sku_token) : null;
  if (!old?.sku && !reserved)
    throw new HttpError("Generate the SKU and barcode before saving.");
  if (reserved && !reserved.redeemed && reserved.sku.slice(0,3) !== vendor.pseudo_code)
    throw new HttpError("The vendor code changed. Refresh the entry and generate a new barcode.",409);
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
      const currentVendor = d.vendors.find(v => v.id === input.vendor_id);
      if (!currentVendor || (!currentVendor.active && old?.vendor_id !== input.vendor_id))
        throw new HttpError("Select an active vendor.");
      if (reservation && !reservation.redeemed && reservation.sku.slice(0,3) !== currentVendor.pseudo_code)
        throw new HttpError("The vendor code changed. Refresh the entry and generate a new barcode.",409);
      if (input.product_type_id) {
        const currentType = d.productTypes.find(t => t.id === input.product_type_id);
        if (!currentType || (!currentType.active && old?.product_type_id !== currentType.id))
          throw new HttpError("Select an active product type.");
      }
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
        "update products set item_name=$1,description=$2,vendor_id=$3,entry_date=$4,price_inr=$5,quantity=$6,discount_percent=$7,shipping_percent=$8,exchange_rate=$9,photo_key=$10,product_type_id=$13 where id=$11 and updated_at=$12 returning *",
        [...params, id, updated_at || null,fields.product_type_id],
      );
    } else {
      rows = await query<Record<string, unknown>>(
        saveNewProductSql,
        [...params, reserved!.token, pricing.unit_gbp,fields.product_type_id],
      );
      if (!rows.length) {
        const saved = await query<Record<string, unknown>>(
          "select * from products where sku=$1",
          [sku],
        );
        if (saved[0] && matches(productRow(saved[0]), values))
          return productRow(saved[0]);
        throw new HttpError(
          "This SKU is no longer available. Refresh the entry and generate a new barcode.",
          409,
        );
      }
    }
  } catch (e) {
    if ((e as { code?: string }).code === "23514")
      throw new HttpError("A setting changed. Check the selected product type and try again.",409);
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

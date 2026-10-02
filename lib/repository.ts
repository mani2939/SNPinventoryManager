import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { db } from "./supabase";
import { demoMode } from "./auth";
import { HttpError } from "./http";
import { calculatePricing } from "./pricing";
import type { Product, Settings, Vendor } from "./types";
import type { productSchema } from "./validation";
import type { z } from "zod";
type Demo = { vendors: Vendor[]; settings: Settings; products: Product[] };
const demoFile = path.join(process.cwd(), ".demo-data", "data.json");
let queue: Promise<unknown> = Promise.resolve();
async function readDemo(): Promise<Demo> {
  try {
    return JSON.parse(await readFile(demoFile, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    return {
      vendors: [],
      settings: { id: 1, exchange_rate: null },
      products: [],
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
function check(error: { message: string; code?: string } | null) {
  if (error) {
    if (error.code === "23505")
      throw new HttpError("A vendor with this name already exists.", 409);
    throw new Error(error.message);
  }
}
export async function getConfig() {
  if (demoMode()) {
    const d = await readDemo();
    return { vendors: d.vendors, settings: d.settings, demo: true };
  }
  const client = db();
  const [v, s] = await Promise.all([
    client.from("vendors").select("id,name,active").order("name"),
    client.from("settings").select("*").eq("id", 1).single(),
  ]);
  check(v.error);
  check(s.error);
  return {
    vendors: v.data as Vendor[],
    settings: s.data as Settings,
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
  const r = await db()
    .from("vendors")
    .insert({ name })
    .select("id,name,active")
    .single();
  check(r.error);
  return r.data;
}
export async function setVendorActive(id: string, active: boolean) {
  if (demoMode())
    return mutateDemo((d) => {
      const v = d.vendors.find((v) => v.id === id);
      if (!v) throw new HttpError("Vendor not found.", 404);
      v.active = active;
      return v;
    });
  const r = await db()
    .from("vendors")
    .update({ active })
    .eq("id", id)
    .select("id,name,active")
    .single();
  check(r.error);
  return r.data;
}
export async function setRate(exchange_rate: number) {
  if (demoMode())
    return mutateDemo((d) => {
      d.settings.exchange_rate = exchange_rate;
      return d.settings;
    });
  const r = await db()
    .from("settings")
    .update({ exchange_rate })
    .eq("id", 1)
    .select("*")
    .single();
  check(r.error);
  return r.data;
}
export type Filters = {
  vendor?: string;
  from?: string;
  to?: string;
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
          (!f.to || p.entry_date <= f.to),
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
  let q = db()
    .from("products")
    .select("*,vendors(name)", { count: "exact" })
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id");
  if (f.vendor) q = q.eq("vendor_id", f.vendor);
  if (f.from) q = q.gte("entry_date", f.from);
  if (f.to) q = q.lte("entry_date", f.to);
  const r = await q.range((f.page - 1) * 25, f.page * 25 - 1);
  check(r.error);
  return { products: r.data as Product[], count: r.count || 0 };
}
export async function getProduct(id: string): Promise<Product | null> {
  if (demoMode())
    return (await readDemo()).products.find((p) => p.id === id) || null;
  const r = await db().from("products").select("*").eq("id", id).maybeSingle();
  check(r.error);
  return r.data;
}
export async function saveProduct(
  input: z.infer<typeof productSchema>,
  id?: string,
) {
  const { settings, vendors } = await getConfig();
  const old = id ? await getProduct(id) : null;
  if (id && !old) throw new HttpError("Product not found.", 404);
  const vendor = vendors.find((v) => v.id === input.vendor_id);
  if (!vendor || (!vendor.active && old?.vendor_id !== input.vendor_id))
    throw new HttpError("Select an active vendor.");
  const rate = old?.exchange_rate || settings.exchange_rate;
  if (!rate)
    throw new HttpError("Set the INR per £1 exchange rate in Settings first.");
  const { updated_at, ...fields } = input;
  const values = { ...fields, exchange_rate: rate };
  if (demoMode())
    return mutateDemo((d) => {
      const now = new Date().toISOString();
      if (
        input.photo_key &&
        d.products.some((p) => p.id !== id && p.photo_key === input.photo_key)
      )
        throw new HttpError(
          "This photo belongs to another product. Upload it again.",
          409,
        );
      if (id) {
        const index = d.products.findIndex((p) => p.id === id);
        if (index < 0) throw new HttpError("Product not found.", 404);
        if (d.products[index].updated_at !== updated_at)
          throw new HttpError(
            "This product changed. Refresh and try again.",
            409,
          );
        const p = {
          ...d.products[index],
          ...values,
          ...calculatePricing(values),
          updated_at: now,
        };
        d.products[index] = p;
        return p;
      }
      const p = {
        ...values,
        ...calculatePricing(values),
        id: randomUUID(),
        created_at: now,
        updated_at: now,
      };
      d.products.push(p);
      return p;
    });
  const client = db();
  const r = id
    ? await client
        .from("products")
        .update(values)
        .eq("id", id)
        .eq("updated_at", updated_at || "")
        .select("*")
        .maybeSingle()
    : await client.from("products").insert(values).select("*").single();
  check(r.error);
  if (!r.data)
    throw new HttpError("This product changed. Refresh and try again.", 409);
  return r.data;
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
  const r = await db()
    .from("products")
    .delete()
    .eq("id", id)
    .eq("updated_at", version)
    .select("id");
  check(r.error);
  if (!r.data?.length)
    throw new HttpError("This product changed. Refresh and try again.", 409);
}

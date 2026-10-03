import { z } from "zod";
const decimal = (min: number, max: number, places = 2) =>
  z
    .number()
    .finite()
    .min(min)
    .max(max)
    .refine(
      (v) =>
        Math.abs(
          v * Math.pow(10, places) - Math.round(v * Math.pow(10, places)),
        ) < 0.00001,
      `Use up to ${places} decimal places`,
    );
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Invalid date",
  );
export const productSchema = z.object({
  item_name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000),
  vendor_id: z.string().uuid(),
  product_type_id: z.string().uuid().nullable().default(null),
  entry_date: date,
  price_inr: decimal(0.01, 10000000),
  quantity: z.number().int().min(1).max(100000),
  discount_percent: decimal(0, 100),
  shipping_percent: decimal(0, 1000),
  photo_key: z
    .string()
    .regex(/^products\/[0-9a-f-]{36}\.webp$/)
    .nullable(),
  updated_at: z.string().optional(),
  sku_token: z.string().uuid().optional(),
});
export const vendorSchema = z.object({
  name: z.string().trim().min(1).max(100),
  pseudo_code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3}$/, "Vendor code must contain exactly three letters or digits."),
});
export const vendorUpdateSchema = vendorSchema.partial().extend({
  id: z.string().uuid(), active: z.boolean().optional(),
}).refine(v => v.name !== undefined || v.pseudo_code !== undefined || v.active !== undefined, "Provide a vendor change.");
export const productTypeSchema = z.object({name:z.string().trim().min(1).max(100)});
export const productTypeUpdateSchema = productTypeSchema.partial().extend({
  id:z.string().uuid(),active:z.boolean().optional(),
}).refine(v=>v.name!==undefined || v.active!==undefined,"Provide a product type change.");
export const settingsSchema = z.object({
  exchange_rate: decimal(0.0001, 100000, 4),
});

export const reservationSchema = productSchema.pick({
  vendor_id: true,
  price_inr: true,
  quantity: true,
  discount_percent: true,
  shipping_percent: true,
});
export const skuSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{3}-[BACKGROUND]+Z[BACKGROUND]{2}-[0-9]{3}$/)
  .max(40);

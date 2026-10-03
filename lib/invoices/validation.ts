import { z } from "zod";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Enter a valid date.",
  );
const money = z
  .number()
  .finite()
  .min(0)
  .max(100000000)
  .refine(
    (v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.00001,
    "Use up to two decimal places.",
  );
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .refine(
    (v) => /^\+[1-9]\d{7,14}$/.test(v),
    "Enter an international WhatsApp number, e.g. +447700900123.",
  );
export const invoiceSchema = z
  .object({
    request_token: z.string().uuid(),
    invoice_date: date,
    due_date: date,
    customer_name: z.string().trim().min(1).max(150),
    customer_phone: phoneSchema.or(z.literal("")),
    customer_address: z.string().trim().max(1000),
    notes: z.string().trim().max(2000),
    shipping_gbp: money,
    items: z
      .array(
        z.object({
          description: z.string().trim().min(1).max(300),
          quantity: z.number().int().min(1).max(100000),
          unit_price: money,
          discount_percent: z
            .number()
            .finite()
            .min(0)
            .max(100)
            .refine(
              (v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.00001,
              "Use up to two decimal places.",
            ),
          product_id: z.string().uuid().nullable(),
          sku: z.string().max(40).nullable(),
        }),
      )
      .min(1)
      .max(200),
  })
  .refine((v) => v.due_date >= v.invoice_date, {
    path: ["due_date"],
    message: "Due date must be on or after the invoice date.",
  });
export const profileSchema = z.object({
  business_name: z.string().trim().min(1).max(150),
  address: z.string().trim().max(1000),
  email: z
    .string()
    .trim()
    .max(200)
    .refine(
      (v) => !v || z.email().safeParse(v).success,
      "Enter a valid email.",
    ),
  phone: z.string().trim().max(50),
  payment_details: z.string().trim().max(1500),
  footer: z.string().trim().max(500),
  default_due_days: z.number().int().min(0).max(365),
});
export const sendSchema = z.object({
  request_token: z.string().uuid(),
  recipient: phoneSchema,
  customer_opt_in_confirmed: z.literal(true),
});
export const statusSchema = z.object({
  status: z.enum(["unpaid", "paid", "void"]),
  updated_at: z.string().min(1),
});
export const invoiceFiltersSchema = z
  .object({
    name: z.string().trim().max(150).default(""),
    from: date.optional(),
    to: date.optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: "From date must be on or before To date.",
  });

import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { demoMode } from "../auth";
import { query } from "../database";
import { getProduct } from "../repository";
import { HttpError } from "../http";
import { invoiceSchema, invoiceFiltersSchema } from "./validation";
import {
  defaultInvoiceProfile,
  type InvoiceProfile,
  type Invoice,
  type Delivery,
} from "./types";
import { calculateInvoice } from "./pricing";
import { createInvoiceSql, invoiceFilter, claimDeliverySql } from "./sql";
import {
  assertCustomerEncryption,
  encryptCustomer,
  decryptCustomer,
  payloadFingerprint,
  matchesFingerprint,
  nameIndex,
  recipientFingerprint,
} from "./crypto";
import type { z } from "zod";
type RawInvoice = Omit<
  Invoice,
  "customer_name" | "customer_phone" | "customer_address" | "notes" | "seller"
> & { customer_data: string; customer_name_index: string[]; seller: string };
type RawDelivery = Omit<Delivery, "recipient"> & {
  recipient: string | null;
  recipient_hash: string | null;
};
type Store = {
  profile: string | null;
  invoices: RawInvoice[];
  deliveries: RawDelivery[];
  counter: number;
};
const file = path.join(process.cwd(), ".demo-data", "invoices.json");
let queue: Promise<unknown> = Promise.resolve();
async function readDemo(): Promise<Store> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    return { profile: null, invoices: [], deliveries: [], counter: 0 };
  }
}
function mutate<T>(fn: (d: Store) => T | Promise<T>): Promise<T> {
  const task = queue
    .catch(() => {})
    .then(async () => {
      const d = await readDemo();
      const result = await fn(d);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file + ".tmp", JSON.stringify(d));
      await rename(file + ".tmp", file);
      return result;
    });
  queue = task;
  return task;
}
function invoiceRow(raw: RawInvoice | Record<string, unknown>): Invoice {
  const r = raw as unknown as RawInvoice;
  const { customer_data, customer_name_index: _index, seller, ...rest } = r;
  const customer = decryptCustomer<
    Pick<
      Invoice,
      "customer_name" | "customer_phone" | "customer_address" | "notes"
    >
  >(customer_data, `invoice:${r.id}:customer`);
  return {
    ...rest,
    ...customer,
    seller: decryptCustomer<InvoiceProfile>(seller, `invoice:${r.id}:seller`),
    items: r.items.map((item, i) => ({
      ...item,
      description: decryptCustomer<string>(
        item.description,
        `invoice:${r.id}:item:${i}`,
      ),
    })),
    shipping_gbp: Number(r.shipping_gbp),
    subtotal_gbp: Number(r.subtotal_gbp),
    discount_gbp: Number(r.discount_gbp),
    total_gbp: Number(r.total_gbp),
  };
}
function deliveryRow(r: RawDelivery): Delivery {
  const { recipient_hash: _hash, ...rest } = r;
  return {
    ...rest,
    recipient: r.recipient
      ? decryptCustomer<string>(
          r.recipient,
          `delivery:${r.request_token}:recipient`,
        )
      : null,
  };
}
export async function getInvoiceProfile(): Promise<InvoiceProfile> {
  assertCustomerEncryption();
  if (demoMode()) {
    const raw = (await readDemo()).profile;
    return raw
      ? decryptCustomer(raw, "invoice-profile")
      : defaultInvoiceProfile;
  }
  const r = await query<{ profile: string | null }>(
    "select profile from invoice_settings where id=1",
  );
  if (!r[0])
    throw new HttpError(
      "Invoice settings are missing. Redeploy to run the migration.",
      503,
    );
  return r[0].profile
    ? decryptCustomer(r[0].profile, "invoice-profile")
    : defaultInvoiceProfile;
}
export async function saveInvoiceProfile(profile: InvoiceProfile) {
  const encrypted = encryptCustomer(profile, "invoice-profile");
  if (demoMode())
    return mutate((d) => {
      d.profile = encrypted;
      return profile;
    });
  await query("update invoice_settings set profile=$1 where id=1", [encrypted]);
  return profile;
}
export async function getInvoice(id: string): Promise<Invoice | null> {
  assertCustomerEncryption();
  if (demoMode()) {
    const r = (await readDemo()).invoices.find((i) => i.id === id);
    return r ? invoiceRow(r) : null;
  }
  const r = await query("select * from invoices where id=$1", [id]);
  return r[0] ? invoiceRow(r[0]) : null;
}
export async function saveInvoice(input: z.infer<typeof invoiceSchema>) {
  const fingerprint = payloadFingerprint(input);
  const existing = demoMode()
    ? (await readDemo()).invoices.find(
        (i) => i.request_token === input.request_token,
      )
    : await query("select * from invoices where request_token=$1", [
        input.request_token,
      ]).then((r) => r[0]);
  if (existing) {
    if (!matchesFingerprint(input, String(existing.payload_hash)))
      throw new HttpError(
        "This save identifier was already used with different invoice data.",
        409,
      );
    return invoiceRow(existing);
  }
  for (const item of input.items) {
    if (item.product_id) {
      const product = await getProduct(item.product_id);
      if (!product || product.sku !== item.sku)
        throw new HttpError(
          "A scanned product is no longer available. Remove it or add a manual item.",
          409,
        );
    }
  }
  const id = randomUUID();
  const customer_data = encryptCustomer(
    {
      customer_name: input.customer_name,
      customer_phone: input.customer_phone,
      customer_address: input.customer_address,
      notes: input.notes,
    },
    `invoice:${id}:customer`,
  );
  const index = nameIndex(input.customer_name);
  const seller = encryptCustomer(
    await getInvoiceProfile(),
    `invoice:${id}:seller`,
  );
  const items = input.items.map((item, i) => ({
    ...item,
    description: encryptCustomer(item.description, `invoice:${id}:item:${i}`),
  }));
  if (demoMode())
    return mutate((d) => {
      const duplicate = d.invoices.find(
        (i) => i.request_token === input.request_token,
      );
      if (duplicate) {
        if (!matchesFingerprint(input, duplicate.payload_hash))
          throw new HttpError("Save identifier conflict.", 409);
        return invoiceRow(duplicate);
      }
      const stamp = new Date().toISOString();
      const prices = calculateInvoice(input.items, input.shipping_gbp);
      const invoice: RawInvoice = {
        id,
        request_token: input.request_token,
        payload_hash: fingerprint,
        invoice_date: input.invoice_date,
        due_date: input.due_date,
        shipping_gbp: input.shipping_gbp,
        customer_data,
        customer_name_index: index,
        seller,
        items: prices.items.map((item, i) => ({
          ...item,
          description: items[i].description,
        })),
        subtotal_gbp: prices.subtotal_gbp,
        discount_gbp: prices.discount_gbp,
        total_gbp: prices.total_gbp,
        invoice_number: `SNP-${input.invoice_date.replaceAll("-", "")}-${String(++d.counter).padStart(8, "0")}`,
        privacy_redacted_at: null,
        status: "unpaid",
        created_at: stamp,
        updated_at: stamp,
      };
      d.invoices.unshift(invoice);
      return invoiceRow(invoice);
    });
  const r = await query(createInvoiceSql, [
    id,
    input.request_token,
    fingerprint,
    input.invoice_date,
    input.due_date,
    customer_data,
    index,
    input.shipping_gbp,
    JSON.stringify(items),
    seller,
  ]);
  if (r[0]) return invoiceRow(r[0]);
  const retry = await query("select * from invoices where request_token=$1", [
    input.request_token,
  ]);
  if (!retry[0] || !matchesFingerprint(input, String(retry[0].payload_hash)))
    throw new HttpError("Invoice save conflict. Refresh and try again.", 409);
  return invoiceRow(retry[0]);
}
export async function listInvoices(f: z.infer<typeof invoiceFiltersSchema>) {
  assertCustomerEncryption();
  if (demoMode()) {
    const rows = (await readDemo()).invoices
      .filter(
        (i) =>
          (!f.from || i.invoice_date >= f.from) &&
          (!f.to || i.invoice_date <= f.to),
      )
      .map(invoiceRow)
      .filter(
        (i) =>
          !f.name ||
          f.name
            .normalize("NFKC")
            .trim()
            .toLocaleLowerCase("en-GB")
            .split(/\s+/)
            .every((word) =>
              i.customer_name
                .normalize("NFKC")
                .toLocaleLowerCase("en-GB")
                .split(/\s+/)
                .some((name) => name.startsWith(word)),
            ),
      )
      .sort(
        (a, b) =>
          b.invoice_date.localeCompare(a.invoice_date) ||
          b.created_at.localeCompare(a.created_at),
      );
    return {
      invoices: rows.slice((f.page - 1) * 25, f.page * 25),
      count: rows.length,
    };
  }
  const { clause, params } = invoiceFilter(f);
  const [rows, count] = await Promise.all([
    query(
      `select * from invoices ${clause} order by invoice_date desc,created_at desc,id limit 25 offset $${params.length + 1}`,
      [...params, (f.page - 1) * 25],
    ),
    query<{ count: string }>(`select count(*) from invoices ${clause}`, params),
  ]);
  return { invoices: rows.map(invoiceRow), count: Number(count[0].count) };
}
export async function updateInvoiceStatus(
  id: string,
  status: Invoice["status"],
  version: string,
) {
  if (demoMode())
    return mutate((d) => {
      const i = d.invoices.find((i) => i.id === id);
      if (!i) throw new HttpError("Invoice not found.", 404);
      if (i.updated_at !== version)
        throw new HttpError("Invoice changed. Refresh and try again.", 409);
      if (i.status === "void")
        throw new HttpError("A void invoice cannot be reopened.", 409);
      if (
        status === "void" &&
        d.deliveries.some((r) => r.invoice_id === id && r.status === "sending")
      )
        throw new HttpError(
          "Wait for the current WhatsApp send to finish before voiding the invoice.",
          409,
        );
      i.status = status;
      i.updated_at = new Date().toISOString();
      return invoiceRow(i);
    });
  const r = await query(
    "update invoices set status=$1 where id=$2 and updated_at=$3 and status<>'void' and ($1<>'void' or not exists(select 1 from invoice_deliveries where invoice_id=$2 and status='sending')) returning *",
    [status, id, version],
  );
  if (!r[0])
    throw new HttpError(
      "Invoice changed, is void or has a send in progress. Refresh and try again.",
      409,
    );
  return invoiceRow(r[0]);
}
async function recoverStalledDeliveries(id: string) {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const error =
    "The send did not finish recording its result. Check WhatsApp before a new attempt; no automatic resend was made.";
  if (demoMode()) {
    const existing = await readDemo();
    if (
      !existing.deliveries.some(
        (r) =>
          r.invoice_id === id &&
          r.status === "sending" &&
          r.created_at < cutoff,
      )
    )
      return;
    await mutate((d) => {
      for (const r of d.deliveries) {
        if (
          r.invoice_id === id &&
          r.status === "sending" &&
          r.created_at < cutoff
        ) {
          r.status = "uncertain";
          r.error = error;
          r.updated_at = new Date().toISOString();
        }
      }
    });
    return;
  }
  await query(
    "update invoice_deliveries set status='uncertain',error=$1,updated_at=clock_timestamp() where invoice_id=$2 and status='sending' and created_at<$3",
    [error, id, cutoff],
  );
}
export async function listDeliveries(id: string): Promise<Delivery[]> {
  await recoverStalledDeliveries(id);
  if (demoMode())
    return (await readDemo()).deliveries
      .filter((d) => d.invoice_id === id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(deliveryRow);
  return (
    await query<RawDelivery>(
      "select * from invoice_deliveries where invoice_id=$1 order by created_at desc",
      [id],
    )
  ).map(deliveryRow);
}
export async function claimDelivery(
  id: string,
  token: string,
  recipient: string,
): Promise<{ delivery: Delivery; claimed: boolean }> {
  await recoverStalledDeliveries(id);
  const encrypted = encryptCustomer(recipient, `delivery:${token}:recipient`),
    hash = recipientFingerprint(recipient);
  if (demoMode())
    return mutate((d) => {
      const existing = d.deliveries.find((i) => i.request_token === token);
      if (existing) {
        const decrypted = deliveryRow(existing);
        if (existing.invoice_id !== id || decrypted.recipient !== recipient)
          throw new HttpError("Send identifier conflict.", 409);
        return { delivery: decrypted, claimed: false };
      }
      if (
        d.deliveries.some(
          (i) =>
            i.invoice_id === id &&
            i.recipient_hash === hash &&
            i.status === "sending",
        )
      )
        throw new HttpError(
          "A send to this recipient is already in progress.",
          409,
        );
      const i = d.invoices.find((i) => i.id === id);
      if (!i || i.status === "void" || i.privacy_redacted_at)
        throw new HttpError(
          "Cannot send a missing, void or redacted invoice.",
          409,
        );
      const stamp = new Date().toISOString();
      const delivery: RawDelivery = {
        id: randomUUID(),
        invoice_id: id,
        request_token: token,
        recipient: encrypted,
        recipient_hash: hash,
        status: "sending",
        consent_confirmed_at: stamp,
        message_id: null,
        error: null,
        created_at: stamp,
        updated_at: stamp,
      };
      d.deliveries.push(delivery);
      return { delivery: deliveryRow(delivery), claimed: true };
    });
  let r: RawDelivery[];
  try {
    r = await query<RawDelivery>(claimDeliverySql, [
      id,
      token,
      encrypted,
      hash,
    ]);
  } catch (e) {
    if ((e as { code?: string }).code === "23505")
      throw new HttpError(
        "A send to this recipient is already in progress.",
        409,
      );
    throw e;
  }
  if (r[0]) return { delivery: deliveryRow(r[0]), claimed: true };
  const existing = await query<RawDelivery>(
    "select * from invoice_deliveries where request_token=$1",
    [token],
  );
  if (
    !existing[0] ||
    existing[0].invoice_id !== id ||
    deliveryRow(existing[0]).recipient !== recipient
  )
    throw new HttpError(
      "Send identifier conflict or invoice is unavailable.",
      409,
    );
  return { delivery: deliveryRow(existing[0]), claimed: false };
}
export async function completeDelivery(
  id: string,
  status: Delivery["status"],
  messageId: string | null,
  error: string | null,
) {
  if (demoMode())
    return mutate((d) => {
      const record = d.deliveries.find((i) => i.id === id)!;
      record.status = status;
      record.message_id = messageId;
      record.error = error;
      record.updated_at = new Date().toISOString();
      return deliveryRow(record);
    });
  return deliveryRow(
    (
      await query<RawDelivery>(
        "update invoice_deliveries set status=$1,message_id=$2,error=$3,updated_at=clock_timestamp() where id=$4 returning *",
        [status, messageId, error, id],
      )
    )[0],
  );
}
export async function redactInvoiceCustomer(id: string, version: string) {
  const customer = encryptCustomer(
    {
      customer_name: "Customer details removed",
      customer_phone: "",
      customer_address: "",
      notes: "",
    },
    `invoice:${id}:customer`,
  );
  const invoice = await getInvoice(id);
  if (!invoice) throw new HttpError("Invoice not found.", 404);
  const items = invoice.items.map((i, n) => ({
    ...i,
    description: encryptCustomer(`Item ${n + 1}`, `invoice:${id}:item:${n}`),
  }));
  if (demoMode())
    return mutate((d) => {
      const i = d.invoices.find((i) => i.id === id)!;
      if (i.updated_at !== version || i.privacy_redacted_at)
        throw new HttpError("Invoice changed or was already redacted.", 409);
      if (
        d.deliveries.some((r) => r.invoice_id === id && r.status === "sending")
      )
        throw new HttpError(
          "Wait for the current WhatsApp send to finish before removing customer details.",
          409,
        );
      i.customer_data = customer;
      i.customer_name_index = [];
      i.payload_hash = "redacted";
      i.items = items;
      i.privacy_redacted_at = new Date().toISOString();
      i.updated_at = i.privacy_redacted_at;
      for (const r of d.deliveries.filter((r) => r.invoice_id === id)) {
        r.recipient = null;
        r.recipient_hash = null;
        r.message_id = null;
        r.error = null;
      }
      return invoiceRow(i);
    });
  const r = await query(
    `with redacted as (update invoices set customer_data=$1,customer_name_index='{}',payload_hash='redacted',items=$2::jsonb,privacy_redacted_at=clock_timestamp()
  where id=$3 and updated_at=$4 and privacy_redacted_at is null and not exists(select 1 from invoice_deliveries where invoice_id=$3 and status='sending') returning *),
  cleared as (update invoice_deliveries set recipient=null,recipient_hash=null,message_id=null,error=null where invoice_id in (select id from redacted) returning id)
  select * from redacted`,
    [customer, JSON.stringify(items), id, version],
  );
  if (!r[0])
    throw new HttpError(
      "Invoice changed, was already redacted or has a WhatsApp send in progress.",
      409,
    );
  return invoiceRow(r[0]);
}

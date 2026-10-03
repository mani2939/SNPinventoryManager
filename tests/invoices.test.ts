import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  encryptCustomer,
  decryptCustomer,
  nameIndex,
  nameQueryIndexes,
  matchesFingerprint,
  payloadFingerprint,
} from "../lib/invoices/crypto";
import { calculateInvoice } from "../lib/invoices/pricing";
import {
  invoiceSchema,
  sendSchema,
  phoneSchema,
} from "../lib/invoices/validation";
import {
  createInvoiceSql,
  claimDeliverySql,
  invoiceFilter,
} from "../lib/invoices/sql";
import { sendInvoiceWhatsApp, WhatsAppError } from "../lib/invoices/whatsapp";
import type { Invoice } from "../lib/invoices/types";
const testKey = Buffer.alloc(32, 17).toString("base64");
process.env.CUSTOMER_DATA_ENCRYPTION_KEY = testKey;
const item = {
  description: "Necklace",
  quantity: 3,
  unit_price: 0.05,
  discount_percent: 10,
  product_id: null,
  sku: null,
};
const customer = {
  customer_name: "Zoë Private",
  customer_phone: "+447700900123",
  customer_address: "Sensitive address",
  notes: "Private order note",
};

test("customer encryption authenticates data and context, is random, fails closed, and supports previous keys", () => {
  const context = "invoice:1:customer",
    a = encryptCustomer(customer, context),
    b = encryptCustomer(customer, context);
  assert.notEqual(a, b);
  assert.deepEqual(decryptCustomer(a, context), customer);
  assert(!a.includes(customer.customer_name));
  assert.throws(
    () => decryptCustomer(a, "invoice:2:customer"),
    /authenticated/,
  );
  const parts = a.split(".");
  parts[4] = (parts[4][0] === "A" ? "B" : "A") + parts[4].slice(1);
  assert.throws(
    () => decryptCustomer(parts.join("."), context),
    /authenticated/,
  );
  assert.throws(
    () => decryptCustomer(JSON.stringify(customer), context),
    /format/,
  );
  const fingerprint = payloadFingerprint(customer),
    index = nameIndex(customer.customer_name);
  assert(nameQueryIndexes("zoë pri")[0].every((t) => index.includes(t)));
  assert(!nameQueryIndexes("private")[0][0].includes("private"));
  delete process.env.CUSTOMER_DATA_ENCRYPTION_KEY;
  assert.throws(() => encryptCustomer(customer, context), /ENCRYPTION_KEY/);
  process.env.CUSTOMER_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 22).toString(
    "base64",
  );
  assert.throws(() => decryptCustomer(a, context), /unavailable/);
  process.env.CUSTOMER_DATA_PREVIOUS_KEYS = JSON.stringify([testKey]);
  assert.deepEqual(decryptCustomer(a, context), customer);
  assert(matchesFingerprint(customer, fingerprint));
  assert(!matchesFingerprint({ ...customer, notes: "Changed" }, fingerprint));
  assert(nameQueryIndexes("zoë pri")[1].every((t) => index.includes(t)));
  delete process.env.CUSTOMER_DATA_PREVIOUS_KEYS;
  process.env.CUSTOMER_DATA_ENCRYPTION_KEY = testKey;
});

test("invoice validation and pricing use half-up line rounding with absolute shipping", () => {
  const p = calculateInvoice(
    [item, { ...item, quantity: 2, unit_price: 20, discount_percent: 25 }],
    4.5,
  );
  assert.equal(p.subtotal_gbp, 40.15);
  assert.equal(p.discount_gbp, 10.01);
  assert.equal(p.total_gbp, 34.64);
  assert.equal(p.items[0].line_total, 0.14);
  assert.equal(
    calculateInvoice([{ ...item, discount_percent: 100 }], 2).total_gbp,
    2,
  );
  assert.equal(phoneSchema.parse("+44 (7700) 900-123"), "+447700900123");
  assert(!phoneSchema.safeParse("07700900123").success);
  const input = {
    request_token: randomUUID(),
    invoice_date: "2026-10-03",
    due_date: "2026-10-04",
    ...customer,
    shipping_gbp: 4.5,
    items: [item],
  };
  assert(invoiceSchema.safeParse(input).success);
  for (const patch of [
    { due_date: "2026-10-02" },
    { invoice_date: "2026-02-30" },
    { items: [{ ...item, quantity: 1.5 }] },
    { items: [{ ...item, unit_price: 0.001 }] },
    { items: [{ ...item, description: "" }] },
    { items: [] },
  ])
    assert(!invoiceSchema.safeParse({ ...input, ...patch }).success);
  assert(
    !sendSchema.safeParse({
      request_token: randomUUID(),
      recipient: customer.customer_phone,
      customer_opt_in_confirmed: false,
    }).success,
  );
});

test("PostgreSQL calculates immutable invoices, searches encrypted names and protects send/redaction races", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(await readFile("database/setup.sql", "utf8"));
    const id = randomUUID(),
      token = randomUUID(),
      items = [
        {
          ...item,
          description: encryptCustomer(
            item.description,
            `invoice:${id}:item:0`,
          ),
        },
      ];
    const args = [
      id,
      token,
      payloadFingerprint(customer),
      "2026-10-03",
      "2026-10-04",
      encryptCustomer(customer, `invoice:${id}:customer`),
      nameIndex(customer.customer_name),
      4.5,
      JSON.stringify(items),
      encryptCustomer(
        { business_name: "Private sole trader" },
        `invoice:${id}:seller`,
      ),
    ];
    const saved = (await pg.query(createInvoiceSql, args)).rows[0] as any;
    assert.equal(saved.total_gbp, "4.64");
    assert.equal(saved.discount_gbp, "0.01");
    assert.equal(saved.items[0].line_total, 0.14);
    assert.match(saved.invoice_number, /^SNP-20261003-\d{8}$/);
    assert(!JSON.stringify(saved).includes("Sensitive address"));
    assert(!JSON.stringify(saved).includes("Zoë Private"));
    assert(!JSON.stringify(saved).includes("Necklace"));
    assert.equal((await pg.query(createInvoiceSql, args)).rows.length, 0);
    const f = invoiceFilter({
      name: "ZOË PRI",
      from: "2026-10-03",
      to: "2026-10-03",
    });
    assert.equal(
      (await pg.query(`select id from invoices ${f.clause}`, f.params)).rows
        .length,
      1,
    );
    const no = invoiceFilter({ name: "other" });
    assert.equal(
      (await pg.query(`select id from invoices ${no.clause}`, no.params)).rows
        .length,
      0,
    );
    await assert.rejects(
      () => pg.query("update invoices set total_gbp=1 where id=$1", [id]),
      /immutable/,
    );
    await assert.rejects(
      () =>
        pg.query("update invoices set id=$1 where id=$2", [randomUUID(), id]),
      /immutable/,
    );
    await assert.rejects(
      () =>
        pg.query("update invoices set customer_data='v1.bad' where id=$1", [
          id,
        ]),
      /redaction/,
    );
    const sendToken = randomUUID(),
      recipient = encryptCustomer(
        customer.customer_phone,
        `delivery:${sendToken}:recipient`,
      );
    const sendArgs = [id, sendToken, recipient, "hashed-recipient"];
    const delivery = (await pg.query(claimDeliverySql, sendArgs))
      .rows[0] as any;
    await assert.rejects(
      () => pg.query("update invoices set status='void' where id=$1", [id]),
      /send is in progress/,
    );
    assert(delivery.consent_confirmed_at);
    assert.equal((await pg.query(claimDeliverySql, sendArgs)).rows.length, 0);
    await assert.rejects(
      () =>
        pg.query(claimDeliverySql, [
          id,
          randomUUID(),
          recipient,
          "hashed-recipient",
        ]),
      /unique/,
    );
    const redacted = JSON.stringify(
      saved.items.map((i: any) => ({
        ...i,
        description: encryptCustomer("Item 1", `invoice:${id}:item:0`),
      })),
    );
    const redact =
      "update invoices set customer_data=$1,customer_name_index='{}',items=$2::jsonb,payload_hash='redacted',privacy_redacted_at=clock_timestamp() where id=$3 returning *";
    await assert.rejects(
      () =>
        pg.query(redact, [
          encryptCustomer({}, `invoice:${id}:customer`),
          redacted,
          id,
        ]),
      /send is in progress/,
    );
    await pg.query(
      "update invoice_deliveries set status='accepted' where id=$1",
      [delivery.id],
    );
    const cleared = (
      await pg.query(redact, [
        encryptCustomer({}, `invoice:${id}:customer`),
        redacted,
        id,
      ])
    ).rows[0] as any;
    assert.equal(cleared.total_gbp, saved.total_gbp);
    assert.deepEqual(cleared.customer_name_index, []);
    assert.equal(
      (await pg.query(claimDeliverySql, [id, randomUUID(), recipient, "other"]))
        .rows.length,
      0,
    );
    await pg.query("update invoices set status='void' where id=$1", [id]);
    await assert.rejects(
      () => pg.query("update invoices set status='unpaid' where id=$1", [id]),
      /reopened/,
    );
    await pg.exec("create role invoice_untrusted;set role invoice_untrusted;");
    await assert.rejects(
      () => pg.query("select * from invoices"),
      /permission/,
    );
    await assert.rejects(
      () => pg.query("select * from invoice_deliveries"),
      /permission/,
    );
    await pg.exec("reset role;");
    await pg.exec(await readFile("database/setup.sql", "utf8"));
    assert.equal(
      (
        await pg.query<{ total_gbp: string }>(
          "select total_gbp from invoices where id=$1",
          [id],
        )
      ).rows[0].total_gbp,
      saved.total_gbp,
    );
  } finally {
    await pg.close();
  }
});

test("WhatsApp uploads a PDF and sends the approved document template; ambiguous sends are not called delivered", async () => {
  Object.assign(process.env, {
    WHATSAPP_ACCESS_TOKEN: "fake-unit-test-token",
    WHATSAPP_PHONE_NUMBER_ID: "123",
    WHATSAPP_INVOICE_TEMPLATE: "daily_invoice",
  });
  const invoice = {
    invoice_number: "SNP-20261003-00000001",
    customer_name: "Zoë",
    total_gbp: 12.34,
  } as Invoice;
  const calls: { url: string; options: any }[] = [];
  const fetcher = (async (url: unknown, options: any) => {
    calls.push({ url: String(url), options });
    return Response.json(
      calls.length === 1
        ? { id: "media-1" }
        : { messages: [{ id: "message-1" }] },
    );
  }) as typeof fetch;
  assert.equal(
    await sendInvoiceWhatsApp(
      invoice,
      "+447700900123",
      new Uint8Array([37, 80, 68, 70]),
      fetcher,
    ),
    "message-1",
  );
  assert.equal(calls.length, 2);
  const form = calls[0].options.body as FormData;
  assert.equal((form.get("file") as File).type, "application/pdf");
  assert.equal(
    calls[0].options.headers.Authorization,
    "Bearer fake-unit-test-token",
  );
  const body = JSON.parse(calls[1].options.body);
  assert.equal(body.to, "447700900123");
  assert.equal(
    body.template.components[0].parameters[0].document.id,
    "media-1",
  );
  assert.deepEqual(
    body.template.components[1].parameters.map((p: any) => p.text),
    ["Zoë", invoice.invoice_number, "£12.34"],
  );
  let count = 0;
  const timeout = (async () => {
    if (++count === 1) return Response.json({ id: "media-1" });
    throw new Error("network timeout");
  }) as typeof fetch;
  await assert.rejects(
    () =>
      sendInvoiceWhatsApp(
        invoice,
        customer.customer_phone,
        new Uint8Array(),
        timeout,
      ),
    (e: unknown) => e instanceof WhatsAppError && e.uncertain,
  );
  const rejection = (async () =>
    Response.json(
      { error: { message: "raw personal data" } },
      { status: 400 },
    )) as typeof fetch;
  await assert.rejects(
    () =>
      sendInvoiceWhatsApp(
        invoice,
        customer.customer_phone,
        new Uint8Array(),
        rejection,
      ),
    (e: unknown) =>
      e instanceof WhatsAppError &&
      !e.uncertain &&
      !e.message.includes("raw personal"),
  );
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_INVOICE_TEMPLATE;
});

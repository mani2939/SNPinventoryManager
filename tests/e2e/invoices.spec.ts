import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
test.use({ actionTimeout: 15000 });

test("invoicing workspace creates scanned/manual invoices, private filters, PDF, export and redaction", async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  expect((await request.get("/api/invoices")).status()).toBe(401);
  const errors: string[] = [];
  const serverFailures: string[] = [];
  page.on("response", (r) => {
    if (r.status() >= 500)
      serverFailures.push(new URL(r.url()).pathname + " " + r.status());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/login");
  await page.getByLabel("Username").fill("SNPAdmin");
  await page.getByLabel("Password", { exact: true }).fill("SNPRocks");
  await page
    .getByRole("combobox", { name: "Workspace", exact: true })
    .selectOption("invoicing");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/invoices$/);
  const headers = { Origin: "http://127.0.0.1:3010" };
  const post = async (url: string, data: unknown) => {
    const r = await page.request.post(url, { headers, data });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  };
  await page
    .getByRole("link", { name: "Invoice settings", exact: true })
    .click();
  await page
    .getByLabel("Business name", { exact: true })
    .fill("Shapes & Pieces QA");
  await page.getByLabel("Payment details").fill("Pay by bank transfer");
  await page.getByLabel("Payment due after (days)").fill("2");
  await page.getByRole("button", { name: "Save invoice settings" }).click();
  await expect(page.getByRole("status")).toContainText("settings saved");
  const config = await (await page.request.get("/api/config")).json();
  const codes = new Set(config.vendors.map((v: any) => v.pseudo_code));
  let code = "";
  for (let n = 4000; !code; n++) {
    const candidate = n.toString(36).toUpperCase();
    if (!codes.has(candidate)) code = candidate;
  }
  const vendor = await post("/api/vendors", {
    name: "Invoice QA " + Date.now(),
    pseudo_code: code,
  });
  expect(
    (
      await page.request.patch("/api/config", {
        headers,
        data: { exchange_rate: 100 },
      })
    ).ok(),
  ).toBe(true);
  const data = {
    item_name: "Scanned gold earrings",
    description: "",
    vendor_id: vendor.id,
    entry_date: "2026-10-03",
    price_inr: 1000,
    quantity: 3,
    discount_percent: 0,
    shipping_percent: 0,
    photo_key: null,
  };
  const reservation = await post("/api/skus", data);
  const product = await post("/api/products", {
    ...data,
    sku_token: reservation.token,
  });
  await page
    .getByRole("link", { name: "Create invoice", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Customer name", { exact: true })
    .fill("Zoë Private " + Date.now());
  const name = await page
    .getByLabel("Customer name", { exact: true })
    .inputValue();
  await page.getByLabel("WhatsApp number").fill("+447700900123");
  await page.getByLabel("Customer address").fill("Private QA address");
  await page.getByLabel("Invoice date", { exact: true }).fill("2026-10-03");
  await expect(page.getByLabel("Due date", { exact: true })).toHaveValue(
    "2026-10-05",
  );
  const scan = page.getByLabel("Scan barcode or enter SKU");
  await scan.fill(product.sku);
  await scan.press("Enter");
  await expect(page.getByLabel("Item 1 description")).toHaveValue(
    product.item_name,
  );
  await expect(page.getByLabel("Item 1 price")).toHaveValue("30");
  await scan.press("Enter");
  await expect(page.getByLabel("Item 1 quantity")).toHaveValue("2");
  await page.getByLabel("Item 1 discount").fill("10");
  await page.getByRole("button", { name: "Add manual item" }).click();
  await page.getByLabel("Item 2 description").fill("Manual live purchase");
  await page.getByLabel("Item 2 price").fill("5");
  await page.getByLabel("Shipping · GBP", { exact: true }).fill("3");
  await page.getByLabel("Invoice notes").fill("Private QA note");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/invoice-create-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Save invoice", exact: true }).click();
  await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]+(?:\?saved=1)?$/);
  await expect(
    page.getByRole("heading", { name: /SNP-20261003-/ }),
  ).toBeVisible();
  const id = new URL(page.url()).pathname.split("/").pop()!;
  const initial = await (await page.request.get("/api/invoices/" + id)).json();
  expect(initial.invoice.total_gbp).toBe(62);
  expect(initial.invoice.seller.business_name).toBe("Shapes & Pieces QA");
  const replay=await post('/api/invoices',initial.invoice);expect(replay.id).toBe(id);
  expect((await page.request.post('/api/invoices',{headers,data:{...initial.invoice,notes:'changed retry'}})).status()).toBe(409);
  const profile=(await (await page.request.get('/api/invoices/config')).json()).profile;
  expect((await page.request.patch('/api/invoices/config',{headers,data:{...profile,business_name:'Later seller settings'}})).ok()).toBe(true);
  expect((await (await page.request.get('/api/invoices/'+id)).json()).invoice.seller.business_name).toBe('Shapes & Pieces QA');

  const raw = await readFile(".demo-data/invoices.json", "utf8");
  for (const plain of [
    name,
    "Private QA address",
    "Private QA note",
    "Manual live purchase",
    "Shapes & Pieces QA",
    "+447700900123",
  ])
    expect(raw).not.toContain(plain);
  const pdf = await page.request.get(`/api/invoices/${id}/pdf`);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  expect(pdf.headers()["cache-control"]).toContain("no-store");
  const sendButton = page.getByRole("button", {
    name: "Send PDF via WhatsApp",
  });
  await expect(sendButton).toBeDisabled();
  await page.getByLabel("Recipient WhatsApp number").fill("+447700900456");
  await page
    .getByLabel("Customer agreed to receive their invoice on WhatsApp")
    .check();
  await expect(
    page.getByRole("link", { name: "Open WhatsApp (attach PDF)" }),
  ).toHaveAttribute("href", /^https:\/\/wa.me\/447700900456\?/);
  expect(
    (
      await page.request.post(`/api/invoices/${id}/send`, {
        headers,
        data: {
          recipient: "+447700900456",
          request_token: randomUUID(),
          customer_opt_in_confirmed: true,
        },
      })
    ).status(),
  ).toBe(503);
  expect(
    (
      await page.request.patch("/api/invoices/" + id, {
        headers: { Origin: "https://unrelated.example" },
        data: { status: "paid", updated_at: initial.invoice.updated_at },
      })
    ).status(),
  ).toBe(403);
  await page.getByRole("button", { name: "Mark paid", exact: true }).click();
  await expect(page.locator(".invoice-status")).toHaveText("paid");
  expect(
    (
      await page.request.patch("/api/invoices/" + id, {
        headers,
        data: { status: "unpaid", updated_at: initial.invoice.updated_at },
      })
    ).status(),
  ).toBe(409);
  await page.reload();
  await expect(page.locator(".invoice-status")).toHaveText("paid");
  const exported = await (
    await page.request.get(`/api/invoices/${id}/export`)
  ).json();
  expect(exported.invoice.customer_name).toBe(name);
  expect(exported.invoice.payload_hash).toBeUndefined();
  await page.getByRole("link", { name: "Invoices", exact: true }).click();
  await page.getByLabel("Customer name", { exact: true }).fill("zoë pri");
  await page.getByLabel("From date").fill("2026-10-03");
  await page.getByLabel("To date").fill("2026-10-03");
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  expect(page.url()).not.toContain("zo");
  await page.getByLabel("From date").fill("2026-10-04");
  await page.getByLabel("To date").fill("2026-10-04");
  await expect(
    page.getByRole("heading", { name: "No invoices found" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page
    .getByRole("link", { name: initial.invoice.invoice_number, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove customer details", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Remove customer details", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove customer details", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Customer details removed",
      exact: true,
    }),
  ).toBeVisible();
  const redacted = await (await page.request.get("/api/invoices/" + id)).json();
  expect(redacted.invoice.total_gbp).toBe(62);
  expect(redacted.invoice.items[0].description).toBe("Item 1");
  expect(redacted.invoice.customer_phone).toBe("");
  await page.getByRole("button", { name: "Void invoice", exact: true }).click();
  await page.getByRole("button", { name: "Confirm void" }).click();
  await expect(page.locator(".invoice-status")).toHaveText("void");
  expect(
    (
      await page.request.patch("/api/invoices/" + id, {
        headers,
        data: { status: "unpaid", updated_at: redacted.invoice.updated_at },
      })
    ).status(),
  ).toBe(409);
  await page.screenshot({
    path: "test-results/invoice-detail-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("Switch workspace").selectOption("inventory");
  await expect(page).toHaveURL(/\/inventory$/);
  await expect(
    page.getByRole("heading", { name: "Your inventory" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  expect(serverFailures).toEqual([]);
});

import { test, expect } from "@playwright/test";
import path from "node:path";
test("complete inventory workflow, photo persistence, rate snapshot, filtering, mobile and auth", async ({
  page,
  request,
}) => {
  const stamp = Date.now();
  const vendorA = `Jaipur ${stamp}`,
    vendorB = `Mumbai ${stamp}`;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/inventory");
  await expect(page).toHaveURL(/login/);
  expect((await request.get("/api/products")).status()).toBe(401);
  await page.getByLabel("Username").fill("SNPAdmin");
  await page.getByLabel("Password").fill("bad");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("p[role=alert]")).toContainText("incorrect");
  await page.getByLabel("Password").fill("SNPRocks");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/inventory/);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByLabel("INR per 1 GBP").fill("100");
  await page.getByRole("button", { name: "Save exchange rate" }).click();
  await expect(page.locator(".success[role=status]")).toContainText(
    "Exchange rate updated",
  );
  for (const name of [vendorA, vendorB]) {
    await page.getByLabel("Vendor name").fill(name);
    await page.getByRole("button", { name: "Add vendor", exact: true }).click();
    await expect(page.locator(".success[role=status]")).toContainText(
      "Vendor added",
    );
  }
  await page
    .getByRole("link", { name: "Add product", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Item name", { exact: true })
    .fill(`Kundan pearl set ${stamp}`);
  await page
    .getByLabel("Vendor", { exact: true })
    .selectOption({ label: vendorA });
  await page.getByLabel("Date", { exact: true }).fill("2026-10-02");
  await page
    .getByLabel("Item description")
    .fill("Gold finish, pearl drops and matching earrings.");
  await page.getByLabel("Price per piece (INR)").fill("1000");
  await page.getByLabel("Quantity").fill("10");
  await page.getByLabel("Discount (%)").fill("10");
  await page.getByLabel("Shipping (%)").fill("5");
  await page
    .locator("input[type=file]")
    .setInputFiles(path.resolve("public/logo.webp"));
  await expect(page.getByAltText("Product photo preview")).toBeVisible();
  await expect(page.locator(".gbp-cost strong")).toHaveText("£9.45");
  await expect(page.locator(".retail-cost strong")).toHaveText("£28.35");
  await page.screenshot({
    path: "test-results/product-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(page).toHaveURL(/inventory/);
  await expect(page.locator(".success[role=status]")).toContainText(
    "Product saved",
  );
  const row = page
    .getByRole("row")
    .filter({ hasText: `Kundan pearl set ${stamp}` });
  await expect(row).toBeVisible();
  await expect(row).toContainText("₹9,450.00");
  await expect(row).toContainText("£9.45");
  await expect(row).toContainText("£28.35");
  const src = await row.locator("img").getAttribute("src");
  expect(src).toBeTruthy();
  const photo = await page.request.get(src!);
  expect(photo.status()).toBe(200);
  expect(photo.headers()["content-type"]).toBe("image/webp");
  await page
    .getByLabel("Vendor", { exact: true })
    .selectOption({ label: vendorB });
  await expect(page.getByText("No products match these filters")).toBeVisible();
  await page
    .getByLabel("Vendor", { exact: true })
    .selectOption({ label: vendorA });
  await expect(row).toBeVisible();
  await page.getByLabel("From date").fill("2026-10-03");
  await expect(page.getByText("No products match these filters")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(row).toBeVisible();
  await page.reload();
  await expect(row).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByLabel("INR per 1 GBP").fill("120");
  await page.getByRole("button", { name: "Save exchange rate" }).click();
  await expect(page.locator(".success[role=status]")).toContainText("updated");
  await page.getByRole("link", { name: "Inventory", exact: true }).click();
  await expect(row).toContainText("£9.45");
  await row
    .getByRole("link", { name: `Edit Kundan pearl set ${stamp}` })
    .click();
  await expect(page.locator(".exchange-note")).toContainText("₹100");
  await page.getByLabel("Quantity").fill("5");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/inventory/);
  await expect(row).toContainText("₹4,725.00");
  await expect(row).toContainText("£9.45");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/inventory-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("link", { name: "Add product", exact: true })
    .first()
    .click();
  await expect(page.locator(".exchange-note")).toContainText("₹120");
  await page
    .getByLabel("Item name", { exact: true })
    .fill(`Mobile earrings ${stamp}`);
  await page
    .getByLabel("Vendor", { exact: true })
    .selectOption({ label: vendorB });
  await page.getByLabel("Price per piece (INR)").fill("1200");
  await expect(page.locator(".gbp-cost strong")).toHaveText("£10.00");
  await expect(page.locator(".retail-cost strong")).toHaveText("£30.00");
  await page.screenshot({
    path: "test-results/product-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(page).toHaveURL(/inventory/);
  await expect(page.locator(".success[role=status]")).toContainText(
    "Product saved",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/inventory-desktop.png",
    fullPage: true,
  });
  const result = await page.request.get("/api/products");
  const data = await result.json();
  const product = data.products.find(
    (p: { item_name: string }) => p.item_name === `Kundan pearl set ${stamp}`,
  );
  const crossOrigin = await page.request.patch("/api/config", {
    headers: { Origin: "https://untrusted.example" },
    data: { exchange_rate: 1 },
  });
  expect(crossOrigin.status()).toBe(403);
  const invalid = await page.request.post("/api/products", {
    headers: { Origin: "http://127.0.0.1:3010" },
    data: { ...product, quantity: 0 },
  });
  expect(invalid.status()).toBe(400);
  const stale = await page.request.put(`/api/products/${product.id}`, {
    headers: { Origin: "http://127.0.0.1:3010" },
    data: { ...product, updated_at: "2020-01-01T00:00:00Z" },
  });
  expect(stale.status()).toBe(409);
  await row
    .getByRole("button", { name: `Delete Kundan pearl set ${stamp}` })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await row
    .getByRole("button", { name: `Delete Kundan pearl set ${stamp}` })
    .click();
  await page
    .getByRole("button", { name: "Delete product", exact: true })
    .click();
  await expect(row).not.toBeVisible();
  await page
    .getByRole("button", { name: "Sign out", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/login/);
  expect((await page.request.get("/api/config")).status()).toBe(401);
  expect(errors).toEqual([]);
});

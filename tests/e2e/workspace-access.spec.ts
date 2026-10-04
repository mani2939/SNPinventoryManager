import { test, expect } from "@playwright/test";
import { SignJWT } from "jose";
import { testAccounts } from "../fixtures/workspace-auth.mjs";
test.use({ actionTimeout: 15000 });
test("new login is required between workspaces except master; old shared-admin cookies rejected", async ({
  page,
}) => {
  test.setTimeout(90000);
  const headers = { Origin: "http://127.0.0.1:3010" };
  const login = async (
    role: "inventory" | "invoicing" | "master",
    workspace: "inventory" | "invoicing",
  ) => {
    await page.goto("/login?workspace=" + workspace);
    await page.getByLabel("Username").fill(testAccounts[role].username);
    await page
      .getByLabel("Password", { exact: true })
      .fill(testAccounts[role].password);
    await page
      .getByRole("combobox", { name: "Workspace", exact: true })
      .selectOption(workspace);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  };
  await login("inventory", "inventory");
  await expect(page).toHaveURL(/\/inventory$/);
  await expect(page.getByLabel("Switch workspace")).toHaveCount(0);
  expect((await page.request.get("/api/invoices")).status()).toBe(403);
  expect((await page.request.get("/api/invoices/config")).status()).toBe(403);
  expect(
    (
      await page.request.post("/api/invoices/search", {
        headers,
        data: { name: "private" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post("/api/auth/login", {
        headers,
        data: { ...testAccounts.inventory, workspace: "invoicing" },
      })
    ).status(),
  ).toBe(401);
  await page.goto("/invoices");
  await expect(page).toHaveURL(/\/login\?workspace=invoicing$/);
  await login("invoicing", "invoicing");
  await expect(page).toHaveURL(/\/invoices$/);
  await expect(page.getByLabel("Switch workspace")).toHaveCount(0);
  expect((await page.request.get("/api/invoices/config")).status()).toBe(200);
  for (const endpoint of [
    "/api/products",
    "/api/config",
    "/api/products/00000000-0000-4000-8000-000000000000/photo",
  ])
    expect((await page.request.get(endpoint)).status(), endpoint).toBe(403);
  for (const endpoint of [
    "/api/products",
    "/api/vendors",
    "/api/product-types",
  ])
    expect(
      (await page.request.post(endpoint, { headers, data: {} })).status(),
    ).toBe(403);
  expect(
    (
      await page.request.get("/api/invoices/products?sku=ZZZ-BDZDD-999")
    ).status(),
  ).toBe(200);
  await page.goto("/products/new");
  await expect(page).toHaveURL(/\/login\?workspace=inventory$/);
  await page.goto("/invoices");
  await expect(page).toHaveURL(/\/invoices$/);
  await page
    .getByRole("button", { name: "Sign in to Inventory Manager", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login\?workspace=inventory$/);
  expect((await page.request.get("/api/invoices")).status()).toBe(401);
  await login("master", "inventory");
  await expect(page).toHaveURL(/\/inventory$/);
  await page.getByLabel("Switch workspace").selectOption("invoicing");
  await expect(page).toHaveURL(/\/invoices$/);
  expect((await page.request.get("/api/config")).status()).toBe(200);
  expect((await page.request.get("/api/invoices/config")).status()).toBe(200);
  const legacy = await new SignJWT({ role: "admin", workspace: "invoicing" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("snp-admin")
    .setIssuer("snp-inventory")
    .setAudience("snp-inventory")
    .setExpirationTime("1h")
    .sign(
      new TextEncoder().encode(
        "local-only-preview-secret-never-deploy-32chars",
      ),
    );
  await page
    .context()
    .addCookies([
      {
        name: "snp_session",
        value: legacy,
        url: "http://127.0.0.1:3010",
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);
  expect((await page.request.get("/api/invoices")).status()).toBe(401);
  expect((await page.request.get("/api/products")).status()).toBe(401);
  await page.goto("/invoices");
  await expect(page).toHaveURL(/\/login/);
});

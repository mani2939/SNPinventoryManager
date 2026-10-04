import { scryptSync } from "node:crypto";
export const testAccounts = {
  inventory: { username: "SNPAdmin", password: "SNPRocks" },
  invoicing: { username: "test-invoicing", password: "qa-invoice-secret" },
  master: { username: "test-master", password: "qa-master-secret" },
};
const hash = (p) =>
  "workspace-test:" + scryptSync(p, "workspace-test", 64).toString("hex");
export const testAccountEnv = {
  INVENTORY_USERNAME: testAccounts.inventory.username,
  INVENTORY_PASSWORD_HASH: hash(testAccounts.inventory.password),
  INVOICING_USERNAME: testAccounts.invoicing.username,
  INVOICING_PASSWORD_HASH: hash(testAccounts.invoicing.password),
  MASTER_USERNAME: testAccounts.master.username,
  MASTER_PASSWORD_HASH: hash(testAccounts.master.password),
};

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  verifyAccount,
  accountStamp,
  accounts,
  canAccess,
} from "../lib/auth-accounts.mjs";
import { assertAuthConfiguration } from "../lib/auth-config.mjs";
import { testAccounts, testAccountEnv } from "./fixtures/workspace-auth.mjs";
const env = {
  ...testAccountEnv,
  SESSION_SECRET: "test-session-secret-of-at-least-32-characters",
};
test("separate workspace credentials, master-only switching, disabling and credential versions", () => {
  for (const role of ["inventory", "invoicing", "master"])
    for (const workspace of ["inventory", "invoicing"]) {
      const user = testAccounts[role],
        r = verifyAccount(user.username, user.password, workspace, env);
      assert.equal(!!r, role === "master" || role === workspace);
      if (r) assert.equal(r.role, role);
      assert.equal(verifyAccount(user.username, "wrong", workspace, env), null);
    }
  assert(!canAccess("admin", "inventory"));
  assert.equal(verifyAccount("missing", "wrong", "inventory", env), null);
  const a = accounts(env).find((a) => a.role === "master");
  assert.notEqual(
    accountStamp(a),
    accountStamp({ ...a, hash: env.INVENTORY_PASSWORD_HASH }),
  );
  assert.doesNotThrow(() => assertAuthConfiguration(env));
  for (const patch of [
    { MASTER_PASSWORD_HASH: "" },
    { INVOICING_USERNAME: "" },
    { MASTER_USERNAME: env.INVOICING_USERNAME },
  ])
    assert.throws(() => assertAuthConfiguration({ ...env, ...patch }));
  assert.equal(
    verifyAccount(
      testAccounts.master.username,
      testAccounts.master.password,
      "inventory",
      { ...env, MASTER_USERNAME: "", MASTER_PASSWORD_HASH: "" },
    ),
    null,
  );
});

import { testAccountEnv } from "./tests/fixtures/workspace-auth.mjs";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:3010",
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
      args: process.env.PLAYWRIGHT_CHROMIUM_ARGS
        ? JSON.parse(process.env.PLAYWRIGHT_CHROMIUM_ARGS)
        : ["--no-sandbox", "--disable-dev-shm-usage"],
    },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 3010",
    url: "http://127.0.0.1:3010",
    env: {
      ...testAccountEnv,
      DEMO_MODE: "true",
      CUSTOMER_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 17).toString("base64"),
    },
    reuseExistingServer: false,
    timeout: 60000,
  },
});

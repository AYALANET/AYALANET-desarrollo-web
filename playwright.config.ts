import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:3100", launchOptions: { executablePath }, screenshot: "only-on-failure" },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    env: { NEXT_TELEMETRY_DISABLED: "1", STORE_DATABASE_PATH: join(tmpdir(), `ayalanet-e2e-${process.pid}.sqlite`) },
  },
});

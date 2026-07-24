import { defineConfig, devices } from "playwright/test";

const port = 18791;
const baseURL = `http://127.0.0.1:${port}`;
process.env.PLEX_PLAY_HISTORY_PROJECTION_ENABLED = "true";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "dashboard-regression.spec.mjs",
  globalSetup: "./tests/e2e/global-setup.mjs",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 20_000,
  expect: { timeout: 5_000 },
  reporter: [["list"]],
  outputDir: "test-results/dashboard-regression",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    serviceWorkers: "block"
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "narrow", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } }
  ]
});

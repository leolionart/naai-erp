import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? "3000");

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/real-ui-*.spec.ts", "**/real/**"],
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? "/tmp/naai-erp-playwright-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      grep: /@desktop/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      grep: /@mobile/,
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: `pnpm dev --webpack --hostname localhost --port ${port}`,
        url: `http://localhost:${port}/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          NEXT_PUBLIC_NAAI_ERP_DATA_SOURCE: process.env.NEXT_PUBLIC_NAAI_ERP_DATA_SOURCE ?? "local",
          NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
          NEXT_PUBLIC_ORGANIZATION_ID: process.env.NEXT_PUBLIC_ORGANIZATION_ID ?? "naai",
          NEXT_PUBLIC_API_TOKEN: process.env.NEXT_PUBLIC_API_TOKEN ?? "dev-token",
          NEXT_PUBLIC_FORCE_DEFAULT_API_CONNECTION:
            process.env.NEXT_PUBLIC_FORCE_DEFAULT_API_CONNECTION ?? "1",
          NEXT_PUBLIC_PURCHASE_PRODUCTS_API_URL:
            process.env.NEXT_PUBLIC_PURCHASE_PRODUCTS_API_URL ?? "",
          NEXT_PUBLIC_PURCHASE_PRODUCTS_API_TOKEN:
            process.env.NEXT_PUBLIC_PURCHASE_PRODUCTS_API_TOKEN ?? "dev-token",
        },
      },
});

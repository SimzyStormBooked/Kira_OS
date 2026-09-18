import { defineConfig, devices } from "@playwright/test";
import { fixture } from "./tests/e2e-connected/fixture-data";

/** Production app plus local simulated Supabase. Run after `npm run build`. */
export default defineConfig({
  testDir: "./tests/e2e-connected",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  outputDir: "test-results-connected",
  use: { baseURL: fixture.appUrl, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "connected-desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "connected-mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
  ],
  webServer: [
    { command: "npm exec -- tsx tests/e2e-connected/supabase-fixture.ts", url: `${fixture.supabaseUrl}/__test/health`, reuseExistingServer: false, timeout: 30000 },
    {
      command: "npm run start -- --port 3102",
      url: `${fixture.appUrl}/login`, reuseExistingServer: false, timeout: 60000,
      env: {
        KIRA_WORKSPACE_MODE: "connected", KIRA_AUTHOR_ID: fixture.authorId,
        NEXT_PUBLIC_APP_URL: fixture.appUrl,
        NEXT_PUBLIC_SUPABASE_URL: fixture.supabaseUrl,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: fixture.publishableKey,
        KIRA_AI_ENABLED: "false",
        KIRA_AI_RECORDING_KEY: "a".repeat(64),
        KIRA_META_APP_SECRET: "",
      },
    },
  ],
});

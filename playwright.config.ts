import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';

export default defineConfig({
  testDir: './e2e',
  outputDir: process.env.FIELDBOOK_BROWSER_OUTPUT || path.join(os.tmpdir(), 'fieldbook-browser-results'),
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5191', timezoneId: 'America/Phoenix', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...(process.env.FIELDBOOK_CHROME ? { channel: 'chrome' } : {}) } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5191 --strictPort',
    url: 'http://127.0.0.1:5191',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { VITE_SUPABASE_URL: 'https://fieldbook-audit.supabase.co', VITE_SUPABASE_ANON_KEY: 'synthetic-public-fixture', VITE_DIAGNOSTICS_ENABLED: 'false' },
  },
});

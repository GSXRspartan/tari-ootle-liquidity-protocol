import { defineConfig, devices } from '@playwright/test';

/**
 * Browser security harness.
 *
 * The flows here exist to prove the INVARIANTS, not to snapshot pixels. A
 * failure means a security property broke, so assertions target the exact text
 * and state the audit requires rather than a diff of the whole page.
 *
 * Browsers are installed in CI (`playwright install --with-deps`). A developer
 * working offline is never blocked: `test:e2e` is a separate script from
 * `test`, and the unit suite does not depend on it.
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  // Screenshots and traces are captured on failure so a CI failure is
  // diagnosable without re-running locally.
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
    {
      // Firefox coverage is CI-only. The Playwright-managed Firefox build is not
      // installed on every developer machine, and on a GPU-less host its
      // software WebRender exhausts memory across a full suite run
      // ("wr_renderer_render: OutOfMemory"), failing a different test each time
      // by pure contention. Forcing the basic compositor does not fix it, so
      // local runs use Chromium (see the `test:e2e` scripts) and CI installs
      // and runs Firefox on a real runner.
      name: 'firefox-desktop',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } },
    },
  ],
  // The mock provider is installed per page, so tests must not share state.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Firefox falls back to software rendering on CI and on machines without GPU
  // acceleration, which is several times slower than Chromium at the same
  // assertions. Workers are capped so the suite degrades predictably rather
  // than timing out under contention.
  workers: process.env.CI ? 2 : 2,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'test-results/html' }]] : 'list',
  timeout: 60_000,
  // Generous, because these assertions wait for the ABSENCE of a state (a
  // disabled control, a silent console), which requires the page to settle.
  expect: { timeout: 20_000 },
  webServer: {
    command: 'pnpm exec vite preview --port 4173 --host 127.0.0.1 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});

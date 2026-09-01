/**
 * playwright.config.js
 *
 * Playwright drives a real Chrome, on the real application, served by the real
 * Node server in server/server.js. These are the only tests in the project that
 * a browser is genuinely needed for, so there are deliberately few of them: they
 * cover the paths that only exist once every piece is wired together, i.e. does
 * a change actually survive a page reload.
 *
 * NO BROWSER DOWNLOAD
 * -------------------
 * channel: 'chrome' tells Playwright to drive the Google Chrome already
 * installed on this machine rather than downloading a private copy of Chromium,
 * which would be several hundred megabytes per student. If you would rather have
 * the bundled browser, i.e. so that every grader runs a byte for byte identical
 * one, delete the channel line and run:
 *
 *     npx playwright install chromium
 *
 * THE SERVER
 * ----------
 * The webServer block below starts our own Node server before the tests run and
 * stops it afterwards, on port 9100 rather than the usual 9000 so that these
 * tests never collide with a server you happen to have running while working.
 *
 * WHERE THIS FILE LIVES
 * ---------------------
 * In tests/, beside the specs it runs, rather than in the project root where
 * Playwright would find it by convention. The npm scripts point at it with
 * --config, so run the browser tests with `npm run test:e2e` rather than a bare
 * `npx playwright test`, which would find no configuration and no specs.
 *
 * Playwright resolves testDir against this file's own folder, and would do the
 * same for the server command's working directory, so the paths below say
 * explicitly which of the two they mean.
 */
import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PORT = Number(process.env.E2E_PORT) || 9100;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const OUTPUT = path.join(HERE, 'output');

export default defineConfig({
    // the browser tier sits beside this file, under tests/
    testDir: './e2e',

    // Everything Playwright generates goes under tests/output, together with the
    // coverage report Vitest writes: one directory holding every disposable
    // thing the suite produces, gitignored and safe to delete at any moment.
    outputDir: path.join(OUTPUT, 'test-results'),
    // every test file gets its own browser context, so local storage always
    // starts empty and no test can ever see what another test saved
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI
        ? [['github'], ['html', { open: 'never', outputFolder: path.join(OUTPUT, 'playwright-report') }]]
        : [['list'], ['html', { open: 'never', outputFolder: path.join(OUTPUT, 'playwright-report') }]],

    use: {
        baseURL: `http://localhost:${PORT}`,
        // a trace is a complete recording of a failed run: every action, the DOM
        // at each step, the console, the network. Open one with
        //     npx playwright show-trace tests/output/test-results/.../trace.zip
        trace: 'on-first-retry',
        screenshot: 'only-on-failure'
    },

    projects: [
        {
            name: 'chrome',
            use: { ...devices['Desktop Chrome'], channel: 'chrome' }
        }
    ],

    webServer: {
        command: `node server/server.js`,
        // without this the server would be started from tests/, where there is
        // no server/ folder to find
        cwd: ROOT,
        env: { PORT: String(PORT) },
        url: `http://localhost:${PORT}/index.html`,
        reuseExistingServer: !process.env.CI,
        stdout: 'ignore',
        stderr: 'pipe',
        timeout: 30_000
    }
});

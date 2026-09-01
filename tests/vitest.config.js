/**
 * vitest.config.js
 *
 * Vitest is our unit test runner. It was chosen over Jest for one specific
 * reason: every file in this project is a native ES module, and Vitest runs
 * native ES modules with no configuration and no build step at all. The very
 * same file the browser imports is the file the test imports.
 *
 * TWO AXES, KEPT SEPARATE
 * -----------------------
 * There are two independent questions to ask about any test, and they are easy
 * to confuse because both sound like "what kind of test is this".
 *
 *   SCOPE        how much of the application is involved? One class, several
 *                working together, or the whole thing end to end?
 *   ENVIRONMENT  what machinery does it need in order to run? Nothing at all,
 *                a fake DOM, or a real browser?
 *
 * The folders answer the first question, using the ordinary vocabulary:
 *
 *   tests/unit          one class, on its own
 *   tests/integration   several of our classes wired together
 *   tests/e2e           the whole application in a real browser (Playwright)
 *
 * The docblock at the top of each file answers the second. A file that needs a
 * document, wherever it lives, opens with the line
 *
 *     // @vitest-environment jsdom
 *
 * The two do not line up, which is exactly why they are recorded separately.
 * DataStorageManager is a unit test that needs a document, because local
 * storage belongs to the window. WolfieList is a unit test that needs nothing at
 * all, and the fact that it can pass with no document in existence is itself
 * evidence that the model really is independent of the user interface.
 *
 * jsdom is an implementation of the DOM written in JavaScript. It gives us
 * document, localStorage and events without ever opening a browser, which is why
 * these tests finish in milliseconds. What it does not give us is layout: jsdom
 * never measures anything, so getBoundingClientRect returns zeroes and
 * offsetParent is always null. The handful of tests that need those values say
 * so out loud by calling the helpers in tests/helpers/layout.js.
 *
 * WHERE THIS FILE LIVES
 * ---------------------
 * In tests/, beside the tests it runs, rather than in the project root where
 * Vitest would find it by convention. The npm scripts point at it with --config,
 * so run the tests with `npm test` rather than a bare `npx vitest`: without the
 * --config a bare run finds no configuration at all, and Vitest's own default
 * pattern would sweep up Playwright's *.spec.js files and fail on them.
 */
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// the project root is one level up from this file. Anchoring to it means every
// path below is written from the root, as it reads, whatever directory the
// runner was started in
const ROOT = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
    root: ROOT,
    test: {
        // plain Node is the default, and files that need a document opt in with
        // the @vitest-environment docblock described above
        environment: 'node',

        // all three tiers live under tests/, but this runner only owns two of
        // them. Note that Vitest looks for *.test.js while Playwright's specs
        // are named *.spec.js, so the two never collide even by accident.
        include: ['tests/unit/**/*.test.js', 'tests/integration/**/*.test.js'],

        // Playwright owns tests/e2e. Without this Vitest would try to run those
        // files too and fail on an import it knows nothing about.
        exclude: ['node_modules/**', 'tests/e2e/**', 'tests/output/**'],

        // DateUtil exists to avoid a time zone bug that only appears in the
        // evening in a zone behind UTC. Pinning the zone means that test proves
        // the same thing on a grader's machine in any part of the world.
        env: {
            TZ: 'America/New_York'
        },

        // undo every vi.spyOn and vi.stubGlobal between tests, so no test can
        // ever be affected by one that ran before it
        restoreMocks: true,
        unstubGlobals: true,

        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            // generated output lives beside Playwright's, under the one
            // directory that everything disposable is written to
            reportsDirectory: 'tests/output/coverage',
            include: ['public/js/**/*.js', 'public/lib/**/*.js'],
            // main.js is nothing but wiring, and it starts the application the
            // moment it is imported, so it is covered by the Playwright tests
            // rather than here
            exclude: ['public/js/main.js']
        }
    }
});

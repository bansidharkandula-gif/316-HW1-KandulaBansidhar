/**
 * first-visit.spec.js
 *
 * What a brand new user sees, in a real browser, served by the real Node server.
 *
 * This file earns its place because of what it exercises that no jsdom test can:
 * the server has to serve every one of our ES modules with a JavaScript MIME
 * type or Chrome refuses to load them, main.js has to run its top level await,
 * and the starter lists have to arrive over a real HTTP request. A mistake in any
 * of those produces a blank white page, and a blank white page is exactly what
 * this file would catch.
 */
import { test, expect } from '@playwright/test';
import {
    openApp, listCards, listNames, readSavedData,
    STARTER_LIST_NAMES, STARTER_LIST_SUBTITLES, SAMPLE_LIST_NAME
} from './support/app.js';

test.describe('a brand new user', () => {
    test('is given the example lists', async ({ page }) => {
        await openApp(page);

        await expect(listCards(page)).toHaveCount(STARTER_LIST_NAMES.length);
        expect(await listNames(page)).toEqual(STARTER_LIST_NAMES);
    });

    test('sees how much of each list is done', async ({ page }) => {
        await openApp(page);

        const subtitles = await page.locator('.list-card-subtitle').allTextContents();
        expect(subtitles).toEqual(STARTER_LIST_SUBTITLES);
    });

    test('lands on the home screen, not inside a list', async ({ page }) => {
        await openApp(page);

        await expect(page.locator('#home-view')).toBeVisible();
        await expect(page.locator('#list-view')).toBeHidden();
        await expect(page.locator('#modal-backdrop')).toBeHidden();
    });

    test('has the example lists saved as their own from the very first visit', async ({ page }) => {
        // they are ordinary lists the user owns, not a special read-only thing:
        // they can be renamed, edited and deleted, and deleted means deleted
        await openApp(page);

        const saved = await readSavedData(page);
        expect(saved.version).toBe(2);
        expect(saved.lists).toHaveLength(STARTER_LIST_NAMES.length);
        expect(saved.lists.map((list) => list.name)).toEqual(STARTER_LIST_NAMES);
    });

    test('gets an id for every list and every item', async ({ page }) => {
        // the starter file carries no ids at all, they are minted on the way in
        await openApp(page);

        const saved = await readSavedData(page);
        for (const list of saved.lists) {
            expect(list.id).toMatch(/^list-/);
            for (const item of list.items) {
                expect(item.id).toMatch(/^item-/);
            }
        }
    });

    test('sees the Wolfie logo beside the title', async ({ page }) => {
        // A broken <img> is one of the quietest failures on the Web: the page
        // still renders, still passes every other test, and simply shows a
        // little torn icon. So this checks that the file genuinely arrived and
        // decoded, rather than merely that the element is on the page.
        await openApp(page);

        const logo = page.locator('.app-logo');
        await expect(logo).toBeVisible();

        const decoded = await logo.evaluate(
            (img) => img.complete && img.naturalWidth > 0);
        expect(decoded, 'the logo image failed to load').toBe(true);
    });

    test('no longer shows the old Stony Brook University subheader', async ({ page }) => {
        await openApp(page);
        await expect(page.locator('.app-tagline')).toHaveCount(0);
    });

    test('loads every module without a console error', async ({ page }) => {
        // the single most useful assertion in this file. If the server sent a
        // .js file as text/plain, or a module had a syntax error, the page would
        // still return 200 and simply do nothing at all.
        const problems = [];
        page.on('console', (message) => {
            if (message.type() === 'error') problems.push(message.text());
        });
        page.on('pageerror', (error) => problems.push(error.message));

        await openApp(page);

        expect(problems).toEqual([]);
    });

    test('gives a returning user their own lists rather than the examples again', async ({ page }) => {
        await openApp(page);
        await page.locator('.list-card', { hasText: SAMPLE_LIST_NAME })
            .locator('[data-action="delete-list"]').click();
        await page.locator('#confirm-accept-button').click();
        await expect(listCards(page)).toHaveCount(STARTER_LIST_NAMES.length - 1);

        await page.reload();

        // the deleted example list stays deleted
        await expect(listCards(page)).toHaveCount(STARTER_LIST_NAMES.length - 1);
        expect(await listNames(page)).not.toContain(SAMPLE_LIST_NAME);
    });

    test('respects a user who has deleted every list', async ({ page }) => {
        await openApp(page);

        for (const name of STARTER_LIST_NAMES) {
            await page.locator('.list-card', { hasText: name })
                .locator('[data-action="delete-list"]').click();
            await page.locator('#confirm-accept-button').click();
        }
        await expect(page.locator('#home-empty-message')).toBeVisible();

        await page.reload();

        // an empty home screen, not the examples poured back in
        await expect(page.locator('#home-empty-message')).toBeVisible();
        await expect(listCards(page)).toHaveCount(0);
    });
});

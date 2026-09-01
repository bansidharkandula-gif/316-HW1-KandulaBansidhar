/**
 * persistence.spec.js
 *
 * Does a change actually survive the page being reloaded?
 *
 * This is the question that justifies the whole Playwright tier. The jsdom tests
 * can prove the model writes the right text into jsdom's implementation of local
 * storage, which is a fine thing to know and is not the same claim at all. Here
 * the storage is Chrome's own, the page really is torn down and rebuilt, and
 * every module is loaded again from the server.
 */
import { test, expect } from '@playwright/test';
import {
    openApp, openList, listCards, itemCards, itemCardAt, itemDescriptions,
    listNames, readSavedData, SAMPLE_ITEMS, STARTER_LIST_NAMES, SAMPLE_LIST_NAME
} from './support/app.js';

test.beforeEach(async ({ page }) => {
    await openApp(page);
});

test.describe('surviving a reload', () => {
    test('a new list is still there', async ({ page }) => {
        await page.locator('#add-list-button').click();
        await page.keyboard.type('Groceries');
        await page.keyboard.press('Enter');
        await page.locator('#close-button').click();

        await page.reload();

        await expect(listCards(page)).toHaveCount(STARTER_LIST_NAMES.length + 1);
        expect(await listNames(page)).toContain('Groceries');
    });

    test('a new item is still there, with all of its values', async ({ page }) => {
        await openList(page, SAMPLE_LIST_NAME);
        await page.locator('#add-item-button').click();
        await page.locator('#item-description-input').fill('Buy a new leash');
        await page.locator('#item-date-entered-input').fill('2026-09-20');
        await page.locator('#item-priority-select').selectOption('High');
        await page.locator('#item-ok-button').click();

        await page.reload();
        await openList(page, SAMPLE_LIST_NAME);

        await expect(itemCards(page)).toHaveCount(4);
        const card = itemCardAt(page, 3);
        await expect(card.locator('.item-description')).toHaveText('Buy a new leash');
        await expect(card.locator('.item-date-entered')).toHaveText('09/20/2026');
        await expect(card.locator('.priority-pill')).toHaveText('High');
    });

    test('a deletion stays deleted', async ({ page }) => {
        await openList(page, SAMPLE_LIST_NAME);
        await itemCardAt(page, 1).locator('[data-action="delete-item"]').click();
        await page.locator('#confirm-accept-button').click();

        await page.reload();
        await openList(page, SAMPLE_LIST_NAME);

        expect(await itemDescriptions(page)).toEqual([SAMPLE_ITEMS[0], SAMPLE_ITEMS[2]]);
    });

    test('a rename sticks', async ({ page }) => {
        await openList(page, SAMPLE_LIST_NAME);
        await page.locator('#list-name-input').fill('Weekend Plans');
        await page.keyboard.press('Enter');

        await page.reload();

        expect(await listNames(page)).toContain('Weekend Plans');
    });

    test('an item keeps its id, so it is genuinely the same item', async ({ page }) => {
        await openList(page, SAMPLE_LIST_NAME);
        const originalId = await itemCardAt(page, 0).getAttribute('data-item-id');

        await page.reload();
        await openList(page, SAMPLE_LIST_NAME);

        expect(await itemCardAt(page, 0).getAttribute('data-item-id')).toBe(originalId);
    });

    test('an undone change is saved as undone', async ({ page }) => {
        // the undo has to reach local storage too, not merely the screen
        await openList(page, SAMPLE_LIST_NAME);
        await itemCardAt(page, 0).locator('[data-action="duplicate-item"]').click();
        await expect(itemCards(page)).toHaveCount(4);

        await page.locator('#undo-button').click();
        await expect(itemCards(page)).toHaveCount(3);

        await page.reload();
        await openList(page, SAMPLE_LIST_NAME);

        await expect(itemCards(page)).toHaveCount(3);
    });
});

test.describe('what is not carried across a reload', () => {
    test('the undo history, which belongs to one visit to one list', async ({ page }) => {
        await openList(page, SAMPLE_LIST_NAME);
        await itemCardAt(page, 0).locator('[data-action="duplicate-item"]').click();
        await expect(page.locator('#undo-button')).toBeEnabled();

        await page.reload();
        await openList(page, SAMPLE_LIST_NAME);

        await expect(page.locator('#undo-button')).toBeDisabled();
        await expect(page.locator('#redo-button')).toBeDisabled();
        // the edit itself survived, only its history did not
        await expect(itemCards(page)).toHaveCount(4);
    });

    test('which list was open, since the application always starts at home', async ({ page }) => {
        await openList(page, SAMPLE_LIST_NAME);

        await page.reload();

        await expect(page.locator('#home-view')).toBeVisible();
        await expect(page.locator('#list-view')).toBeHidden();
    });
});

test.describe('what is written to local storage', () => {
    test('is a versioned envelope, so a later assignment can migrate it', async ({ page }) => {
        const saved = await readSavedData(page);

        expect(saved.version).toBe(2);
        expect(Array.isArray(saved.lists)).toBe(true);
        expect(Date.parse(saved.savedAt)).not.toBeNaN();
    });

    test('is written on every change, not only when the page is closed', async ({ page }) => {
        await openList(page, SAMPLE_LIST_NAME);
        await itemCardAt(page, 0).locator('[data-action="duplicate-item"]').click();

        // read it without reloading, i.e. the write already happened
        const saved = await readSavedData(page);
        const weekend = saved.lists.find((list) => list.name === SAMPLE_LIST_NAME);
        expect(weekend.items).toHaveLength(4);
    });

    test('carries every field of an item', async ({ page }) => {
        const saved = await readSavedData(page);
        const item = saved.lists[0].items[0];

        expect(Object.keys(item).sort()).toEqual(
            ['completed', 'dateEntered', 'description', 'id', 'priority', 'targetDate']);
    });
});

test.describe('recovering from damaged saved data', () => {
    test('sets it aside and starts empty rather than refusing to run', async ({ page }) => {
        await page.evaluate(() => {
            window.localStorage.setItem('cse316.wolfie-lists.v2', '{ not json at all');
        });

        await page.reload();

        // the user is told, in our own modal rather than a browser dialog
        await expect(page.locator('#alert-modal')).toBeVisible();
        await expect(page.locator('#alert-modal-title')).toContainText('Could Not Be Loaded');

        await page.locator('#alert-ok-button').click();
        await expect(page.locator('#home-empty-message')).toBeVisible();

        // and the unreadable data was set aside, not destroyed, so it can still
        // be recovered by hand from the browser dev tools
        const quarantined = await page.evaluate(() =>
            window.localStorage.getItem('cse316.wolfie-lists.unreadable'));
        expect(quarantined).toBe('{ not json at all');
    });

    test('lets the user carry on working afterwards', async ({ page }) => {
        await page.evaluate(() => {
            window.localStorage.setItem('cse316.wolfie-lists.v2', 'nonsense');
        });
        await page.reload();
        await page.locator('#alert-ok-button').click();

        await page.locator('#add-list-button').click();
        await page.keyboard.type('Starting over');
        await page.keyboard.press('Enter');
        await page.locator('#close-button').click();

        await page.reload();

        expect(await listNames(page)).toEqual(['Starting over']);
    });
});

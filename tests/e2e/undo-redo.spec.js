/**
 * undo-redo.spec.js
 *
 * The undo stack, driven through the toolbar and through the keyboard.
 *
 * The keyboard tests are the reason this file exists rather than living entirely
 * in jsdom. Ctrl+Z is a shortcut the browser itself also wants, our handler has
 * to call preventDefault to win it, and whether that actually works is a question
 * only a real browser can answer.
 */
import { test, expect } from '@playwright/test';
import {
    openApp, openList, itemCards, itemCardAt, itemDescriptions, SAMPLE_LIST_NAME, SAMPLE_ITEMS
} from './support/app.js';

/** on a Mac the shortcut is the command key */
const MODIFIER = process.platform === 'darwin' ? 'Meta' : 'Control';

test.beforeEach(async ({ page }) => {
    await openApp(page);
    await openList(page, SAMPLE_LIST_NAME);
});

test.describe('the toolbar buttons', () => {
    test('start greyed out on a freshly opened list', async ({ page }) => {
        await expect(page.locator('#undo-button')).toBeDisabled();
        await expect(page.locator('#redo-button')).toBeDisabled();
    });

    test('light up and grey out as the stack moves', async ({ page }) => {
        await itemCardAt(page, 0).locator('[data-action="duplicate-item"]').click();
        await expect(page.locator('#undo-button')).toBeEnabled();
        await expect(page.locator('#redo-button')).toBeDisabled();

        await page.locator('#undo-button').click();
        await expect(page.locator('#undo-button')).toBeDisabled();
        await expect(page.locator('#redo-button')).toBeEnabled();

        await page.locator('#redo-button').click();
        await expect(page.locator('#undo-button')).toBeEnabled();
        await expect(page.locator('#redo-button')).toBeDisabled();
    });

    test('undo an add', async ({ page }) => {
        await page.locator('#add-item-button').click();
        await page.locator('#item-description-input').fill('Buy a new leash');
        await page.locator('#item-ok-button').click();
        await expect(itemCards(page)).toHaveCount(4);

        await page.locator('#undo-button').click();

        expect(await itemDescriptions(page)).toEqual(SAMPLE_ITEMS);
    });

    test('undo a delete, and the item comes back where it was', async ({ page }) => {
        const originalId = await itemCardAt(page, 1).getAttribute('data-item-id');

        await itemCardAt(page, 1).locator('[data-action="delete-item"]').click();
        await page.locator('#confirm-accept-button').click();
        await expect(itemCards(page)).toHaveCount(2);

        await page.locator('#undo-button').click();

        expect(await itemDescriptions(page)).toEqual(SAMPLE_ITEMS);
        // the very same item, not a lookalike rebuilt from its words
        expect(await itemCardAt(page, 1).getAttribute('data-item-id')).toBe(originalId);
    });

    test('undo an edit', async ({ page }) => {
        await itemCardAt(page, 0).click();
        await page.locator('#item-description-input').fill('Something else entirely');
        await page.locator('#item-ok-button').click();

        await page.locator('#undo-button').click();

        await expect(itemCardAt(page, 0).locator('.item-description'))
            .toHaveText(SAMPLE_ITEMS[0]);
    });

    test('redo restores the same duplicate, with the same id', async ({ page }) => {
        await itemCardAt(page, 0).locator('[data-action="duplicate-item"]').click();
        const copyId = await itemCardAt(page, 1).getAttribute('data-item-id');

        await page.locator('#undo-button').click();
        await page.locator('#redo-button').click();

        expect(await itemCardAt(page, 1).getAttribute('data-item-id')).toBe(copyId);
    });

    test('unwind several edits in reverse order', async ({ page }) => {
        await itemCardAt(page, 0).locator('[data-action="duplicate-item"]').click();
        await itemCardAt(page, 3).locator('[data-action="duplicate-item"]').click();
        await expect(itemCards(page)).toHaveCount(5);

        await page.locator('#undo-button').click();
        await expect(itemCards(page)).toHaveCount(4);

        await page.locator('#undo-button').click();
        expect(await itemDescriptions(page)).toEqual(SAMPLE_ITEMS);
        await expect(page.locator('#undo-button')).toBeDisabled();
    });

    test('throw the redo away once something new is done', async ({ page }) => {
        await itemCardAt(page, 0).locator('[data-action="duplicate-item"]').click();
        await page.locator('#undo-button').click();
        await expect(page.locator('#redo-button')).toBeEnabled();

        await itemCardAt(page, 2).locator('[data-action="duplicate-item"]').click();

        await expect(page.locator('#redo-button')).toBeDisabled();
    });
});

test.describe('the keyboard shortcuts', () => {
    test.beforeEach(async ({ page }) => {
        await itemCardAt(page, 0).locator('[data-action="duplicate-item"]').click();
        await expect(itemCards(page)).toHaveCount(4);
        // make sure the caret is not sitting in the name field
        await page.locator('body').click({ position: { x: 5, y: 5 } });
    });

    test('undo on Ctrl+Z', async ({ page }) => {
        await page.keyboard.press(`${MODIFIER}+z`);
        await expect(itemCards(page)).toHaveCount(3);
    });

    test('redo on Ctrl+Y', async ({ page }) => {
        await page.keyboard.press(`${MODIFIER}+z`);
        await expect(itemCards(page)).toHaveCount(3);

        await page.keyboard.press(`${MODIFIER}+y`);
        await expect(itemCards(page)).toHaveCount(4);
    });

    test('redo on Ctrl+Shift+Z as well', async ({ page }) => {
        await page.keyboard.press(`${MODIFIER}+z`);
        await page.keyboard.press(`${MODIFIER}+Shift+z`);
        await expect(itemCards(page)).toHaveCount(4);
    });

    test('do nothing while a modal is up, since the modal owns the keyboard', async ({ page }) => {
        await page.locator('#add-item-button').click();
        await expect(page.locator('#item-modal')).toBeVisible();

        await page.keyboard.press(`${MODIFIER}+z`);

        await page.locator('#item-cancel-button').click();
        await expect(itemCards(page)).toHaveCount(4);
    });

    test('do nothing while the caret is in the name field', async ({ page }) => {
        // there Ctrl+Z belongs to the browser and means undo my typing
        await page.locator('#list-name-input').click();

        await page.keyboard.press(`${MODIFIER}+z`);

        await expect(itemCards(page)).toHaveCount(4);
    });

    test('do nothing on the home screen', async ({ page }) => {
        await page.locator('#close-button').click();
        await expect(page.locator('#home-view')).toBeVisible();

        await page.keyboard.press(`${MODIFIER}+z`);

        await expect(page.locator('#home-view')).toBeVisible();
    });
});

test.describe('the boundary between lists', () => {
    // Undo must never reach back across a list boundary and start undoing edits
    // made to a list the user is no longer looking at.
    test('forgets the history when the list is closed and reopened', async ({ page }) => {
        await itemCardAt(page, 0).locator('[data-action="duplicate-item"]').click();
        await expect(page.locator('#undo-button')).toBeEnabled();

        await page.locator('#close-button').click();
        await openList(page, SAMPLE_LIST_NAME);

        await expect(page.locator('#undo-button')).toBeDisabled();
        await expect(page.locator('#redo-button')).toBeDisabled();
        // the edit itself stands, it was only the history that was dropped
        await expect(itemCards(page)).toHaveCount(4);
    });

    test('forgets the history when a different list is opened', async ({ page }) => {
        await itemCardAt(page, 0).locator('[data-action="duplicate-item"]').click();

        await page.locator('#close-button').click();
        await openList(page, 'CSE 316 Homework 1');

        await expect(page.locator('#undo-button')).toBeDisabled();
    });
});

/**
 * drag-and-drop.spec.js
 *
 * Reordering items by dragging them.
 *
 * This is the one feature in the application that genuinely cannot be tested
 * without a browser. HTML5 drag and drop is a negotiation between the page and
 * the operating system: the browser decides whether a drag may begin, refuses to
 * allow a drop unless the page calls preventDefault on dragover, and carries the
 * payload in a DataTransfer object we never construct ourselves. jsdom
 * implements none of that.
 *
 * The companion tests in tests/integration/ListView.test.js check the arithmetic, i.e.
 * given a cursor at this position, which destination index does the view work
 * out. This file checks the other half: that Chrome delivers a cursor there at
 * all, and that the resulting move is a real, undoable transaction.
 */
import { test, expect } from '@playwright/test';
import {
    openApp, openList, itemCardAt, itemDescriptions, SAMPLE_LIST_NAME, SAMPLE_ITEMS
} from './support/app.js';

/**
 * Drags one card onto another and lets go on a chosen half of it.
 *
 * The half matters. Letting go on the upper half of a card means "put it above
 * this one", the lower half means "put it below", so a test that aimed at the
 * middle would be testing a coin toss.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} fromIndex the card to pick up
 * @param {number} toIndex the card to let go on
 * @param {string} half top or bottom
 */
async function dragCard(page, fromIndex, toIndex, half = 'bottom') {
    const source = itemCardAt(page, fromIndex);
    const target = itemCardAt(page, toIndex);

    const box = await target.boundingBox();
    const y = half === 'top' ? 4 : box.height - 4;

    await source.dragTo(target, {
        targetPosition: { x: box.width / 2, y },
        force: true
    });
}

test.beforeEach(async ({ page }) => {
    await openApp(page);
    await openList(page, SAMPLE_LIST_NAME);
    expect(await itemDescriptions(page)).toEqual(SAMPLE_ITEMS);
});

test.describe('reordering by dragging', () => {
    test('moves an item down the list', async ({ page }) => {
        await dragCard(page, 0, 2, 'bottom');

        expect(await itemDescriptions(page)).toEqual([
            SAMPLE_ITEMS[1], SAMPLE_ITEMS[2], SAMPLE_ITEMS[0]]);
    });

    test('moves an item up the list', async ({ page }) => {
        await dragCard(page, 2, 0, 'top');

        expect(await itemDescriptions(page)).toEqual([
            SAMPLE_ITEMS[2], SAMPLE_ITEMS[0], SAMPLE_ITEMS[1]]);
    });

    test('moves an item by a single position', async ({ page }) => {
        await dragCard(page, 0, 1, 'bottom');

        expect(await itemDescriptions(page)).toEqual([
            SAMPLE_ITEMS[1], SAMPLE_ITEMS[0], SAMPLE_ITEMS[2]]);
    });

    test('carries the item itself, not a copy of its words', async ({ page }) => {
        const movedId = await itemCardAt(page, 0).getAttribute('data-item-id');

        await dragCard(page, 0, 2, 'bottom');

        expect(await itemCardAt(page, 2).getAttribute('data-item-id')).toBe(movedId);
    });

    test('never changes how many items there are', async ({ page }) => {
        await dragCard(page, 0, 2, 'bottom');
        await expect(page.locator('.item-card')).toHaveCount(3);
    });

    test('renumbers the cards afterwards', async ({ page }) => {
        // every button on a card acts on the index stamped into it
        await dragCard(page, 0, 2, 'bottom');

        const indexes = await page.locator('.item-card')
            .evaluateAll((cards) => cards.map((card) => card.dataset.index));
        expect(indexes).toEqual(['0', '1', '2']);
    });
});

test.describe('a drag is an ordinary edit', () => {
    test('is undoable', async ({ page }) => {
        await dragCard(page, 0, 2, 'bottom');
        await expect(page.locator('#undo-button')).toBeEnabled();

        await page.locator('#undo-button').click();

        expect(await itemDescriptions(page)).toEqual(SAMPLE_ITEMS);
    });

    test('is redoable', async ({ page }) => {
        await dragCard(page, 0, 2, 'bottom');
        const moved = await itemDescriptions(page);

        await page.locator('#undo-button').click();
        await page.locator('#redo-button').click();

        expect(await itemDescriptions(page)).toEqual(moved);
    });

    test('is saved, and survives a reload', async ({ page }) => {
        await dragCard(page, 0, 2, 'bottom');
        const moved = await itemDescriptions(page);

        await page.reload();
        await openList(page, SAMPLE_LIST_NAME);

        expect(await itemDescriptions(page)).toEqual(moved);
    });
});

test.describe('a drag that goes nowhere', () => {
    test('records nothing when the card is dropped back on itself', async ({ page }) => {
        await dragCard(page, 1, 1, 'top');

        expect(await itemDescriptions(page)).toEqual(SAMPLE_ITEMS);
        await expect(page.locator('#undo-button')).toBeDisabled();
    });

    test('leaves no dragging marks on any card afterwards', async ({ page }) => {
        await dragCard(page, 0, 2, 'bottom');

        await expect(page.locator('.dragging')).toHaveCount(0);
        await expect(page.locator('.drop-before, .drop-after')).toHaveCount(0);
    });
});

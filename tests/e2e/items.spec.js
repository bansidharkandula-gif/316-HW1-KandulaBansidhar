/**
 * items.spec.js
 *
 * Adding, editing, duplicating and deleting items, through the real item editor
 * in a real browser.
 *
 * The date input is the reason several of these tests could not live in jsdom.
 * <input type="date"> is a genuine browser control with its own parsing and its
 * own idea of what a valid value is, and jsdom implements almost none of that.
 */
import { test, expect } from '@playwright/test';
import {
    openApp, openList, itemCards, itemCardAt, itemDescriptions, fillItemModal, displayDate,
    expectHeadingShowsItem,
    SAMPLE_LIST_NAME, SAMPLE_ITEMS, SAMPLE_LIST_ITEMS,
    SAMPLE_COMPLETED_INDEX, SAMPLE_UNFINISHED_INDEX
} from './support/app.js';

test.beforeEach(async ({ page }) => {
    await openApp(page);
    await openList(page, SAMPLE_LIST_NAME);
});

test.describe('adding an item', () => {
    test('adds it to the end of the list', async ({ page }) => {
        await page.locator('#add-item-button').click();
        await fillItemModal(page, { description: 'Buy a new leash', priority: 'High' });

        await expect(itemCards(page)).toHaveCount(4);
        expect(await itemDescriptions(page)).toEqual([...SAMPLE_ITEMS, 'Buy a new leash']);
    });

    test('opens the editor empty, dated today, with Previous and Next switched off', async ({ page }) => {
        await page.locator('#add-item-button').click();

        await expect(page.locator('#item-modal-heading')).toHaveText(/new/i);
        await expect(page.locator('#item-description-input')).toHaveValue('');
        await expect(page.locator('#item-description-input')).toBeFocused();
        await expect(page.locator('#item-previous-button')).toBeDisabled();
        await expect(page.locator('#item-next-button')).toBeDisabled();

        // the date field defaults to today, in the browser own time zone
        const today = await page.evaluate(() => {
            const now = new Date();
            const pad = (value) => String(value).padStart(2, '0');
            return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        });
        await expect(page.locator('#item-date-entered-input')).toHaveValue(today);
    });

    test('shows the new item with its priority and dates', async ({ page }) => {
        await page.locator('#add-item-button').click();
        await page.locator('#item-description-input').fill('Buy a new leash');
        await page.locator('#item-date-entered-input').fill('2026-09-20');
        await page.locator('#item-priority-select').selectOption('High');
        await page.locator('#item-target-date-input').fill('2026-09-27');
        await page.locator('#item-ok-button').click();

        const newCard = itemCardAt(page, 3);
        await expect(newCard.locator('.priority-pill')).toHaveText('High');
        await expect(newCard.locator('.item-date-entered')).toHaveText('09/20/2026');
        await expect(newCard.locator('.item-target-date')).toHaveText('09/27/2026');
        await expect(newCard).toHaveClass(/priority-high/);
    });

    test('leaves the target date empty until the user picks one', async ({ page }) => {
        await page.locator('#add-item-button').click();
        // a target date is the user's choice, so the modal does not guess at one
        await expect(page.locator('#item-target-date-input')).toHaveValue('');
        await expect(page.locator('#item-target-date-input')).toBeEnabled();

        await fillItemModal(page, { description: 'Buy a new leash' });

        await expect(itemCardAt(page, 3).locator('.item-target-date')).toHaveText('—');
    });

    test('adds nothing on Cancel', async ({ page }) => {
        await page.locator('#add-item-button').click();
        await fillItemModal(page, { description: 'Buy a new leash' }, 'cancel');

        await expect(itemCards(page)).toHaveCount(3);
        await expect(page.locator('#undo-button')).toBeDisabled();
    });

    test('adds nothing on Escape', async ({ page }) => {
        await page.locator('#add-item-button').click();
        await page.locator('#item-description-input').fill('Buy a new leash');
        await page.keyboard.press('Escape');

        await expect(page.locator('#item-modal')).toBeHidden();
        await expect(itemCards(page)).toHaveCount(3);
    });

    test('commits when Enter is pressed in the form', async ({ page }) => {
        await page.locator('#add-item-button').click();
        await page.locator('#item-description-input').fill('Buy a new leash');
        await page.keyboard.press('Enter');

        await expect(page.locator('#item-modal')).toBeHidden();
        await expect(itemCards(page)).toHaveCount(4);
    });
});

test.describe('an item with no description', () => {
    test('is refused, with the informative modal stacked on the editor', async ({ page }) => {
        await page.locator('#add-item-button').click();
        await page.locator('#item-description-input').fill('   ');
        await page.locator('#item-ok-button').click();

        await expect(page.locator('#alert-modal')).toBeVisible();
        await expect(page.locator('#alert-modal-title')).toHaveText('A Description Is Required');
        // the editor is still underneath, still holding what was typed
        await expect(page.locator('#item-modal')).toBeVisible();
        await expect(itemCards(page)).toHaveCount(3);
    });

    test('lets the user carry on once the warning is dismissed', async ({ page }) => {
        await page.locator('#add-item-button').click();
        await page.locator('#item-ok-button').click();
        await page.locator('#alert-ok-button').click();

        await expect(page.locator('#alert-modal')).toBeHidden();
        await expect(page.locator('#item-modal')).toBeVisible();

        await fillItemModal(page, { description: 'Buy a new leash' });
        await expect(itemCards(page)).toHaveCount(4);
    });
});

test.describe('editing an item', () => {
    test('opens on the item that was clicked, carrying all of its values', async ({ page }) => {
        const item = SAMPLE_LIST_ITEMS[1];
        await itemCardAt(page, 1).click();

        await expectHeadingShowsItem(page, 2, 3);
        await expect(page.locator('#item-description-input')).toHaveValue(item.description);
        await expect(page.locator('#item-date-entered-input')).toHaveValue(item.dateEntered);
        await expect(page.locator('#item-priority-select')).toHaveValue(item.priority);
        await expect(page.locator('#item-target-date-input')).toHaveValue(item.targetDate ?? '');
        await expect(page.locator('#item-completed-checkbox'))
            .toBeChecked({ checked: item.completed });
    });

    test('applies the change to the card', async ({ page }) => {
        await itemCardAt(page, 0).click();
        await fillItemModal(page, { description: 'Walk Wolfie twice', priority: 'Low' });

        await expect(itemCardAt(page, 0).locator('.item-description'))
            .toHaveText('Walk Wolfie twice');
        await expect(itemCardAt(page, 0).locator('.priority-pill')).toHaveText('Low');
        await expect(itemCardAt(page, 0)).toHaveClass(/priority-low/);
    });

    test('records nothing on the undo stack when nothing changed', async ({ page }) => {
        await itemCardAt(page, 0).click();
        await page.locator('#item-ok-button').click();

        await expect(page.locator('#undo-button')).toBeDisabled();
    });

    test('marks an item completed through the checkbox', async ({ page }) => {
        const index = SAMPLE_UNFINISHED_INDEX;
        await itemCardAt(page, index).click();

        await page.locator('#item-completed-checkbox').check();
        await page.locator('#item-ok-button').click();

        await expect(itemCardAt(page, index)).toHaveClass(/item-completed/);
        await expect(itemCardAt(page, index).locator('.item-completed-mark')).toHaveText('✓');
    });

    test('ticks the completed column, and only for the items that are done', async ({ page }) => {
        for (const [index, item] of SAMPLE_LIST_ITEMS.entries()) {
            await expect(itemCardAt(page, index).locator('.item-completed-mark'))
                .toHaveText(item.completed ? '✓' : '');
        }
    });

    test('shows each target date in the display format', async ({ page }) => {
        for (const [index, item] of SAMPLE_LIST_ITEMS.entries()) {
            await expect(itemCardAt(page, index).locator('.item-target-date'))
                .toHaveText(displayDate(item.targetDate));
        }
    });

    test('un-completes an item, leaving its target date alone', async ({ page }) => {
        // the target date says when the item was meant to be finished, so it has
        // no business changing because the item is no longer ticked off
        const index = SAMPLE_COMPLETED_INDEX;
        const targetDate = await itemCardAt(page, index).locator('.item-target-date').textContent();

        await itemCardAt(page, index).click();
        await page.locator('#item-completed-checkbox').uncheck();
        await expect(page.locator('#item-target-date-input')).toBeEnabled();
        await page.locator('#item-ok-button').click();

        await expect(itemCardAt(page, index)).not.toHaveClass(/item-completed/);
        await expect(itemCardAt(page, index).locator('.item-target-date')).toHaveText(targetDate);
        await expect(itemCardAt(page, index).locator('.item-completed-mark')).toHaveText('');
    });

    test('changes a target date without touching whether the item is done', async ({ page }) => {
        const index = SAMPLE_COMPLETED_INDEX;
        await itemCardAt(page, index).click();
        await page.locator('#item-target-date-input').fill('2026-09-30');
        await page.locator('#item-ok-button').click();

        await expect(itemCardAt(page, index).locator('.item-target-date')).toHaveText('09/30/2026');
        await expect(itemCardAt(page, index)).toHaveClass(/item-completed/);
    });

    test('walks the list with Next, saving each fix as it goes', async ({ page }) => {
        await itemCardAt(page, 0).click();
        await fillItemModal(page, { description: 'Fixed the first' }, 'next');

        await expectHeadingShowsItem(page, 2, 3);
        await expect(page.locator('#item-description-input')).toHaveValue(SAMPLE_ITEMS[1]);

        await fillItemModal(page, { description: 'Fixed the second' }, 'ok');

        expect(await itemDescriptions(page)).toEqual([
            'Fixed the first', 'Fixed the second', SAMPLE_ITEMS[2]]);
    });

    test('walks backwards with Previous', async ({ page }) => {
        await itemCardAt(page, 2).click();
        await expect(page.locator('#item-next-button')).toBeDisabled();

        await page.locator('#item-previous-button').click();

        await expectHeadingShowsItem(page, 2, 3);
    });

    test('switches Previous off on the first item and Next off on the last', async ({ page }) => {
        await itemCardAt(page, 0).click();
        await expect(page.locator('#item-previous-button')).toBeDisabled();
        await expect(page.locator('#item-next-button')).toBeEnabled();
        await page.locator('#item-cancel-button').click();

        await itemCardAt(page, 2).click();
        await expect(page.locator('#item-previous-button')).toBeEnabled();
        await expect(page.locator('#item-next-button')).toBeDisabled();
    });
});

test.describe('duplicating an item', () => {
    test('copies it in directly beneath, without asking', async ({ page }) => {
        await itemCardAt(page, 0).locator('[data-action="duplicate-item"]').click();

        await expect(itemCards(page)).toHaveCount(4);
        const descriptions = await itemDescriptions(page);
        expect(descriptions[0]).toBe(SAMPLE_ITEMS[0]);
        expect(descriptions[1]).toBe(SAMPLE_ITEMS[0]);
    });

    test('gives the copy an id of its own', async ({ page }) => {
        const originalId = await itemCardAt(page, 0).getAttribute('data-item-id');

        await itemCardAt(page, 0).locator('[data-action="duplicate-item"]').click();

        expect(await itemCardAt(page, 1).getAttribute('data-item-id')).not.toBe(originalId);
    });

    test('does not open the editor', async ({ page }) => {
        await itemCardAt(page, 0).locator('[data-action="duplicate-item"]').click();
        await expect(page.locator('#item-modal')).toBeHidden();
    });
});

test.describe('deleting an item', () => {
    test('asks first, and says the deletion can be undone', async ({ page }) => {
        await itemCardAt(page, 1).locator('[data-action="delete-item"]').click();

        await expect(page.locator('#confirm-modal')).toBeVisible();
        await expect(page.locator('#confirm-modal-title')).toHaveText('Delete This Item?');
        await expect(page.locator('#confirm-modal-message')).toContainText(SAMPLE_ITEMS[1]);
        await expect(page.locator('#confirm-modal-message')).toContainText('can undo this');
    });

    test('deletes on yes', async ({ page }) => {
        await itemCardAt(page, 1).locator('[data-action="delete-item"]').click();
        await page.locator('#confirm-accept-button').click();

        expect(await itemDescriptions(page)).toEqual([SAMPLE_ITEMS[0], SAMPLE_ITEMS[2]]);
    });

    test('keeps the item on no', async ({ page }) => {
        await itemCardAt(page, 1).locator('[data-action="delete-item"]').click();
        await page.locator('#confirm-decline-button').click();

        await expect(itemCards(page)).toHaveCount(3);
        await expect(page.locator('#undo-button')).toBeDisabled();
    });

    test('shows the invitation to start again once the list is empty', async ({ page }) => {
        for (let i = 0; i < 3; i++) {
            await itemCardAt(page, 0).locator('[data-action="delete-item"]').click();
            await page.locator('#confirm-accept-button').click();
        }

        await expect(page.locator('#list-empty-message')).toBeVisible();
        await expect(page.locator('.item-column-headers')).toBeHidden();
    });
});

test.describe('opening an item from the keyboard', () => {
    test('opens the editor on Enter', async ({ page }) => {
        await itemCardAt(page, 1).focus();
        await page.keyboard.press('Enter');

        await expect(page.locator('#item-modal')).toBeVisible();
        await expectHeadingShowsItem(page, 2, 3);
    });
});

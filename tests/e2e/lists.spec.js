/**
 * lists.spec.js
 *
 * Creating, renaming, duplicating and deleting whole lists, from the home screen.
 *
 * Note that none of these are undoable, by design: the assignment asks for
 * undo/redo of the edits made while inside a list, and the warning modal is what
 * guards a deletion instead.
 */
import { test, expect } from '@playwright/test';
import {
    openApp, openList, listCards, listNames, STARTER_LIST_NAMES, SAMPLE_LIST_NAME
} from './support/app.js';

test.beforeEach(async ({ page }) => {
    await openApp(page);
});

test.describe('creating a list', () => {
    test('opens it straight away with the name ready to be typed over', async ({ page }) => {
        await page.locator('#add-list-button').click();

        await expect(page.locator('#list-view')).toBeVisible();
        await expect(page.locator('#list-name-input')).toBeFocused();
        await expect(page.locator('#list-name-input')).toHaveValue('Untitled List');
        await expect(page.locator('#list-empty-message')).toBeVisible();
    });

    test('lets the user name it simply by typing', async ({ page }) => {
        await page.locator('#add-list-button').click();

        // the name arrives selected, so typing replaces it
        await page.keyboard.type('Groceries');
        await page.keyboard.press('Enter');

        await page.locator('#close-button').click();
        expect(await listNames(page)).toContain('Groceries');
    });

    test('numbers a second untitled list rather than repeating the name', async ({ page }) => {
        await page.locator('#add-list-button').click();
        await page.locator('#close-button').click();

        await page.locator('#add-list-button').click();

        await expect(page.locator('#list-name-input')).toHaveValue('Untitled List 2');
    });
});

test.describe('renaming a list', () => {
    test('shows the new name on the home screen', async ({ page }) => {
        await openList(page, SAMPLE_LIST_NAME);

        await page.locator('#list-name-input').fill('Weekend Plans');
        await page.keyboard.press('Enter');
        await page.locator('#close-button').click();

        expect(await listNames(page)).toContain('Weekend Plans');
        expect(await listNames(page)).not.toContain(SAMPLE_LIST_NAME);
    });

    test('can be undone, since it is an edit made inside the list', async ({ page }) => {
        await openList(page, SAMPLE_LIST_NAME);

        await page.locator('#list-name-input').fill('Weekend Plans');
        await page.keyboard.press('Enter');
        await expect(page.locator('#undo-button')).toBeEnabled();

        await page.locator('#undo-button').click();

        await expect(page.locator('#list-name-input')).toHaveValue(SAMPLE_LIST_NAME);
    });

    test('puts the old name back on Escape', async ({ page }) => {
        await openList(page, SAMPLE_LIST_NAME);

        await page.locator('#list-name-input').fill('Half typed nam');
        await page.keyboard.press('Escape');

        await expect(page.locator('#list-name-input')).toHaveValue(SAMPLE_LIST_NAME);
        await expect(page.locator('#undo-button')).toBeDisabled();
    });

    test('refuses to leave a list nameless', async ({ page }) => {
        await openList(page, SAMPLE_LIST_NAME);

        await page.locator('#list-name-input').fill('   ');
        await page.keyboard.press('Enter');

        await expect(page.locator('#list-name-input')).toHaveValue('Untitled List');
    });
});

test.describe('duplicating a list', () => {
    test('files the copy directly beneath the original', async ({ page }) => {
        await page.locator('.list-card', { hasText: SAMPLE_LIST_NAME })
            .locator('[data-action="duplicate-list"]').click();

        await expect(listCards(page)).toHaveCount(STARTER_LIST_NAMES.length + 1);
        const names = await listNames(page);
        // directly beneath means directly beneath, wherever the original sits
        // the copy's name is yours to choose, so long as it is not one another
        // list on the home screen is already using
        const original = STARTER_LIST_NAMES.indexOf(SAMPLE_LIST_NAME);
        expect(names[original]).toBe(SAMPLE_LIST_NAME);
        expect(names[original + 1]).not.toBe(SAMPLE_LIST_NAME);
        expect(new Set(names).size).toBe(names.length);
    });

    test('copies the items, and the copies are independent', async ({ page }) => {
        await page.locator('.list-card', { hasText: SAMPLE_LIST_NAME })
            .locator('[data-action="duplicate-list"]').click();

        // whatever the copy ended up being called, it is the card sitting
        // directly beneath the original
        const names = await listNames(page);
        const copyName = names[STARTER_LIST_NAMES.indexOf(SAMPLE_LIST_NAME) + 1];

        await openList(page, copyName);
        await expect(page.locator('.item-card')).toHaveCount(3);

        // delete an item from the copy
        await page.locator('.item-card').first()
            .locator('[data-action="delete-item"]').click();
        await page.locator('#confirm-accept-button').click();
        await expect(page.locator('.item-card')).toHaveCount(2);

        // the original still has all three
        await page.locator('#close-button').click();
        await openList(page, SAMPLE_LIST_NAME);
        await expect(page.locator('.item-card')).toHaveCount(3);
    });

    test('does not open the list it just copied', async ({ page }) => {
        await page.locator('.list-card', { hasText: 'CSE 316 Homework 1' })
            .locator('[data-action="duplicate-list"]').click();

        await expect(page.locator('#home-view')).toBeVisible();
        await expect(page.locator('#list-view')).toBeHidden();
    });
});

test.describe('deleting a list', () => {
    test('asks first, and warns that it cannot be undone', async ({ page }) => {
        await page.locator('.list-card', { hasText: SAMPLE_LIST_NAME })
            .locator('[data-action="delete-list"]').click();

        await expect(page.locator('#confirm-modal')).toBeVisible();
        await expect(page.locator('#confirm-modal-title')).toHaveText('Delete This List?');
        await expect(page.locator('#confirm-modal-message')).toContainText(SAMPLE_LIST_NAME);
        await expect(page.locator('#confirm-modal-message')).toContainText('cannot be undone');
    });

    test('starts with the focus on Cancel, never on the dangerous button', async ({ page }) => {
        // somebody hammering Enter must not be able to destroy a list by accident
        await page.locator('.list-card', { hasText: SAMPLE_LIST_NAME })
            .locator('[data-action="delete-list"]').click();

        await expect(page.locator('#confirm-decline-button')).toBeFocused();
    });

    test('deletes on yes', async ({ page }) => {
        await page.locator('.list-card', { hasText: SAMPLE_LIST_NAME })
            .locator('[data-action="delete-list"]').click();
        await page.locator('#confirm-accept-button').click();

        await expect(listCards(page)).toHaveCount(STARTER_LIST_NAMES.length - 1);
        expect(await listNames(page)).not.toContain(SAMPLE_LIST_NAME);
    });

    test('keeps the list on no', async ({ page }) => {
        await page.locator('.list-card', { hasText: SAMPLE_LIST_NAME })
            .locator('[data-action="delete-list"]').click();
        await page.locator('#confirm-decline-button').click();

        await expect(listCards(page)).toHaveCount(STARTER_LIST_NAMES.length);
    });

    test('keeps the list on Escape', async ({ page }) => {
        await page.locator('.list-card', { hasText: SAMPLE_LIST_NAME })
            .locator('[data-action="delete-list"]').click();
        await page.keyboard.press('Escape');

        await expect(page.locator('#confirm-modal')).toBeHidden();
        await expect(listCards(page)).toHaveCount(STARTER_LIST_NAMES.length);
    });

    test('shows the invitation to start again once every list is gone', async ({ page }) => {
        for (const name of await listNames(page)) {
            await page.locator('.list-card', { hasText: name })
                .locator('[data-action="delete-list"]').click();
            await page.locator('#confirm-accept-button').click();
        }

        await expect(page.locator('#home-empty-message')).toBeVisible();
        await expect(page.locator('#list-card-container')).toBeHidden();
    });
});

test.describe('the Wolfie button in the list toolbar', () => {
    test('returns to the home screen, like the close button', async ({ page }) => {
        await openList(page, SAMPLE_LIST_NAME);

        await page.locator('#home-button').click();

        await expect(page.locator('#home-view')).toBeVisible();
        await expect(page.locator('#list-view')).toBeHidden();
        await expect(listCards(page)).toHaveCount(STARTER_LIST_NAMES.length);
    });

    test('shows the logo, loaded and decoded', async ({ page }) => {
        await openList(page, SAMPLE_LIST_NAME);

        const logo = page.locator('#home-button .toolbar-logo');
        await expect(logo).toBeVisible();
        expect(await logo.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
    });

    test('fits inside the toolbar without pushing anything off the edge', async ({ page }) => {
        // the logo is wider than it is tall, so sizing it by height is what keeps
        // it inside the square button the arrows also use
        await openList(page, SAMPLE_LIST_NAME);

        const button = await page.locator('#home-button').boundingBox();
        const undo = await page.locator('#undo-button').boundingBox();
        const logo = await page.locator('#home-button .toolbar-logo').boundingBox();

        expect(Math.round(button.height)).toBe(Math.round(undo.height));
        expect(Math.round(button.width)).toBe(Math.round(undo.width));
        expect(logo.width).toBeLessThanOrEqual(button.width);
        expect(logo.height).toBeLessThanOrEqual(button.height);
        // and it sits to the left of undo, in the corner
        expect(button.x).toBeLessThan(undo.x);
    });

    test('carries an accessible name, since it is a real control', async ({ page }) => {
        await openList(page, SAMPLE_LIST_NAME);

        await expect(page.locator('#home-button'))
            .toHaveAccessibleName(/return to the home screen/i);
    });

    test('saves edits on the way out', async ({ page }) => {
        await openList(page, SAMPLE_LIST_NAME);
        await page.locator('.item-card').first()
            .locator('[data-action="duplicate-item"]').click();

        await page.locator('#home-button').click();
        await page.reload();
        await openList(page, SAMPLE_LIST_NAME);

        await expect(page.locator('.item-card')).toHaveCount(4);
    });
});

test.describe('the warning modal', () => {
    test('does not close when the backdrop is clicked', async ({ page }) => {
        // a modal exists to insist on an answer
        await page.locator('.list-card', { hasText: SAMPLE_LIST_NAME })
            .locator('[data-action="delete-list"]').click();

        await page.locator('#modal-backdrop').click({ position: { x: 5, y: 5 } });

        await expect(page.locator('#confirm-modal')).toBeVisible();
        await expect(listCards(page)).toHaveCount(STARTER_LIST_NAMES.length);
    });
});

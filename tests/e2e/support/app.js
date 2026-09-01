/**
 * app.js
 *
 * Shared helpers for the Playwright tests.
 *
 * These tests are deliberately few. Everything that can be proved without a
 * browser is proved in tests/, in milliseconds; what is left here is the handful
 * of things that only a real browser can answer:
 *
 *   - does the Node server actually serve the ES modules with the right MIME type
 *   - does the first ever visit really fetch and show the example lists
 *   - does a change really survive a page reload, in real local storage
 *   - does Chrome's own drag and drop really reorder a card
 *
 * Every test starts in a fresh browser context, which means empty local storage,
 * which means every test is a first ever visit. That is why the starter lists in
 * public/data/starter_lists.json are the fixture here: they are what a new user
 * genuinely sees.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';

/**
 * The example lists, read from the very file the application fetches.
 *
 * Spelling them out here instead would mean two copies of the same data, and the
 * copy in the test file would be the one nobody remembered to update. Reading
 * the file makes the example data free to change: rename a list, reorder them,
 * write a fourth, and these tests follow along.
 */
export const STARTER_LISTS = JSON.parse(readFileSync(
    fileURLToPath(new URL('../../../public/data/starter_lists.json', import.meta.url)),
    'utf8')).lists;

/** the names of the lists in public/data/starter_lists.json, in order */
export const STARTER_LIST_NAMES = STARTER_LISTS.map((list) => list.name);

/** what each list card's subtitle should read, in order */
export const STARTER_LIST_SUBTITLES = STARTER_LISTS.map((list) => (list.items.length === 0)
    ? 'No items yet'
    : `${list.items.filter((item) => item.completed).length} of ${list.items.length} completed`);

/**
 * The list most of these tests work in.
 *
 * It is found by shape rather than by name, because the example data is content
 * and content gets rewritten. What the tests actually need is a list of exactly
 * three items, at least one of them completed and at least one not: short enough
 * to assert on item by item, long enough to reorder by drag and drop and to
 * still have something left after a deletion, and mixed enough to tell a
 * finished item from an unfinished one.
 */
const SAMPLE_LIST = (() => {
    const sample = STARTER_LISTS.find((list) => list.items.length === 3
        && list.items.some((item) => item.completed)
        && list.items.some((item) => !item.completed));
    if (sample === undefined) {
        throw new Error(
            'the end to end tests need one starter list of exactly three items, at least one '
            + 'completed and at least one not, and public/data/starter_lists.json no longer '
            + 'has one');
    }
    return sample;
})();

/** the name of that list */
export const SAMPLE_LIST_NAME = SAMPLE_LIST.name;

/** its three items exactly as the file has them, in order */
export const SAMPLE_LIST_ITEMS = SAMPLE_LIST.items.map((item) => ({ ...item }));

/** the descriptions of those items, in order */
export const SAMPLE_ITEMS = SAMPLE_LIST_ITEMS.map((item) => item.description);

/** where the finished and the unfinished items sit, which the file decides */
export const SAMPLE_COMPLETED_INDEX = SAMPLE_LIST_ITEMS.findIndex((item) => item.completed);
export const SAMPLE_UNFINISHED_INDEX = SAMPLE_LIST_ITEMS.findIndex((item) => !item.completed);

/**
 * The item modal's heading is what tells a user where they have got to while
 * stepping through a list with Previous and Next, so it has to carry both the
 * position and the total. The sentence around those two numbers is the student's
 * to write, which is why this looks for the numbers rather than for a sentence.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} position which item is showing, counting from one
 * @param {number} total how many items the list holds
 */
export async function expectHeadingShowsItem(page, position, total) {
    const heading = page.locator('#item-modal-heading');
    await expect(heading).toHaveText(new RegExp(`\\b${position}\\b`));
    await expect(heading).toHaveText(new RegExp(`\\b${total}\\b`));
}

/**
 * @param {string|null} isoDate
 * @return {string} that date as an item card shows it, i.e. 08/20/2026
 */
export function displayDate(isoDate) {
    if (typeof isoDate !== 'string') return '—';
    const [year, month, day] = isoDate.split('-');
    return `${month}/${day}/${year}`;
}

/**
 * Opens the application and waits until the home screen has finished drawing.
 *
 * Waiting for a card rather than for a network event matters: on a first visit
 * the lists arrive from a fetch, so the page is interactive well before it has
 * anything on it.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function openApp(page) {
    await page.goto('/');
    await expect(page.locator('.list-card').first()).toBeVisible();
}

/**
 * Opens one of the lists on the home screen by name.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
export async function openList(page, name) {
    await page.locator('.list-card', { hasText: name }).first().click();
    await expect(page.locator('#list-view')).toBeVisible();
}

/** @return {import('@playwright/test').Locator} every list card on the home screen */
export const listCards = (page) => page.locator('#list-card-container .list-card');

/** @return {import('@playwright/test').Locator} every item card in the open list */
export const itemCards = (page) => page.locator('#item-card-container .item-card');

/** @return {import('@playwright/test').Locator} the item card at one position */
export const itemCardAt = (page, index) =>
    page.locator(`#item-card-container .item-card[data-index="${index}"]`);

/**
 * @return {Promise<string[]>} the descriptions of the items on screen, in order,
 * which is how these tests read an ordering
 */
export async function itemDescriptions(page) {
    return page.locator('#item-card-container .item-description').allTextContents();
}

/** @return {Promise<string[]>} the names of the lists on the home screen */
export async function listNames(page) {
    return page.locator('#list-card-container .list-card-title').allTextContents();
}

/**
 * Fills in the item editor and presses a button.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} values
 * @param {string} press one of ok, cancel, next, previous
 */
export async function fillItemModal(
    page, { description, priority, targetDate, completed } = {}, press = 'ok') {
    await expect(page.locator('#item-modal')).toBeVisible();

    if (description !== undefined) {
        await page.locator('#item-description-input').fill(description);
    }
    if (priority !== undefined) {
        await page.locator('#item-priority-select').selectOption(priority);
    }
    if (targetDate !== undefined) {
        await page.locator('#item-target-date-input').fill(targetDate);
    }
    if (completed !== undefined) {
        await page.locator('#item-completed-checkbox').setChecked(completed);
    }

    const buttons = {
        ok: '#item-ok-button',
        cancel: '#item-cancel-button',
        next: '#item-next-button',
        previous: '#item-previous-button'
    };
    await page.locator(buttons[press]).click();
}

/**
 * Reads what the application has actually written to local storage.
 *
 * This is the assertion the jsdom tests cannot make honestly, because there the
 * storage is jsdom's own implementation. Here it is Chrome's.
 *
 * @return {Promise<Object|null>}
 */
export async function readSavedData(page) {
    return page.evaluate(() => {
        const raw = window.localStorage.getItem('cse316.wolfie-lists.v2');
        return raw === null ? null : JSON.parse(raw);
    });
}

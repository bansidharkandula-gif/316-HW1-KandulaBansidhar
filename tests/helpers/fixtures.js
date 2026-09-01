/**
 * fixtures.js
 *
 * The sample data our tests are written against, plus the one function that puts
 * it into local storage.
 *
 * Notice that everything in here is a plain object rather than a WolfieList or a
 * ListItem. That is on purpose. Local storage holds text, not objects, so
 * building fixtures out of exactly the shape that comes back from JSON.parse is
 * both more honest and completely independent of our classes. A fixture that
 * imported WolfieList could not be used to test WolfieList reading bad data.
 *
 * Ids are spelled out rather than generated so that a failing test can say
 * "expected item-b" instead of "expected item-3f9c1a7e-...".
 */

/** the key DataStorageManager saves under. Deliberately repeated here rather
 *  than imported: if somebody changes the key in the source, this constant will
 *  not follow along, and the test that notices is doing its job. */
export const STORAGE_KEY = 'cse316.wolfie-lists.v2';
export const QUARANTINE_KEY = 'cse316.wolfie-lists.unreadable';

/**
 * @return {Object} one item, as it looks coming out of local storage
 */
export function makeItemJSON(overrides = {}) {
    return {
        id: 'item-a',
        description: 'Walk Wolfie',
        dateEntered: '2026-09-01',
        priority: 'High',
        targetDate: '2026-09-08',
        completed: false,
        ...overrides
    };
}

/**
 * @return {Object} one list, as it looks coming out of local storage
 */
export function makeListJSON(overrides = {}) {
    return {
        id: 'list-a',
        name: 'Errands',
        items: [
            makeItemJSON({ id: 'item-a', description: 'Walk Wolfie', priority: 'High' }),
            makeItemJSON({
                id: 'item-b',
                description: 'Refill the kibble bin',
                priority: 'Medium',
                targetDate: '2026-09-02',
                completed: true
            }),
            makeItemJSON({ id: 'item-c', description: 'Book the vet', priority: 'Low' })
        ],
        ...overrides
    };
}

/**
 * Two lists: one with three items, one empty. Between them they cover every
 * branch the home screen card can take, i.e. "1 of 3 completed" and "No items yet".
 *
 * @return {Object[]}
 */
export function makeListsJSON() {
    return [
        makeListJSON(),
        { id: 'list-b', name: 'Empty List', items: [] }
    ];
}

/**
 * Writes lists into local storage in exactly the shape DataStorageManager.saveLists
 * writes, so that a model loading them takes the ordinary path rather than a
 * repair path.
 *
 * Seeding storage also has a second effect worth understanding: it makes
 * hasSavedData() true, which is what stops the model from deciding this is a
 * first ever visit and going off to fetch the starter lists.
 *
 * @param {Object[]} lists defaults to makeListsJSON()
 */
export function seedStorage(lists = makeListsJSON()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 2,
        savedAt: '2026-09-01T12:00:00.000Z',
        lists
    }));
}

/**
 * @return {Object|null} whatever is currently saved, already parsed, so a test
 * can assert on what actually reached local storage
 */
export function readStorage() {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null ? null : JSON.parse(raw);
}

/**
 * The contents of public/data/starter_lists.json, trimmed down. Used by the
 * tests that stub fetch to check what a brand new user is given.
 */
export function makeStarterFileJSON() {
    return {
        description: 'test double for public/data/starter_lists.json',
        lists: [
            {
                name: "Wolfie's Weekend",
                items: [
                    {
                        description: 'Walk down the Staller steps', dateEntered: '2026-09-04',
                        priority: 'High', targetDate: '2026-09-07', completed: false
                    }
                ]
            },
            { name: 'CSE 316 Homework 1', items: [] }
        ]
    };
}

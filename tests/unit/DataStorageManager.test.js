// @vitest-environment jsdom

/**
 * DataStorageManager.test.js
 *
 * The first test file that needs a document, because local storage belongs to
 * the window. jsdom gives us a real working localStorage, so these tests read
 * and write it for real rather than through a mock.
 *
 * Two things make this class interesting to test. It is a Singleton, so its state
 * outlives any one object and has to be deliberately reset between tests, which
 * is what the vi.resetModules() in beforeEach is for. And most of its code is
 * error handling, so most of these tests are about a source misbehaving: local
 * storage being switched off, being full, or holding something we cannot read,
 * and the example lists file being missing or malformed.
 *
 * This class owns both sources, so the block at the bottom covers the second one:
 * fetching the example lists a brand new user is given. Node's fetch cannot open
 * the file:// url the real one resolves, so those tests answer the request
 * themselves.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { STORAGE_KEY, QUARANTINE_KEY, makeListsJSON } from '../helpers/fixtures.js';

/** the freshly imported module, rebuilt before each test so that the Singleton
 *  never carries state from one test into the next */
let DataStorageManager;
let StorageError;
let storage;

beforeEach(async () => {
    window.localStorage.clear();

    // a Singleton keeps its one instance in a static field, and a static field
    // lives as long as the module does. Emptying the module registry is what
    // gives the next test a genuinely new Singleton.
    vi.resetModules();
    const module = await import('../../public/js/data/DataStorageManager.js');
    DataStorageManager = module.DataStorageManager;
    StorageError = module.StorageError;
    storage = DataStorageManager.getInstance();
});

describe('the Singleton pattern', () => {
    it('hands back the same object every time', () => {
        expect(DataStorageManager.getInstance()).toBe(DataStorageManager.getInstance());
    });

    it('refuses to be constructed with new', () => {
        // this is what makes it a Singleton rather than merely a class people are
        // asked nicely not to instantiate twice
        expect(() => new DataStorageManager()).toThrow(/singleton/i);
    });

    it('closes the latch again after building the one instance', () => {
        // getInstance opens a private latch, constructs, and the constructor
        // closes it. If it did not, a second `new` would succeed.
        DataStorageManager.getInstance();
        expect(() => new DataStorageManager()).toThrow(/singleton/i);
    });
});

describe('isAvailable', () => {
    it('is true when local storage works', () => {
        expect(storage.isAvailable()).toBe(true);
    });

    it('leaves no probe key behind', () => {
        storage.isAvailable();
        expect(window.localStorage.length).toBe(0);
    });

    it('is false when local storage throws, i.e. in a private browsing mode', () => {
        // some browsers define localStorage and then throw the moment it is
        // used, which is why this class tests it by actually using it rather
        // than by checking whether the object exists
        vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
            throw new DOMException('The operation is insecure.', 'SecurityError');
        });

        expect(storage.isAvailable()).toBe(false);
    });
});

describe('hasSavedData', () => {
    it('is false on a browser that has never run the application', () => {
        expect(storage.hasSavedData()).toBe(false);
    });

    it('is true once something has been saved', () => {
        storage.saveLists([]);
        expect(storage.hasSavedData()).toBe(true);
    });

    // This is the distinction the class comment makes a point of, and it is a
    // real user-facing decision: somebody who has deliberately deleted all of
    // their lists must not be handed the example lists back on the next visit.
    it('is true even when the saved data is an empty collection of lists', () => {
        storage.saveLists([]);
        expect(storage.hasSavedData()).toBe(true);
        expect(storage.loadLists()).toEqual([]);
    });
});

describe('saveLists', () => {
    it('writes under the versioned key', () => {
        storage.saveLists([]);
        expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    });

    it('wraps the lists in an envelope carrying a version and a timestamp', () => {
        // the version is what lets a later assignment recognize and migrate data
        // written by this one
        storage.saveLists([]);
        const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));

        expect(saved.version).toBe(2);
        expect(saved.lists).toEqual([]);
        expect(Date.parse(saved.savedAt)).not.toBeNaN();
    });

    it('replaces whatever was there rather than appending', () => {
        storage.saveLists(makeListsJSON());
        storage.saveLists([]);
        expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)).lists).toEqual([]);
    });

    it('throws a StorageError, with advice, when the quota is full', () => {
        vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
            throw new DOMException('quota', 'QuotaExceededError');
        });

        expect(() => storage.saveLists([])).toThrow(StorageError);
        expect(() => storage.saveLists([])).toThrow(/no room left/i);
        // the message tells the user what they can actually do about it
        expect(() => storage.saveLists([])).toThrow(/deleting a list/i);
    });

    it('throws a StorageError for any other write failure', () => {
        vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
            throw new DOMException('nope', 'SecurityError');
        });

        expect(() => storage.saveLists([])).toThrow(StorageError);
        expect(() => storage.saveLists([])).toThrow(/could not be saved/i);
    });

    it('keeps the original error as the cause, for debugging', () => {
        const original = new DOMException('quota', 'QuotaExceededError');
        vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
            throw original;
        });

        try {
            storage.saveLists([]);
            expect.unreachable('saveLists should have thrown');
        } catch (error) {
            expect(error.cause).toBe(original);
        }
    });
});

describe('loadLists', () => {
    it('returns an empty array on a first ever run', () => {
        // nothing saved is a perfectly normal first run, not an error, so this
        // must not throw
        expect(storage.loadLists()).toEqual([]);
    });

    it('returns an empty array for a blank entry', () => {
        window.localStorage.setItem(STORAGE_KEY, '   ');
        expect(storage.loadLists()).toEqual([]);
    });

    it('reads back exactly what was saved', () => {
        storage.saveLists(makeListsJSON());
        const loaded = storage.loadLists();

        expect(loaded).toHaveLength(2);
        expect(loaded[0].name).toBe('Errands');
        expect(loaded[0].size()).toBe(3);
        expect(loaded[1].name).toBe('Empty List');
    });

    it('rebuilds real WolfieLists, not the plain objects JSON.parse produces', () => {
        storage.saveLists(makeListsJSON());
        const [list] = storage.loadLists();

        // if this returned plain objects the home screen would render and then
        // the first call to countCompleted would throw
        expect(typeof list.countCompleted).toBe('function');
        expect(list.countCompleted()).toBe(1);
        expect(list.getItemAt(0).isCompleted()).toBe(false);
    });

    it('accepts a bare array as well as an envelope', () => {
        // the starter lists file and local storage are deliberately kept
        // swappable, so both shapes have to be readable
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(makeListsJSON()));
        expect(storage.loadLists()).toHaveLength(2);
    });

    it('cleans up malformed items while reading, rather than refusing to load', () => {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
            version: 1,
            lists: [{ name: 'Broken', items: [{ description: 'A', priority: 'Nonsense' }] }]
        }));

        const [list] = storage.loadLists();
        expect(list.getItemAt(0).priority).toBe('Low');
    });

    describe('when the saved data cannot be read', () => {
        it('throws a StorageError for unparseable text', () => {
            window.localStorage.setItem(STORAGE_KEY, '{ this is not json');
            expect(() => storage.loadLists()).toThrow(StorageError);
        });

        it('throws a StorageError when the shape is wrong', () => {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, lists: 'nope' }));
            expect(() => storage.loadLists()).toThrow(/not in the expected format/i);
        });

        // Quarantining rather than deleting matters more than it might look.
        // A student whose data goes wrong at 2am can still get it back out of
        // dev tools, and "your work has been set aside" is a very different
        // message from "your work is gone".
        it('sets the unreadable payload aside rather than deleting it', () => {
            const original = '{ this is not json';
            window.localStorage.setItem(STORAGE_KEY, original);

            expect(() => storage.loadLists()).toThrow(StorageError);

            expect(window.localStorage.getItem(QUARANTINE_KEY)).toBe(original);
            expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
        });

        it('sets aside data of the wrong shape too', () => {
            const original = JSON.stringify({ version: 1, lists: 'nope' });
            window.localStorage.setItem(STORAGE_KEY, original);

            expect(() => storage.loadLists()).toThrow(StorageError);
            expect(window.localStorage.getItem(QUARANTINE_KEY)).toBe(original);
        });

        it('says in its message that the data was set aside, not destroyed', () => {
            window.localStorage.setItem(STORAGE_KEY, 'nonsense');
            expect(() => storage.loadLists()).toThrow(/set aside/i);
        });

        it('leaves the application able to start with an empty home screen', () => {
            // the model catches this error, so what matters is that the next
            // load succeeds rather than throwing again forever
            window.localStorage.setItem(STORAGE_KEY, 'nonsense');
            expect(() => storage.loadLists()).toThrow();
            expect(storage.loadLists()).toEqual([]);
        });
    });

    it('throws a StorageError when reading itself is forbidden', () => {
        vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
            throw new DOMException('nope', 'SecurityError');
        });

        expect(() => storage.loadLists()).toThrow(/will not let us read/i);
    });
});

describe('clear', () => {
    it('removes the saved lists and the quarantined payload', () => {
        storage.saveLists(makeListsJSON());
        window.localStorage.setItem(QUARANTINE_KEY, 'old rubbish');

        storage.clear();

        expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
        expect(window.localStorage.getItem(QUARANTINE_KEY)).toBeNull();
    });

    it('leaves anything another application saved alone', () => {
        // clear is offered to students to run from the browser console, so it
        // had better not empty the whole of local storage
        window.localStorage.setItem('someone-elses-key', 'keep me');
        storage.saveLists([]);

        storage.clear();

        expect(window.localStorage.getItem('someone-elses-key')).toBe('keep me');
    });
});

describe('loading the example lists', () => {
    /**
     * Answers the fetch the way the real starter file would. The url is never
     * opened: under Node it is a file:// url, which fetch refuses.
     */
    function answerWith(json, { ok = true, status = 200 } = {}) {
        const fetchStub = vi.fn(async () => ({ ok, status, json: async () => json }));
        vi.stubGlobal('fetch', fetchStub);
        return fetchStub;
    }

    const oneList = {
        lists: [{
            name: "Wolfie's Weekend",
            items: [
                { description: 'Walk Wolfie', dateEntered: '2026-09-04', priority: 'High' },
                { description: 'Refill the kibble bin', dateEntered: '2026-09-04', priority: 'Low', completed: true }
            ]
        }]
    };

    it('reads the file and rebuilds real WolfieLists', async () => {
        answerWith(oneList);

        const lists = await storage.loadStarterLists();

        expect(lists).toHaveLength(1);
        expect(lists[0].name).toBe("Wolfie's Weekend");
        // real objects, not the plain JSON that came out of the file
        expect(lists[0].size()).toBe(2);
        expect(lists[0].countCompleted()).toBe(1);
    });

    it('asks for the file beside the application, not beside the page', async () => {
        const fetchStub = answerWith(oneList);

        await storage.loadStarterLists();

        expect(String(fetchStub.mock.calls[0][0])).toMatch(/data\/starter_lists\.json$/);
    });

    it('mints ids, because the file deliberately carries none', async () => {
        answerWith(oneList);

        const [list] = await storage.loadStarterLists();

        expect(list.id).toMatch(/^list-/);
        expect(list.getItemAt(0).id).toMatch(/^item-/);
        expect(list.getItemAt(0).id).not.toBe(list.getItemAt(1).id);
    });

    it('accepts a bare array as well as an object with a lists property', async () => {
        // the same shapes loadLists accepts, which is what keeps the saved
        // payload and the example file swappable
        answerWith(oneList.lists);

        expect(await storage.loadStarterLists()).toHaveLength(1);
    });

    it('says so when the file is not there', async () => {
        answerWith({}, { ok: false, status: 404 });

        await expect(storage.loadStarterLists()).rejects.toThrow(/404/);
    });

    it('says so when the file is not a list of lists', async () => {
        answerWith({ nothing: 'useful' });

        await expect(storage.loadStarterLists()).rejects.toThrow(/does not contain a list of lists/);
    });
});

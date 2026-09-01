// @vitest-environment jsdom

/**
 * WolfieListsModel.test.js
 *
 * The model is a Subject, so almost every test here has the same shape: subscribe
 * a RecordingObserver, do something, then check both what the model now holds and
 * what it announced. Both halves matter. A model that changed correctly but told
 * nobody would leave the screen showing stale data, and that is a bug the model's
 * own state cannot reveal.
 *
 * This file needs jsdom only because the model saves to local storage. It never
 * touches the document, and it never imports anything from the view folder, which
 * is exactly the claim the design makes.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventTypes } from '../../public/js/common/EventTypes.js';
import { RecordingObserver } from '../helpers/observers.js';
import {
    STORAGE_KEY, seedStorage, readStorage, makeListsJSON, makeStarterFileJSON
} from '../helpers/fixtures.js';
import { stubStarterListsFetch } from '../helpers/app.js';

let WolfieListsModel;
let ListItem;
let model;
let observer;

/**
 * Builds a model from a clean module registry, so that the DataStorageManager
 * Singleton inside it is new as well. See tests/helpers/app.js for why.
 */
/**
 * Loads a transaction that may not have been written yet.
 *
 * Two of the tests below need AddItem_Transaction to put something on the undo
 * stack. A missing file in a plain import takes the whole test FILE down with
 * it, and the sixty tests in here that have nothing to do with transactions
 * would report as "0 test". Failing softly means only those two fail.
 *
 * @return {Promise<Function|null>} the class, or null if there is no file yet
 */
async function loadAddItemTransaction() {
    const specifier = '../../public/js/transactions/AddItem_Transaction.js';
    try {
        return (await import(/* @vite-ignore */ specifier)).AddItem_Transaction;
    } catch {
        return null;
    }
}

async function freshModel() {
    vi.resetModules();
    const [modelModule, itemModule] = await Promise.all([
        import('../../public/js/model/WolfieListsModel.js'),
        import('../../public/js/model/ListItem.js')
    ]);
    WolfieListsModel = modelModule.WolfieListsModel;
    ListItem = itemModule.ListItem;

    const built = new WolfieListsModel();
    observer = new RecordingObserver();
    built.subscribe(observer);
    return built;
}

beforeEach(async () => {
    window.localStorage.clear();
    model = await freshModel();
});

// ---------------------------------------------------------------------------
// startup
// ---------------------------------------------------------------------------
describe('load', () => {
    it('reads the lists that were saved on a previous visit', async () => {
        seedStorage();
        await model.load();

        expect(model.getLists()).toHaveLength(2);
        expect(model.getLists()[0].name).toBe('Errands');
        expect(observer.types).toContain(EventTypes.LISTS_CHANGED);
    });

    it('does not go looking for the starter lists when there is saved data', async () => {
        const fetchStub = stubStarterListsFetch(makeStarterFileJSON());
        seedStorage();

        await model.load();

        expect(fetchStub).not.toHaveBeenCalled();
    });

    it('respects a user who has deliberately deleted every list', async () => {
        // saved data exists, it is simply empty. Handing this user the example
        // lists back would be undoing a decision they made on purpose.
        const fetchStub = stubStarterListsFetch(makeStarterFileJSON());
        seedStorage([]);

        await model.load();

        expect(fetchStub).not.toHaveBeenCalled();
        expect(model.getLists()).toEqual([]);
    });

    describe('on a first ever visit', () => {
        it('fetches the example lists', async () => {
            const fetchStub = stubStarterListsFetch(makeStarterFileJSON());

            await model.load();

            expect(fetchStub).toHaveBeenCalledOnce();
            expect(model.getLists()).toHaveLength(2);
            expect(model.getLists()[0].name).toBe("Wolfie's Weekend");
        });

        it('gives the example lists and their items brand new ids', async () => {
            // the starter file deliberately carries no ids, so that loading it
            // twice could never produce two items claiming to be the same one
            stubStarterListsFetch(makeStarterFileJSON());
            await model.load();

            const [firstList] = model.getLists();
            expect(firstList.id).toMatch(/^list-/);
            expect(firstList.getItemAt(0).id).toMatch(/^item-/);
        });

        it('saves them immediately, so they are the user own lists from then on', async () => {
            stubStarterListsFetch(makeStarterFileJSON());
            await model.load();

            // once saved, deleting one of them makes it stay deleted
            expect(readStorage().lists).toHaveLength(2);
        });

        it('starts empty and explains itself when the example file cannot be read', async () => {
            stubStarterListsFetch(null);

            await model.load();

            expect(model.getLists()).toEqual([]);
            expect(observer.types).toContain(EventTypes.STARTER_LISTS_FAILED);
            expect(observer.first(EventTypes.STARTER_LISTS_FAILED).get('message'))
                .toMatch(/started empty/i);
        });

        it('still announces LISTS_CHANGED after that failure, so the screen draws', async () => {
            stubStarterListsFetch(null);
            await model.load();
            expect(observer.types).toContain(EventTypes.LISTS_CHANGED);
        });
    });

    describe('when local storage is switched off', () => {
        beforeEach(() => {
            vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
                throw new DOMException('The operation is insecure.', 'SecurityError');
            });
        });

        it('says so plainly, once, at startup', async () => {
            await model.load();

            const failure = observer.first(EventTypes.STORAGE_FAILED);
            expect(failure).toBeDefined();
            expect(failure.get('title')).toMatch(/nothing can be saved/i);
            expect(failure.get('message')).toMatch(/private browsing/i);
        });

        it('still starts, with an empty home screen, rather than refusing to run', async () => {
            await model.load();

            expect(model.getLists()).toEqual([]);
            expect(observer.types).toContain(EventTypes.LISTS_CHANGED);
        });

        it('does not go on to fetch the starter lists it could not save anyway', async () => {
            const fetchStub = stubStarterListsFetch(makeStarterFileJSON());
            await model.load();
            expect(fetchStub).not.toHaveBeenCalled();
        });
    });

    describe('when the saved data is unreadable', () => {
        beforeEach(() => {
            window.localStorage.setItem(STORAGE_KEY, '{ not json at all');
        });

        it('reports the problem and starts with an empty home screen', async () => {
            await model.load();

            expect(model.getLists()).toEqual([]);
            expect(observer.first(EventTypes.STORAGE_FAILED).get('title'))
                .toMatch(/could not be loaded/i);
        });

        it('does not treat the damaged visit as a first visit', async () => {
            // there WAS saved data, it simply could not be read. Pouring the
            // example lists on top would bury whatever was quarantined.
            const fetchStub = stubStarterListsFetch(makeStarterFileJSON());
            await model.load();
            expect(fetchStub).not.toHaveBeenCalled();
        });

        it('announces LISTS_CHANGED last, so the views draw the empty screen', async () => {
            await model.load();
            expect(observer.types.at(-1)).toBe(EventTypes.LISTS_CHANGED);
        });
    });
});

// ---------------------------------------------------------------------------
// the collection of lists
// ---------------------------------------------------------------------------
describe('createNewList', () => {
    beforeEach(async () => {
        seedStorage([]);
        await model.load();
        observer.clear();
    });

    it('adds an empty list and hands it back', () => {
        const list = model.createNewList();

        expect(list.isEmpty()).toBe(true);
        expect(model.getLists()).toContain(list);
    });

    it('names the first one Untitled List', () => {
        expect(model.createNewList().name).toBe('Untitled List');
    });

    it('numbers the ones after that, rather than repeating a name', () => {
        expect(model.createNewList().name).toBe('Untitled List');
        expect(model.createNewList().name).toBe('Untitled List 2');
        expect(model.createNewList().name).toBe('Untitled List 3');
    });

    it('fills a gap left by a deleted list', () => {
        const first = model.createNewList();
        const second = model.createNewList();
        model.deleteList(second.id);

        // "Untitled List 2" is free again now, so it gets used again
        expect(model.createNewList().name).toBe('Untitled List 2');
        expect(first.name).toBe('Untitled List');
    });

    it('saves and announces the change', () => {
        model.createNewList();

        expect(observer.types).toContain(EventTypes.LISTS_CHANGED);
        expect(readStorage().lists).toHaveLength(1);
    });
});

describe('duplicateList', () => {
    beforeEach(async () => {
        seedStorage();
        await model.load();
        observer.clear();
    });

    it('files the copy directly beneath the original', () => {
        // "Errands (Copy)" is one way to name it and any other will do, so what
        // this pins down is the part the user actually sees: the copy appears
        // immediately below the list it was made from, under a name of its own
        const copy = model.duplicateList('list-a');
        const names = model.getLists().map((list) => list.name);

        expect(names).toHaveLength(3);
        expect(names[0]).toBe('Errands');
        expect(names[1]).toBe(copy.name);
        expect(names[1]).not.toBe('Errands');
        expect(names[2]).toBe('Empty List');
    });

    it('copies every item, with new ids', () => {
        const copy = model.duplicateList('list-a');

        expect(copy.size()).toBe(3);
        expect(copy.getItemAt(0).description).toBe('Walk Wolfie');
        expect(copy.getItemAt(0).id).not.toBe('item-a');
    });

    it('gives a second copy a name of its own as well', () => {
        // duplicate the same list twice and there must still be no two lists
        // sharing a name. Numbering them is one answer; the scheme is yours
        const first = model.duplicateList('list-a');
        const second = model.duplicateList('list-a');
        const names = model.getLists().map((list) => list.name);

        expect(second.name).not.toBe(first.name);
        expect(new Set(names).size).toBe(names.length);
    });

    it('returns null and changes nothing for a list that does not exist', () => {
        expect(model.duplicateList('list-nonexistent')).toBeNull();
        expect(model.getLists()).toHaveLength(2);
    });

    it('saves and announces the change', () => {
        model.duplicateList('list-a');
        expect(observer.types).toContain(EventTypes.LISTS_CHANGED);
        expect(readStorage().lists).toHaveLength(3);
    });
});

describe('deleteList', () => {
    beforeEach(async () => {
        seedStorage();
        await model.load();
        observer.clear();
    });

    it('removes the list and reports that it did', () => {
        expect(model.deleteList('list-a')).toBe(true);
        expect(model.getLists().map((list) => list.id)).toEqual(['list-b']);
    });

    it('returns false for a list that does not exist', () => {
        expect(model.deleteList('list-nonexistent')).toBe(false);
        expect(model.getLists()).toHaveLength(2);
    });

    it('closes the list you are looking at if that is the one deleted', () => {
        model.openList('list-a');
        observer.clear();

        model.deleteList('list-a');

        expect(model.getCurrentList()).toBeNull();
        expect(model.hasCurrentList()).toBe(false);
        expect(observer.types).toContain(EventTypes.CURRENT_LIST_CHANGED);
    });

    it('leaves the open list alone when a different one is deleted', () => {
        model.openList('list-a');
        model.deleteList('list-b');
        expect(model.getCurrentList().id).toBe('list-a');
    });

    it('saves and announces the change', () => {
        model.deleteList('list-a');
        expect(observer.types).toContain(EventTypes.LISTS_CHANGED);
        expect(readStorage().lists).toHaveLength(1);
    });
});

describe('getListById', () => {
    beforeEach(async () => {
        seedStorage();
        await model.load();
    });

    it('finds a list', () => {
        expect(model.getListById('list-a').name).toBe('Errands');
    });

    it('returns null rather than undefined for a list that is not there', () => {
        expect(model.getListById('list-nonexistent')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// opening, closing, and the undo stack
// ---------------------------------------------------------------------------
describe('openList and closeCurrentList', () => {
    beforeEach(async () => {
        seedStorage();
        await model.load();
        observer.clear();
    });

    it('opens a list and announces it', () => {
        const list = model.openList('list-a');

        expect(list.id).toBe('list-a');
        expect(model.getCurrentList()).toBe(list);
        expect(observer.first(EventTypes.CURRENT_LIST_CHANGED).get('list')).toBe(list);
    });

    it('announces the state of the transaction stack when a list opens', () => {
        // the toolbar has to know whether to grey out undo and redo the moment
        // the screen appears, not after the first edit
        model.openList('list-a');

        const stackEvent = observer.first(EventTypes.TRANSACTION_STACK_CHANGED);
        expect(stackEvent.get('canUndo')).toBe(false);
        expect(stackEvent.get('canRedo')).toBe(false);
    });

    it('returns null for a list that does not exist, and opens nothing', () => {
        expect(model.openList('list-nonexistent')).toBeNull();
        expect(model.getCurrentList()).toBeNull();
    });

    it('closes a list and announces that nothing is open', () => {
        model.openList('list-a');
        observer.clear();

        model.closeCurrentList();

        expect(model.getCurrentList()).toBeNull();
        expect(observer.first(EventTypes.CURRENT_LIST_CHANGED).get('list')).toBeNull();
    });

    // This is the rule that keeps undo honest, and it is worth two tests.
    // Undoing an edit made to a list you are no longer looking at would change
    // data the user cannot see.
    it('empties the undo stack when a list is opened', async () => {
        const AddItem_Transaction = await loadAddItemTransaction();

        model.openList('list-a');
        model.addTransaction(new AddItem_Transaction(model, new ListItem({ description: 'X' }), 0));
        expect(model.hasTransactionToUndo()).toBe(true);

        model.openList('list-b');

        expect(model.hasTransactionToUndo()).toBe(false);
        expect(model.hasTransactionToRedo()).toBe(false);
    });

    it('empties the undo stack when a list is closed', async () => {
        const AddItem_Transaction = await loadAddItemTransaction();

        model.openList('list-a');
        model.addTransaction(new AddItem_Transaction(model, new ListItem({ description: 'X' }), 0));

        model.closeCurrentList();

        expect(model.hasTransactionToUndo()).toBe(false);
    });
});

describe('undo and redo', () => {
    let AddItem_Transaction;

    beforeEach(async () => {
        AddItem_Transaction = await loadAddItemTransaction();
        seedStorage();
        await model.load();
        model.openList('list-a');
        observer.clear();
    });

    const addX = () => model.addTransaction(
        new AddItem_Transaction(model, new ListItem({ description: 'X' }), 0));

    it('announces the stack state after a transaction is added', () => {
        addX();

        const stackEvent = observer.last(EventTypes.TRANSACTION_STACK_CHANGED);
        expect(stackEvent.get('canUndo')).toBe(true);
        expect(stackEvent.get('canRedo')).toBe(false);
    });

    it('announces the stack state after an undo', () => {
        addX();
        observer.clear();

        model.undo();

        const stackEvent = observer.last(EventTypes.TRANSACTION_STACK_CHANGED);
        expect(stackEvent.get('canUndo')).toBe(false);
        expect(stackEvent.get('canRedo')).toBe(true);
    });

    it('says nothing at all when there is nothing to undo', () => {
        // a no-op that still announced would make the toolbar flicker and would
        // make the event log much harder to read while debugging
        model.undo();
        expect(observer.count(EventTypes.TRANSACTION_STACK_CHANGED)).toBe(0);
    });

    it('says nothing at all when there is nothing to redo', () => {
        model.redo();
        expect(observer.count(EventTypes.TRANSACTION_STACK_CHANGED)).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// editing the open list
// ---------------------------------------------------------------------------
describe('the item level operations', () => {
    beforeEach(async () => {
        seedStorage();
        await model.load();
        model.openList('list-a');
        observer.clear();
    });

    describe('addItemToCurrentList', () => {
        it('adds at the index it is given and announces the list changed', () => {
            model.addItemToCurrentList(new ListItem({ description: 'X' }), 1);

            expect(model.getCurrentList().getItemAt(1).description).toBe('X');
            expect(observer.types).toContain(EventTypes.CURRENT_LIST_CHANGED);
        });

        it('adds at the end when given no index', () => {
            model.addItemToCurrentList(new ListItem({ description: 'X' }));
            expect(model.getCurrentList().getItemAt(3).description).toBe('X');
        });

        it('saves', () => {
            model.addItemToCurrentList(new ListItem({ description: 'X' }), 0);
            expect(readStorage().lists[0].items[0].description).toBe('X');
        });
    });

    describe('removeItemFromCurrentList', () => {
        it('removes the item and hands it back for the transaction to keep', () => {
            const removed = model.removeItemFromCurrentList(1);

            expect(removed.description).toBe('Refill the kibble bin');
            expect(model.getCurrentList().size()).toBe(2);
        });

        it('returns null and announces nothing for an index that is not there', () => {
            expect(model.removeItemFromCurrentList(99)).toBeNull();
            expect(observer.count(EventTypes.CURRENT_LIST_CHANGED)).toBe(0);
        });
    });

    describe('updateItemInCurrentList', () => {
        it('changes the item in place, keeping its identity', () => {
            // editing in place rather than swapping in a new object is what keeps
            // any reference held elsewhere, including by a transaction, valid
            const item = model.getCurrentList().getItemAt(0);

            model.updateItemInCurrentList(0, { description: 'Changed' });

            expect(model.getCurrentList().getItemAt(0)).toBe(item);
            expect(item.description).toBe('Changed');
        });

        it('does nothing for an index that is not there', () => {
            expect(() => model.updateItemInCurrentList(99, { description: 'X' })).not.toThrow();
            expect(observer.count(EventTypes.CURRENT_LIST_CHANGED)).toBe(0);
        });
    });

    describe('moveItemInCurrentList', () => {
        it('reorders and announces', () => {
            model.moveItemInCurrentList(0, 2);

            expect(model.getCurrentList().getItemAt(2).id).toBe('item-a');
            expect(observer.types).toContain(EventTypes.CURRENT_LIST_CHANGED);
        });

        it('announces nothing when the move was refused', () => {
            model.moveItemInCurrentList(1, 1);
            expect(observer.count(EventTypes.CURRENT_LIST_CHANGED)).toBe(0);
        });
    });

    describe('renameCurrentList', () => {
        it('renames the open list', () => {
            model.renameCurrentList('  Weekend  ');
            expect(model.getCurrentList().name).toBe('Weekend');
        });

        it('tells the home screen as well as the list screen', () => {
            // the home screen shows list names too, so a rename has to reach both
            model.renameCurrentList('Weekend');

            expect(observer.types).toContain(EventTypes.CURRENT_LIST_CHANGED);
            expect(observer.types).toContain(EventTypes.LISTS_CHANGED);
        });
    });

    // Every one of these is called from a transaction, and a transaction can
    // outlive the list it was built for, i.e. if an undo arrives after the list
    // was closed. None of them may throw.
    describe('with no list open', () => {
        beforeEach(() => {
            model.closeCurrentList();
            observer.clear();
        });

        it('addItemToCurrentList does nothing', () => {
            expect(() => model.addItemToCurrentList(new ListItem(), 0)).not.toThrow();
            expect(observer.count(EventTypes.CURRENT_LIST_CHANGED)).toBe(0);
        });

        it('removeItemFromCurrentList returns null', () => {
            expect(model.removeItemFromCurrentList(0)).toBeNull();
        });

        it('updateItemInCurrentList does nothing', () => {
            expect(() => model.updateItemInCurrentList(0, { description: 'X' })).not.toThrow();
        });

        it('moveItemInCurrentList does nothing', () => {
            expect(() => model.moveItemInCurrentList(0, 1)).not.toThrow();
        });

        it('renameCurrentList does nothing', () => {
            expect(() => model.renameCurrentList('X')).not.toThrow();
        });
    });
});

// ---------------------------------------------------------------------------
// saving
// ---------------------------------------------------------------------------
describe('when saving fails', () => {
    beforeEach(async () => {
        seedStorage();
        await model.load();
        observer.clear();
    });

    it('reports the failure but keeps the change in memory', () => {
        // the alternative, throwing away the user's edit because it could not be
        // written, would be considerably worse than telling them it is unsaved
        vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
            throw new DOMException('quota', 'QuotaExceededError');
        });

        const list = model.createNewList();

        expect(model.getLists()).toContain(list);
        expect(observer.first(EventTypes.STORAGE_FAILED).get('title'))
            .toMatch(/were not saved/i);
    });

    it('still announces LISTS_CHANGED, so the screen shows the change', () => {
        vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
            throw new DOMException('quota', 'QuotaExceededError');
        });

        model.createNewList();

        expect(observer.types).toContain(EventTypes.LISTS_CHANGED);
    });
});

describe('createListIterator', () => {
    it('walks the lists without exposing the array they live in', async () => {
        seedStorage();
        await model.load();

        expect([...model.createListIterator()].map((list) => list.name))
            .toEqual(['Errands', 'Empty List']);
    });
});

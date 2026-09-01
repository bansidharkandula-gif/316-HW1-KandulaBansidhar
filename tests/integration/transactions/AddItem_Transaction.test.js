// @vitest-environment jsdom

/**
 * AddItem_Transaction.test.js
 *
 * Every transaction test in this folder is built around the same question, and
 * it is the only question that really matters about an undo stack:
 *
 *     after any sequence of undos and redos, is the list exactly what it would
 *     have been if the user had done that sequence for real?
 *
 * "Exactly" includes the ids. A redo that produced an item carrying the same
 * words but a different id would look right on screen and be wrong underneath,
 * and every card in the list is keyed by id. That is the bug the class comment
 * in AddItem_Transaction warns about, and the identity tests below are what
 * would catch it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { openModel, descriptionsOf, idsOf } from '../../helpers/model.js';

let context;
let model;

beforeEach(async () => {
    context = await openModel();
    model = context.model;
});

/** the list opened by the fixture holds three items, A, B and C in effect */
const START = ['Walk Wolfie', 'Refill the kibble bin', 'Book the vet'];

function addAt(index, description = 'New item') {
    const item = new context.ListItem({ description });
    const transaction = new context.AddItem_Transaction(model, item, index);
    model.addTransaction(transaction);
    return { item, transaction };
}

describe('doing the transaction', () => {
    it('adds the item at the index it was built with', () => {
        addAt(1);
        expect(descriptionsOf(model)).toEqual([
            'Walk Wolfie', 'New item', 'Refill the kibble bin', 'Book the vet']);
    });

    it('adds at the front for index 0', () => {
        addAt(0);
        expect(descriptionsOf(model)[0]).toBe('New item');
    });

    it('adds at the end when built with the list size, which is what the modal does', () => {
        addAt(model.getCurrentList().size());
        expect(descriptionsOf(model).at(-1)).toBe('New item');
    });

    it('adds the very object it was given, not a copy of it', () => {
        const { item } = addAt(0);
        expect(model.getCurrentList().getItemAt(0)).toBe(item);
    });
});

describe('undoing', () => {
    it('takes the item back out', () => {
        addAt(1);
        model.undo();
        expect(descriptionsOf(model)).toEqual(START);
    });

    it('leaves the other items in their original order', () => {
        const before = idsOf(model);
        addAt(2);
        model.undo();
        expect(idsOf(model)).toEqual(before);
    });
});

describe('redoing', () => {
    it('puts the item back where it was', () => {
        addAt(1);
        model.undo();
        model.redo();

        expect(descriptionsOf(model)).toEqual([
            'Walk Wolfie', 'New item', 'Refill the kibble bin', 'Book the vet']);
    });

    // ------------------------------------------------------------------------
    // The heart of the matter. The controller builds the ListItem once and hands
    // it to the transaction, and the transaction holds onto it. If instead
    // doTransaction manufactured a new ListItem each time it ran, this test
    // would fail on the second redo, because IdGenerator would hand out a
    // different id and the item on screen would no longer be the item the rest
    // of the application thinks it is.
    // ------------------------------------------------------------------------
    it('restores the same object, with the same id, every time', () => {
        const { item } = addAt(1);
        const originalId = item.id;

        for (let round = 0; round < 3; round++) {
            model.undo();
            model.redo();
            expect(model.getCurrentList().getItemAt(1)).toBe(item);
            expect(model.getCurrentList().getItemAt(1).id).toBe(originalId);
        }
    });

    it('leaves the list identical to how it was before the undo', () => {
        addAt(1);
        const afterAdd = idsOf(model);

        model.undo();
        model.redo();

        expect(idsOf(model)).toEqual(afterAdd);
    });
});

describe('several adds in a row', () => {
    it('undoes them one at a time, newest first', () => {
        addAt(3, 'First added');
        addAt(4, 'Second added');

        model.undo();
        expect(descriptionsOf(model)).toEqual([...START, 'First added']);

        model.undo();
        expect(descriptionsOf(model)).toEqual(START);
    });

    it('redoes them one at a time, oldest first', () => {
        addAt(3, 'First added');
        addAt(4, 'Second added');
        model.undo();
        model.undo();

        model.redo();
        expect(descriptionsOf(model)).toEqual([...START, 'First added']);

        model.redo();
        expect(descriptionsOf(model)).toEqual([...START, 'First added', 'Second added']);
    });

    it('survives being driven all the way down and back up repeatedly', () => {
        addAt(3, 'First added');
        addAt(4, 'Second added');
        const settled = idsOf(model);

        for (let round = 0; round < 3; round++) {
            model.undo();
            model.undo();
            expect(descriptionsOf(model)).toEqual(START);
            model.redo();
            model.redo();
            expect(idsOf(model)).toEqual(settled);
        }
    });
});

describe('the transaction as an object', () => {
    it('describes itself well enough to read a transaction stack', () => {
        const { transaction } = addAt(2);
        expect(transaction.toString()).toBe('AddItem_Transaction(index 2)');
    });

    it('reaches the model through the model, never around it', () => {
        // the item has to be saved, and it is the model that saves. If a
        // transaction edited a WolfieList directly, nothing would ever reach
        // local storage and nothing would redraw.
        addAt(0);
        const saved = JSON.parse(window.localStorage.getItem('cse316.wolfie-lists.v2'));
        expect(saved.lists[0].items[0].description).toBe('New item');
    });
});

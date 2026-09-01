// @vitest-environment jsdom

/**
 * DeleteItem_Transaction.test.js
 *
 * This is the transaction that shows most clearly why a transaction has to
 * remember things. Undo cannot recreate a deleted item out of nothing, so
 * doTransaction keeps whatever the model handed back, and undo puts that very
 * object back.
 *
 * The test that matters most is "restores the same object" below. An
 * implementation that rebuilt the item from its values would pass every other
 * test in this file and still be wrong, because the rebuilt item would carry a
 * fresh id.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { openModel, descriptionsOf, idsOf } from '../../helpers/model.js';

let context;
let model;

beforeEach(async () => {
    context = await openModel();
    model = context.model;
});

const START = ['Walk Wolfie', 'Refill the kibble bin', 'Book the vet'];
const START_IDS = ['item-a', 'item-b', 'item-c'];

function deleteAt(index) {
    const transaction = new context.DeleteItem_Transaction(model, index);
    model.addTransaction(transaction);
    return transaction;
}

describe('doing the transaction', () => {
    it('removes the item at the index', () => {
        deleteAt(1);
        expect(descriptionsOf(model)).toEqual(['Walk Wolfie', 'Book the vet']);
    });

    it('can remove the first item', () => {
        deleteAt(0);
        expect(idsOf(model)).toEqual(['item-b', 'item-c']);
    });

    it('can remove the last item', () => {
        deleteAt(2);
        expect(idsOf(model)).toEqual(['item-a', 'item-b']);
    });
});

describe('undoing', () => {
    it('puts the item back in the position it came from', () => {
        deleteAt(1);
        model.undo();
        expect(descriptionsOf(model)).toEqual(START);
    });

    it('puts a deleted first item back at the front', () => {
        deleteAt(0);
        model.undo();
        expect(idsOf(model)).toEqual(START_IDS);
    });

    it('puts a deleted last item back at the end', () => {
        deleteAt(2);
        model.undo();
        expect(idsOf(model)).toEqual(START_IDS);
    });

    // ------------------------------------------------------------------------
    // The point of the whole class.
    // ------------------------------------------------------------------------
    it('restores the same object, not a rebuilt lookalike', () => {
        const original = model.getCurrentList().getItemAt(1);

        deleteAt(1);
        model.undo();

        expect(model.getCurrentList().getItemAt(1)).toBe(original);
        expect(model.getCurrentList().getItemAt(1).id).toBe('item-b');
    });

    it('restores every field, including a completion date', () => {
        // item-b is the completed one in the fixture, so this test would catch a
        // restore that only remembered the description
        const original = model.getCurrentList().getItemAt(1).getValues();

        deleteAt(1);
        model.undo();

        expect(model.getCurrentList().getItemAt(1).getValues()).toEqual(original);
        expect(model.getCurrentList().getItemAt(1).isCompleted()).toBe(true);
    });
});

describe('redoing', () => {
    it('removes the item again', () => {
        deleteAt(1);
        model.undo();
        model.redo();
        expect(descriptionsOf(model)).toEqual(['Walk Wolfie', 'Book the vet']);
    });

    it('keeps the item stable across many undo and redo cycles', () => {
        const original = model.getCurrentList().getItemAt(1);
        deleteAt(1);

        for (let round = 0; round < 3; round++) {
            model.undo();
            expect(model.getCurrentList().getItemAt(1)).toBe(original);
            model.redo();
            expect(idsOf(model)).toEqual(['item-a', 'item-c']);
        }
    });
});

describe('deleting several items', () => {
    it('undoes them one at a time, in reverse', () => {
        deleteAt(2);
        deleteAt(1);
        expect(descriptionsOf(model)).toEqual(['Walk Wolfie']);

        model.undo();
        expect(idsOf(model)).toEqual(['item-a', 'item-b']);

        model.undo();
        expect(idsOf(model)).toEqual(START_IDS);
    });

    it('rebuilds the whole list exactly after emptying it', () => {
        deleteAt(2);
        deleteAt(1);
        deleteAt(0);
        expect(model.getCurrentList().isEmpty()).toBe(true);

        model.undo();
        model.undo();
        model.undo();

        expect(idsOf(model)).toEqual(START_IDS);
        expect(descriptionsOf(model)).toEqual(START);
    });
});

describe('when there was nothing at that index', () => {
    // A transaction can be built from an index that is no longer valid. It must
    // not throw, and its undo must not invent an item out of the null it kept.
    it('changes nothing and undoes to nothing', () => {
        deleteAt(99);
        expect(idsOf(model)).toEqual(START_IDS);

        expect(() => model.undo()).not.toThrow();
        expect(idsOf(model)).toEqual(START_IDS);
    });
});

describe('the transaction as an object', () => {
    it('describes itself well enough to read a transaction stack', () => {
        expect(deleteAt(1).toString()).toBe('DeleteItem_Transaction(index 1)');
    });
});

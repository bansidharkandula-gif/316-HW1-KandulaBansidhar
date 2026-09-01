// @vitest-environment jsdom

/**
 * DuplicateItem_Transaction.test.js
 *
 * Duplicating is the Prototype pattern applied to a single item: the transaction
 * never builds a ListItem itself, it asks the item being copied to clone itself.
 *
 * There is one subtlety worth reading the tests for. The copy is made on the
 * FIRST doTransaction and then kept, so that redo hands back the same copy rather
 * than making a second one. Without that, undo followed by redo would produce a
 * duplicate with a different id every time, and the undo stack below it would be
 * pointing at an item that no longer exists.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { openModel, descriptionsOf, idsOf } from '../../helpers/model.js';

let context;
let model;

beforeEach(async () => {
    context = await openModel();
    model = context.model;
});

const START_IDS = ['item-a', 'item-b', 'item-c'];

function duplicateAt(index) {
    const transaction = new context.DuplicateItem_Transaction(model, index);
    model.addTransaction(transaction);
    return transaction;
}

describe('doing the transaction', () => {
    it('puts the copy directly beneath the original', () => {
        duplicateAt(0);
        expect(descriptionsOf(model)).toEqual([
            'Walk Wolfie', 'Walk Wolfie', 'Refill the kibble bin', 'Book the vet']);
    });

    it('copies every field of the item', () => {
        // item-b is completed and Medium priority, so a copy that only carried
        // the description would be caught here
        duplicateAt(1);
        const original = model.getCurrentList().getItemAt(1);
        const copy = model.getCurrentList().getItemAt(2);

        expect(copy.getValues()).toEqual(original.getValues());
        expect(copy.isCompleted()).toBe(true);
    });

    it('gives the copy an id of its own', () => {
        duplicateAt(0);
        const copy = model.getCurrentList().getItemAt(1);

        expect(copy.id).not.toBe('item-a');
        expect(copy.id).toMatch(/^item-/);
    });

    it('leaves the original exactly as it was', () => {
        duplicateAt(0);
        const original = model.getCurrentList().getItemAt(0);
        expect(original.id).toBe('item-a');
        expect(original.description).toBe('Walk Wolfie');
    });

    it('duplicates the last item onto the end of the list', () => {
        duplicateAt(2);
        expect(model.getCurrentList().size()).toBe(4);
        expect(descriptionsOf(model).at(-1)).toBe('Book the vet');
    });

    it('changes nothing when the index is not there', () => {
        duplicateAt(99);
        expect(idsOf(model)).toEqual(START_IDS);
    });
});

describe('undoing', () => {
    it('removes the copy and leaves the original', () => {
        duplicateAt(0);
        model.undo();
        expect(idsOf(model)).toEqual(START_IDS);
    });

    it('removes the copy rather than the original', () => {
        // both cards look identical on screen, so getting this backwards would
        // be very easy to miss by eye and very obvious in the data
        duplicateAt(0);
        const copyId = model.getCurrentList().getItemAt(1).id;

        model.undo();

        expect(idsOf(model)).toContain('item-a');
        expect(idsOf(model)).not.toContain(copyId);
    });
});

describe('redoing', () => {
    // ------------------------------------------------------------------------
    // The reason the copy is built once and kept.
    // ------------------------------------------------------------------------
    it('brings back the same copy, with the same id, every time', () => {
        duplicateAt(0);
        const copy = model.getCurrentList().getItemAt(1);
        const copyId = copy.id;

        for (let round = 0; round < 3; round++) {
            model.undo();
            model.redo();
            expect(model.getCurrentList().getItemAt(1)).toBe(copy);
            expect(model.getCurrentList().getItemAt(1).id).toBe(copyId);
        }
    });

    it('never grows the list beyond one extra item, no matter how many redos', () => {
        duplicateAt(0);
        for (let round = 0; round < 5; round++) {
            model.undo();
            model.redo();
        }
        expect(model.getCurrentList().size()).toBe(4);
    });
});

describe('duplicating a duplicate', () => {
    it('gives every copy an id of its own', () => {
        duplicateAt(0);
        duplicateAt(1);

        const ids = idsOf(model);
        expect(ids).toHaveLength(5);
        expect(new Set(ids).size).toBe(5);
    });

    it('undoes back to exactly the original list', () => {
        duplicateAt(0);
        duplicateAt(1);

        model.undo();
        model.undo();

        expect(idsOf(model)).toEqual(START_IDS);
    });
});

describe('the transaction as an object', () => {
    it('describes itself well enough to read a transaction stack', () => {
        expect(duplicateAt(1).toString()).toBe('DuplicateItem_Transaction(index 1)');
    });
});

// @vitest-environment jsdom

/**
 * EditItem_Transaction.test.js
 *
 * An edit is recorded as two snapshots: the values before, and the values after.
 * The class comment explains why both have to be snapshots taken with
 * getValues() rather than references to the item, and the first test in the
 * "snapshots, not references" block below is what proves the comment right.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { openModel } from '../../helpers/model.js';

// valuesAreEqual is a static that compares two plain objects. It touches no
// module state at all, so unlike the transaction classes themselves it is safe
// to import once at the top rather than out of the freshly built module graph.
import { EditItem_Transaction } from '../../../public/js/transactions/EditItem_Transaction.js';

let context;
let model;

beforeEach(async () => {
    context = await openModel();
    model = context.model;
});

/** the values item-a starts with, per the fixture */
const ORIGINAL_VALUES = {
    description: 'Walk Wolfie',
    dateEntered: '2026-09-01',
    priority: 'High',
    targetDate: '2026-09-08',
    completed: false
};

const EDITED_VALUES = {
    description: 'Walk Wolfie twice',
    dateEntered: '2026-09-03',
    priority: 'Low',
    targetDate: '2026-09-04',
    completed: true
};

/**
 * Records an edit exactly as AppController does: read the item's current values
 * as the "before", and hand in the new ones as the "after".
 */
function editItem(index, newValues) {
    const oldValues = model.getCurrentList().getItemAt(index).getValues();
    const transaction = new context.EditItem_Transaction(model, index, oldValues, newValues);
    model.addTransaction(transaction);
    return transaction;
}

const valuesAt = (index) => model.getCurrentList().getItemAt(index).getValues();

describe('doing the transaction', () => {
    it('applies every new value', () => {
        editItem(0, EDITED_VALUES);
        expect(valuesAt(0)).toEqual(EDITED_VALUES);
    });

    it('edits the item in place, keeping its identity', () => {
        // this is what lets the item card, and anything else holding a
        // reference, stay valid across an edit
        const item = model.getCurrentList().getItemAt(0);

        editItem(0, EDITED_VALUES);

        expect(model.getCurrentList().getItemAt(0)).toBe(item);
        expect(item.id).toBe('item-a');
    });

    it('does not disturb the other items', () => {
        editItem(0, EDITED_VALUES);
        expect(valuesAt(1).description).toBe('Refill the kibble bin');
        expect(valuesAt(2).description).toBe('Book the vet');
    });

    it('can mark an item completed', () => {
        editItem(0, { ...ORIGINAL_VALUES, completed: true });
        expect(model.getCurrentList().getItemAt(0).isCompleted()).toBe(true);
    });

    it('can mark a completed item as not completed again', () => {
        // item-b starts completed
        editItem(1, { ...valuesAt(1), completed: false });
        expect(model.getCurrentList().getItemAt(1).isCompleted()).toBe(false);
    });

    it('can change the target date without changing whether the item is done', () => {
        editItem(0, { ...ORIGINAL_VALUES, targetDate: '2026-09-30' });
        expect(model.getCurrentList().getItemAt(0).targetDate).toBe('2026-09-30');
        expect(model.getCurrentList().getItemAt(0).isCompleted()).toBe(false);
    });
});

describe('undoing', () => {
    it('puts every original value back', () => {
        editItem(0, EDITED_VALUES);
        model.undo();
        expect(valuesAt(0)).toEqual(ORIGINAL_VALUES);
    });

    it('restores the completed flag that the edit had cleared', () => {
        const before = valuesAt(1);
        editItem(1, { ...before, completed: false });

        model.undo();

        expect(valuesAt(1)).toEqual(before);
        expect(model.getCurrentList().getItemAt(1).isCompleted()).toBe(true);
    });

    it('keeps working after the item has been edited more than once', () => {
        editItem(0, { ...ORIGINAL_VALUES, description: 'First edit' });
        editItem(0, { ...ORIGINAL_VALUES, description: 'Second edit' });

        model.undo();
        expect(valuesAt(0).description).toBe('First edit');

        model.undo();
        expect(valuesAt(0)).toEqual(ORIGINAL_VALUES);
    });
});

describe('redoing', () => {
    it('applies the new values again', () => {
        editItem(0, EDITED_VALUES);
        model.undo();
        model.redo();
        expect(valuesAt(0)).toEqual(EDITED_VALUES);
    });

    it('lands on exactly the same values however many times it is cycled', () => {
        editItem(0, EDITED_VALUES);

        for (let round = 0; round < 3; round++) {
            model.undo();
            expect(valuesAt(0)).toEqual(ORIGINAL_VALUES);
            model.redo();
            expect(valuesAt(0)).toEqual(EDITED_VALUES);
        }
    });
});

describe('snapshots, not references', () => {
    // ------------------------------------------------------------------------
    // If the transaction stored the values object the caller passed in, rather
    // than copying it, then a caller who reused and mutated that object would
    // silently corrupt the undo history. The transaction spreads both snapshots
    // in its constructor, and this is the test of that.
    // ------------------------------------------------------------------------
    it('is unaffected by the caller mutating the values object afterwards', () => {
        const newValues = { ...EDITED_VALUES };
        const transaction = new context.EditItem_Transaction(
            model, 0, model.getCurrentList().getItemAt(0).getValues(), newValues);
        model.addTransaction(transaction);

        newValues.description = 'Changed behind the transaction back';

        model.undo();
        model.redo();

        expect(valuesAt(0).description).toBe('Walk Wolfie twice');
    });

    it('is unaffected by the item itself changing between do and undo', () => {
        editItem(0, EDITED_VALUES);

        // something else edits the same item without going through a transaction
        model.getCurrentList().getItemAt(0).applyValues({ description: 'Meddled with' });

        model.undo();

        // undo still restores the values recorded when the transaction was built
        expect(valuesAt(0)).toEqual(ORIGINAL_VALUES);
    });
});

describe('valuesAreEqual', () => {
    // AppController uses this to avoid putting a transaction on the stack when
    // the user opened the modal, changed nothing, and pressed OK. Without it,
    // undo would appear to do nothing at all, which reads as a broken button.
    it('is true for two identical snapshots', () => {
        expect(EditItem_Transaction.valuesAreEqual(ORIGINAL_VALUES, { ...ORIGINAL_VALUES }))
            .toBe(true);
    });

    it.each([
        ['description', 'Something else'],
        ['dateEntered', '2026-09-09'],
        ['priority', 'Low']
    ])('is false when %s differs', (field, value) => {
        expect(EditItem_Transaction.valuesAreEqual(
            ORIGINAL_VALUES, { ...ORIGINAL_VALUES, [field]: value })).toBe(false);
    });

    it('is false when only the target date differs', () => {
        expect(EditItem_Transaction.valuesAreEqual(
            ORIGINAL_VALUES, { ...ORIGINAL_VALUES, targetDate: '2026-09-04' })).toBe(false);
    });

    it('notices a target date being cleared', () => {
        const targeted = { ...ORIGINAL_VALUES, targetDate: '2026-09-04' };
        expect(EditItem_Transaction.valuesAreEqual(targeted, ORIGINAL_VALUES)).toBe(false);
    });

    it('is false when only the completed flag differs', () => {
        expect(EditItem_Transaction.valuesAreEqual(
            ORIGINAL_VALUES, { ...ORIGINAL_VALUES, completed: true })).toBe(false);
    });

    it('compares only the five editable fields, ignoring anything else', () => {
        expect(EditItem_Transaction.valuesAreEqual(
            ORIGINAL_VALUES, { ...ORIGINAL_VALUES, id: 'a different id' })).toBe(true);
    });
});

describe('when the index is not there', () => {
    it('does nothing rather than throwing', () => {
        const transaction = new context.EditItem_Transaction(
            model, 99, ORIGINAL_VALUES, EDITED_VALUES);

        expect(() => model.addTransaction(transaction)).not.toThrow();
        expect(() => model.undo()).not.toThrow();
    });
});

describe('the transaction as an object', () => {
    it('describes itself well enough to read a transaction stack', () => {
        expect(editItem(2, EDITED_VALUES).toString()).toBe('EditItem_Transaction(index 2)');
    });
});

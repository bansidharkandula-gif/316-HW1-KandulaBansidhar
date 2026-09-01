// @vitest-environment jsdom

/**
 * RenameList_Transaction.test.js
 *
 * Renaming is an edit made from inside the list view, so like every other edit
 * made there it belongs on the undo stack.
 *
 * Two behaviors here are easy to overlook and both have tests. A rename has to
 * reach the home screen as well as the list screen, because list names appear on
 * both. And the name the transaction stores is the raw one, which the model
 * normalizes on the way in, so an undo restores the normalized old name rather
 * than whatever the user happened to have typed.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { EventTypes } from '../../../public/js/common/EventTypes.js';
import { openModel } from '../../helpers/model.js';

let context;
let model;
let observer;

beforeEach(async () => {
    context = await openModel();
    model = context.model;
    observer = context.observer;
});

function rename(oldName, newName) {
    const transaction = new context.RenameList_Transaction(model, oldName, newName);
    model.addTransaction(transaction);
    return transaction;
}

const currentName = () => model.getCurrentList().name;

describe('doing the transaction', () => {
    it('renames the open list', () => {
        rename('Errands', 'Weekend');
        expect(currentName()).toBe('Weekend');
    });

    it('renames the list in the collection too, since they are the same object', () => {
        rename('Errands', 'Weekend');
        expect(model.getListById('list-a').name).toBe('Weekend');
    });

    it('tells both screens', () => {
        // the home screen shows list names, so a rename made on the list screen
        // has to reach it as well
        rename('Errands', 'Weekend');

        expect(observer.types).toContain(EventTypes.CURRENT_LIST_CHANGED);
        expect(observer.types).toContain(EventTypes.LISTS_CHANGED);
    });

    it('saves', () => {
        rename('Errands', 'Weekend');
        const saved = JSON.parse(window.localStorage.getItem('cse316.wolfie-lists.v2'));
        expect(saved.lists[0].name).toBe('Weekend');
    });
});

describe('undoing', () => {
    it('puts the old name back', () => {
        rename('Errands', 'Weekend');
        model.undo();
        expect(currentName()).toBe('Errands');
    });

    it('puts the old name back on the home screen too', () => {
        rename('Errands', 'Weekend');
        model.undo();
        expect(model.getListById('list-a').name).toBe('Errands');
    });
});

describe('redoing', () => {
    it('applies the new name again', () => {
        rename('Errands', 'Weekend');
        model.undo();
        model.redo();
        expect(currentName()).toBe('Weekend');
    });

    it('settles on the same two names however many times it is cycled', () => {
        rename('Errands', 'Weekend');

        for (let round = 0; round < 3; round++) {
            model.undo();
            expect(currentName()).toBe('Errands');
            model.redo();
            expect(currentName()).toBe('Weekend');
        }
    });
});

describe('renaming more than once', () => {
    it('unwinds one rename at a time', () => {
        rename('Errands', 'Weekend');
        rename('Weekend', 'Weekend Plans');

        model.undo();
        expect(currentName()).toBe('Weekend');

        model.undo();
        expect(currentName()).toBe('Errands');
    });
});

describe('names that need normalizing', () => {
    // The model normalizes on the way in, so the transaction can hold the raw
    // strings and still behave. These tests document that.
    it('trims a new name', () => {
        rename('Errands', '   Weekend   ');
        expect(currentName()).toBe('Weekend');
    });

    it('refuses to leave the list nameless', () => {
        rename('Errands', '   ');
        expect(currentName()).toBe(context.WolfieList.DEFAULT_NAME);
    });

    it('still undoes correctly after normalizing', () => {
        rename('Errands', '   Weekend   ');
        model.undo();
        expect(currentName()).toBe('Errands');
    });

    it('truncates a name that is too long', () => {
        rename('Errands', 'x'.repeat(200));
        expect(currentName()).toHaveLength(context.WolfieList.MAX_NAME_LENGTH);
    });
});

describe('with no list open', () => {
    it('does nothing rather than throwing', () => {
        model.closeCurrentList();
        const transaction = new context.RenameList_Transaction(model, 'Errands', 'Weekend');

        expect(() => model.addTransaction(transaction)).not.toThrow();
        expect(() => model.undo()).not.toThrow();
    });
});

describe('the transaction as an object', () => {
    it('describes itself well enough to read a transaction stack', () => {
        expect(rename('Errands', 'Weekend').toString())
            .toBe('RenameList_Transaction(Errands to Weekend)');
    });
});

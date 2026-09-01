// @vitest-environment jsdom

/**
 * MoveItem_Transaction.test.js
 *
 * The shortest transaction in the application, because the model's moveItem is
 * its own inverse. That claim is cheap to make in a comment and cheap to get
 * wrong, so the block at the bottom checks it exhaustively: every source, every
 * destination, done and then undone, and the list must come back exactly.
 *
 * There is a related unit test in tests/unit/WolfieList.test.js proving that
 * WolfieList.moveItem is its own inverse. This file proves the transaction built
 * on top of it inherits the property, which is not quite the same claim, since a
 * transaction could always pass the wrong pair of indexes.
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

function moveItem(fromIndex, toIndex) {
    const transaction = new context.MoveItem_Transaction(model, fromIndex, toIndex);
    model.addTransaction(transaction);
    return transaction;
}

describe('doing the transaction', () => {
    it('moves an item towards the end', () => {
        moveItem(0, 2);
        expect(idsOf(model)).toEqual(['item-b', 'item-c', 'item-a']);
    });

    it('moves an item towards the front', () => {
        moveItem(2, 0);
        expect(idsOf(model)).toEqual(['item-c', 'item-a', 'item-b']);
    });

    it('moves an item by one position', () => {
        moveItem(0, 1);
        expect(idsOf(model)).toEqual(['item-b', 'item-a', 'item-c']);
    });

    it('moves the item object itself, rather than copying its values across', () => {
        const item = model.getCurrentList().getItemAt(0);
        moveItem(0, 2);
        expect(model.getCurrentList().getItemAt(2)).toBe(item);
    });

    it('never changes how many items there are', () => {
        moveItem(0, 2);
        expect(model.getCurrentList().size()).toBe(3);
    });
});

describe('undoing', () => {
    it('puts the item back where it was picked up', () => {
        moveItem(0, 2);
        model.undo();
        expect(idsOf(model)).toEqual(START_IDS);
    });

    it('works for a backwards move too', () => {
        moveItem(2, 0);
        model.undo();
        expect(idsOf(model)).toEqual(START_IDS);
    });
});

describe('redoing', () => {
    it('performs the move again', () => {
        moveItem(0, 2);
        model.undo();
        model.redo();
        expect(idsOf(model)).toEqual(['item-b', 'item-c', 'item-a']);
    });

    it('settles on the same order however many times it is cycled', () => {
        moveItem(0, 2);
        const moved = idsOf(model);

        for (let round = 0; round < 3; round++) {
            model.undo();
            expect(idsOf(model)).toEqual(START_IDS);
            model.redo();
            expect(idsOf(model)).toEqual(moved);
        }
    });
});

describe('a move that changes nothing', () => {
    it('leaves the list alone when the two indexes are the same', () => {
        moveItem(1, 1);
        expect(idsOf(model)).toEqual(START_IDS);
    });

    it('undoes harmlessly', () => {
        // the model refuses both the move and its inverse, so undo is a no-op
        moveItem(1, 1);
        expect(() => model.undo()).not.toThrow();
        expect(idsOf(model)).toEqual(START_IDS);
    });

    it.each([
        ['a source past the end', 9, 0],
        ['a destination past the end', 0, 9],
        ['a negative source', -1, 0]
    ])('ignores %s', (_description, from, to) => {
        moveItem(from, to);
        expect(idsOf(model)).toEqual(START_IDS);
        expect(() => model.undo()).not.toThrow();
        expect(idsOf(model)).toEqual(START_IDS);
    });
});

describe('several moves in a row', () => {
    it('unwinds all the way back to the original order', () => {
        moveItem(0, 2);
        moveItem(0, 1);
        moveItem(2, 0);

        model.undo();
        model.undo();
        model.undo();

        expect(idsOf(model)).toEqual(START_IDS);
    });

    it('replays all the way forward again', () => {
        moveItem(0, 2);
        moveItem(0, 1);
        const settled = idsOf(model);

        model.undo();
        model.undo();
        model.redo();
        model.redo();

        expect(idsOf(model)).toEqual(settled);
    });
});

describe('the inverse property, for every pair of positions', () => {
    // ------------------------------------------------------------------------
    // The claim the class is built on, checked rather than assumed. A five item
    // list gives twenty five combinations, which is more than anybody would
    // write out by hand and takes a couple of milliseconds to run.
    // ------------------------------------------------------------------------
    const FIVE_ITEMS = [{
        id: 'list-a',
        name: 'Five',
        items: ['A', 'B', 'C', 'D', 'E'].map((letter) => ({
            id: `item-${letter}`,
            description: letter,
            dateEntered: '2026-09-01',
            priority: 'Low',
            targetDate: null,
            completed: false
        }))
    }];

    it('undoes any move back to the original order', async () => {
        for (let from = 0; from < 5; from++) {
            for (let to = 0; to < 5; to++) {
                const fresh = await openModel({ lists: FIVE_ITEMS, open: 'list-a' });
                fresh.model.addTransaction(
                    new fresh.MoveItem_Transaction(fresh.model, from, to));
                fresh.model.undo();

                expect(descriptionsOf(fresh.model), `moving ${from} to ${to} and undoing`)
                    .toEqual(['A', 'B', 'C', 'D', 'E']);
            }
        }
    });
});

describe('the transaction as an object', () => {
    it('describes itself well enough to read a transaction stack', () => {
        expect(moveItem(0, 2).toString()).toBe('MoveItem_Transaction(0 to 2)');
    });
});

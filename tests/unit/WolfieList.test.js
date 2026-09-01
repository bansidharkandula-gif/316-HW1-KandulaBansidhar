/**
 * WolfieList.test.js
 *
 * WolfieList is where the actual editing happens: adding, removing, moving and
 * renaming. Every one of those is called from inside a transaction, which means
 * every one of them has to be perfectly reversible. The moveItem block below is
 * the most important in this file, because it tests that reversibility directly
 * rather than taking the comment's word for it.
 *
 * Nothing here needs a browser, and this file does not even opt in to jsdom. That
 * absence is itself a result worth having: if WolfieList can be tested to
 * exhaustion with no document in existence anywhere, then the model genuinely
 * does not depend on the user interface, which is exactly what the design claims.
 */
import { describe, it, expect } from 'vitest';
import { WolfieList } from '../../public/js/model/WolfieList.js';
import { ListItem } from '../../public/js/model/ListItem.js';

/** a list of three items whose descriptions are A, B and C, so that the order of
 *  a list can be read at a glance as a string */
function makeABC() {
    return new WolfieList({
        id: 'list-a',
        name: 'Errands',
        items: [
            new ListItem({ id: 'item-a', description: 'A' }),
            new ListItem({ id: 'item-b', description: 'B' }),
            new ListItem({ id: 'item-c', description: 'C' })
        ]
    });
}

/** @return {string} the order of a list, i.e. "ABC" */
const orderOf = (list) => list.items.map((item) => item.description).join('');

describe('constructing a WolfieList', () => {
    it('defaults to an empty untitled list', () => {
        const list = new WolfieList();
        expect(list.id).toMatch(/^list-/);
        expect(list.name).toBe(WolfieList.DEFAULT_NAME);
        expect(list.isEmpty()).toBe(true);
        expect(list.size()).toBe(0);
    });

    it('turns plain objects from local storage into real ListItems', () => {
        // this is what makes it safe for the rest of the application to call
        // item.isCompleted() on anything that came out of storage
        const list = new WolfieList({
            name: 'Errands',
            items: [{ description: 'A' }, { description: 'B' }]
        });

        expect(list.getItemAt(0)).toBeInstanceOf(ListItem);
        expect(list.getItemAt(1)).toBeInstanceOf(ListItem);
    });

    it('leaves items that are already ListItems exactly as they are', () => {
        // the transactions hand real ListItems back and forth, and rebuilding
        // one would give it a new identity and break undo
        const item = new ListItem({ description: 'A' });
        const list = new WolfieList({ items: [item] });
        expect(list.getItemAt(0)).toBe(item);
    });
});

describe('reading a list', () => {
    it('reports its size and whether it is empty', () => {
        expect(makeABC().size()).toBe(3);
        expect(makeABC().isEmpty()).toBe(false);
        expect(new WolfieList().isEmpty()).toBe(true);
    });

    it('returns the item at an index', () => {
        expect(makeABC().getItemAt(1).description).toBe('B');
    });

    it.each([[-1], [3], [99]])('returns null for the out of bounds index %i', (index) => {
        // null rather than undefined, and never a throw: the view asks for an
        // item at whatever index a card is stamped with, and a stale card must
        // not be able to take the application down
        expect(makeABC().getItemAt(index)).toBeNull();
    });

    it('refuses an assignment to name or id from outside', () => {
        // strict mode, so assigning to a getter-only property throws. setName is
        // the way in, and it is what normalizes what the user typed
        const list = makeABC();
        expect(() => { list.name = 'tampered with'; }).toThrow(TypeError);
        expect(() => { list.id = 'tampered with'; }).toThrow(TypeError);
    });

    it('hands back a copy of its items, not the array itself', () => {
        // otherwise reading a list would be a way of rearranging one, behind the
        // back of the transactions that make every rearrangement undoable
        const list = makeABC();

        const items = list.items;
        items.push(new ListItem({ description: 'Snuck in' }));
        items.reverse();

        expect(list.size()).toBe(3);
        expect(orderOf(list)).toBe('ABC');
    });

    it('counts how many items are completed', () => {
        const list = makeABC();
        expect(list.countCompleted()).toBe(0);

        list.getItemAt(0).applyValues({ completed: true });
        list.getItemAt(2).applyValues({ completed: true });
        expect(list.countCompleted()).toBe(2);
    });

    it('counts zero completed in an empty list', () => {
        expect(new WolfieList().countCompleted()).toBe(0);
    });
});

describe('addItem', () => {
    it('adds at the end when given no index', () => {
        const list = makeABC();
        list.addItem(new ListItem({ description: 'D' }));
        expect(orderOf(list)).toBe('ABCD');
    });

    it('inserts at the index it is given', () => {
        const list = makeABC();
        list.addItem(new ListItem({ description: 'X' }), 1);
        expect(orderOf(list)).toBe('AXBC');
    });

    it('inserts at the front for index 0', () => {
        const list = makeABC();
        list.addItem(new ListItem({ description: 'X' }), 0);
        expect(orderOf(list)).toBe('XABC');
    });

    // The clamping below is what stops a stale index, i.e. from a transaction
    // that was built before something else changed the list, from either
    // throwing or quietly leaving a hole in the array.
    it('clamps a negative index to the front', () => {
        const list = makeABC();
        list.addItem(new ListItem({ description: 'X' }), -5);
        expect(orderOf(list)).toBe('XABC');
    });

    it('clamps an index past the end to the end', () => {
        const list = makeABC();
        list.addItem(new ListItem({ description: 'X' }), 99);
        expect(orderOf(list)).toBe('ABCX');
        expect(list.size()).toBe(4);
    });
});

describe('removeItemAt', () => {
    it('removes the item and hands it back', () => {
        // handing it back is what makes delete undoable: the transaction keeps
        // the returned object and puts that very object back on undo
        const list = makeABC();
        const removed = list.removeItemAt(1);

        expect(removed.description).toBe('B');
        expect(orderOf(list)).toBe('AC');
    });

    it.each([[-1], [3], [99]])('returns null and changes nothing for index %i', (index) => {
        const list = makeABC();
        expect(list.removeItemAt(index)).toBeNull();
        expect(orderOf(list)).toBe('ABC');
    });

    it('returns null on an empty list', () => {
        expect(new WolfieList().removeItemAt(0)).toBeNull();
    });
});

describe('moveItem', () => {
    it('moves an item forwards', () => {
        const list = makeABC();
        expect(list.moveItem(0, 2)).toBe(true);
        expect(orderOf(list)).toBe('BCA');
    });

    it('moves an item backwards', () => {
        const list = makeABC();
        expect(list.moveItem(2, 0)).toBe(true);
        expect(orderOf(list)).toBe('CAB');
    });

    it('reports that nothing happened when the two indexes are the same', () => {
        // MoveItem_Transaction relies on this: the model refuses the move, so
        // the view never redraws and nothing lands on the undo stack needlessly
        const list = makeABC();
        expect(list.moveItem(1, 1)).toBe(false);
        expect(orderOf(list)).toBe('ABC');
    });

    it.each([
        ['a negative source', -1, 1],
        ['a source past the end', 5, 1],
        ['a negative destination', 1, -1],
        ['a destination past the end', 1, 5]
    ])('refuses %s and changes nothing', (_description, from, to) => {
        const list = makeABC();
        expect(list.moveItem(from, to)).toBe(false);
        expect(orderOf(list)).toBe('ABC');
    });

    // ------------------------------------------------------------------------
    // This is the property MoveItem_Transaction's undo is built on. The class
    // comment claims moveItem(from, to) is undone by moveItem(to, from). Here we
    // check that claim for every pair of indexes in a list, rather than for the
    // one or two a hand written test would have happened to pick.
    // ------------------------------------------------------------------------
    it('is its own inverse, for every pair of positions', () => {
        for (let from = 0; from < 3; from++) {
            for (let to = 0; to < 3; to++) {
                const list = makeABC();
                list.moveItem(from, to);
                list.moveItem(to, from);
                expect(orderOf(list), `moving ${from} to ${to} and back`).toBe('ABC');
            }
        }
    });

    it('keeps the very same item object, it does not replace it', () => {
        const list = makeABC();
        const itemB = list.getItemAt(1);
        list.moveItem(1, 2);
        expect(list.getItemAt(2)).toBe(itemB);
    });
});

describe('naming', () => {
    describe('normalizeName', () => {
        it('trims surrounding whitespace', () => {
            expect(WolfieList.normalizeName('   Errands   ')).toBe('Errands');
        });

        it.each([
            ['an empty string', ''],
            ['nothing but spaces', '     '],
            ['null', null],
            ['undefined', undefined]
        ])('turns %s into the default name', (_description, value) => {
            expect(WolfieList.normalizeName(value)).toBe(WolfieList.DEFAULT_NAME);
        });

        it('truncates a name longer than the limit', () => {
            const tooLong = 'x'.repeat(200);
            expect(WolfieList.normalizeName(tooLong)).toHaveLength(WolfieList.MAX_NAME_LENGTH);
        });

        it('leaves a name of exactly the limit alone', () => {
            const exact = 'x'.repeat(WolfieList.MAX_NAME_LENGTH);
            expect(WolfieList.normalizeName(exact)).toBe(exact);
        });

        it('is a static, so the controller can ask before committing to a rename', () => {
            // AppController calls this to work out whether a rename would change
            // anything at all, and skips building a transaction if it would not
            expect(typeof WolfieList.normalizeName).toBe('function');
            expect(WolfieList.normalizeName('  Errands  ')).toBe('Errands');
        });
    });

    describe('setName', () => {
        it('normalizes whatever it is given', () => {
            const list = makeABC();
            list.setName('   Weekend   ');
            expect(list.name).toBe('Weekend');
        });

        it('never leaves a list nameless', () => {
            const list = makeABC();
            list.setName('   ');
            expect(list.name).toBe(WolfieList.DEFAULT_NAME);
        });
    });
});

describe('clone, i.e. the Prototype pattern', () => {
    it('copies the name with a suffix by default', () => {
        expect(makeABC().clone().name).toBe('Errands (Copy)');
    });

    it('uses the name it is given instead', () => {
        expect(makeABC().clone('Errands 2').name).toBe('Errands 2');
    });

    it('truncates a copy name that would be too long', () => {
        const list = makeABC();
        list.setName('x'.repeat(WolfieList.MAX_NAME_LENGTH));
        // the default suffix would push this over the limit
        expect(list.clone().name).toHaveLength(WolfieList.MAX_NAME_LENGTH);
    });

    it('gives the copy an id of its own', () => {
        const list = makeABC();
        expect(list.clone().id).not.toBe(list.id);
    });

    it('copies every item, in order', () => {
        expect(orderOf(makeABC().clone())).toBe('ABC');
    });

    it('gives every copied item an id of its own', () => {
        // WolfieList does not copy its items itself, it asks each item to clone
        // itself, which is the Prototype pattern applied twice over
        const list = makeABC();
        const copy = list.clone();

        for (let i = 0; i < list.size(); i++) {
            expect(copy.getItemAt(i).id).not.toBe(list.getItemAt(i).id);
        }
        const allIds = [...list.items, ...copy.items].map((item) => item.id);
        expect(new Set(allIds).size).toBe(6);
    });

    it('is a deep copy, so editing the copy cannot touch the original', () => {
        const list = makeABC();
        const copy = list.clone();

        copy.getItemAt(0).applyValues({ description: 'Changed' });
        copy.removeItemAt(2);
        copy.setName('Something else');

        expect(orderOf(list)).toBe('ABC');
        expect(list.name).toBe('Errands');
    });

    it('produces a real WolfieList that can itself be cloned', () => {
        const copy = makeABC().clone();
        expect(copy).toBeInstanceOf(WolfieList);
        expect(orderOf(copy.clone())).toBe('ABC');
    });
});

describe('fromJSON and surviving local storage', () => {
    it('rebuilds a list from a plain object', () => {
        const list = WolfieList.fromJSON({
            id: 'list-a',
            name: 'Errands',
            items: [{ description: 'A' }]
        });

        expect(list).toBeInstanceOf(WolfieList);
        expect(list.name).toBe('Errands');
        expect(list.getItemAt(0)).toBeInstanceOf(ListItem);
    });

    it('produces a usable empty list from null', () => {
        const list = WolfieList.fromJSON(null);
        expect(list).toBeInstanceOf(WolfieList);
        expect(list.isEmpty()).toBe(true);
    });

    it('round trips through JSON with its items intact', () => {
        const before = makeABC();
        const after = WolfieList.fromJSON(JSON.parse(JSON.stringify(before)));

        expect(after.id).toBe(before.id);
        expect(after.name).toBe(before.name);
        expect(orderOf(after)).toBe(orderOf(before));
        expect(after.getItemAt(0).id).toBe(before.getItemAt(0).id);
    });
});

describe('createIterator', () => {
    it('hands back an iterator positioned at the first item', () => {
        const iterator = makeABC().createIterator();
        expect(iterator.hasNext()).toBe(true);
        expect(iterator.next().description).toBe('A');
    });

    it('hands back a fresh iterator every time', () => {
        // two views could be walking the same list at once, and one must not be
        // able to exhaust the other's traversal
        const list = makeABC();
        const first = list.createIterator();
        first.next();

        expect(list.createIterator().next().description).toBe('A');
    });
});

describe('toString', () => {
    it('describes the list and how much is in it', () => {
        expect(makeABC().toString()).toBe('WolfieList(Errands, 3 items)');
    });
});

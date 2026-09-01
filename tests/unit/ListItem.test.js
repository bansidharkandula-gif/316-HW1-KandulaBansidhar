/**
 * ListItem.test.js
 *
 * A ListItem has to do three jobs and these tests are grouped by them: hold its
 * five fields honestly, clone itself (the Prototype pattern), and survive a round
 * trip through local storage.
 *
 * That last one is worth dwelling on. Every field is private, and JSON.stringify
 * cannot see a private field, so ListItem carries a toJSON() that says what a
 * saved item looks like. The round trip test at the bottom is what would fail if
 * somebody deleted that method, or added a sixth field and forgot to list it
 * there: saved items would quietly start coming back empty.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { ListItem } from '../../public/js/model/ListItem.js';

/** freezes the clock so that defaults involving today are predictable */
function pretendItIs(year, monthIndex, day) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(year, monthIndex, day, 10, 0, 0));
}

afterEach(() => {
    vi.useRealTimers();
});

describe('constructing a ListItem', () => {
    it('fills in sensible defaults when given nothing at all', () => {
        pretendItIs(2026, 8, 4);
        const item = new ListItem();

        expect(item.id).toMatch(/^item-/);
        expect(item.description).toBe('');
        expect(item.dateEntered).toBe('2026-09-04');
        expect(item.priority).toBe('Low');
        expect(item.targetDate).toBeNull();
        expect(item.completed).toBe(false);
    });

    it('accepts any subset of the fields and defaults the rest', () => {
        pretendItIs(2026, 8, 4);
        const item = new ListItem({ description: 'Walk Wolfie' });

        expect(item.description).toBe('Walk Wolfie');
        expect(item.dateEntered).toBe('2026-09-04');
    });

    it('keeps every field it is given', () => {
        const item = new ListItem({
            id: 'item-fixed',
            description: 'Walk Wolfie',
            dateEntered: '2026-09-01',
            priority: 'High',
            targetDate: '2026-09-10',
            completed: true
        });

        expect(item).toMatchObject({
            id: 'item-fixed',
            description: 'Walk Wolfie',
            dateEntered: '2026-09-01',
            priority: 'High',
            targetDate: '2026-09-10',
            completed: true
        });
    });

    // ------------------------------------------------------------------------
    // cleaning up bad data on the way in. everything below simulates local
    // storage that somebody has edited by hand, or data written by a buggy
    // earlier version of the application
    // ------------------------------------------------------------------------
    it('replaces a malformed dateEntered with today', () => {
        pretendItIs(2026, 8, 4);
        expect(new ListItem({ dateEntered: 'yesterday' }).dateEntered).toBe('2026-09-04');
    });

    it('replaces an unrecognized priority with the default', () => {
        expect(new ListItem({ priority: 'Extremely Urgent' }).priority).toBe('Low');
    });

    it('turns a malformed targetDate into null, i.e. no target at all', () => {
        expect(new ListItem({ targetDate: 'sometime' }).targetDate).toBeNull();
    });

    it('turns anything that is not exactly true into a false completed', () => {
        // local storage is text, so 'true' and 1 are both perfectly possible
        expect(new ListItem({ completed: 'true' }).completed).toBe(false);
        expect(new ListItem({ completed: 1 }).completed).toBe(false);
        expect(new ListItem({ completed: undefined }).completed).toBe(false);
    });
});

describe('isCompleted', () => {
    it('is false while completed is false', () => {
        expect(new ListItem({ completed: false }).isCompleted()).toBe(false);
    });

    it('is true once completed is true', () => {
        expect(new ListItem({ completed: true }).isCompleted()).toBe(true);
    });

    // the two fields are independent on purpose: a target date says when an item
    // is meant to be finished, only the checkbox says whether it is
    it('does not read anything into the target date', () => {
        expect(new ListItem({ targetDate: '2026-09-02' }).isCompleted()).toBe(false);
        expect(new ListItem({ targetDate: null, completed: true }).isCompleted()).toBe(true);
    });
});

describe('the fields are private', () => {
    // The point of the getters. Every module in this project is an ES module and
    // therefore strict, so assigning to a property that has only a getter throws
    // rather than failing silently. These are the tests that would fail if
    // somebody turned the fields back into public ones.
    it.each(['description', 'dateEntered', 'priority', 'targetDate', 'completed', 'id'])(
        'refuses an assignment to %s from outside', (field) => {
            const item = new ListItem({ description: 'Walk Wolfie' });
            expect(() => { item[field] = 'tampered with'; }).toThrow(TypeError);
        });

    it('leaves applyValues as the only way in', () => {
        const item = new ListItem({ description: 'Walk Wolfie', priority: 'Low' });
        item.applyValues({ priority: 'High' });
        expect(item.priority).toBe('High');
    });

    it('cleans anything applyValues is handed, so no item can hold nonsense', () => {
        const item = new ListItem({ priority: 'High', targetDate: '2026-09-02' });
        item.applyValues({ priority: 'Extremely Urgent', targetDate: 'a week Tuesday' });
        expect(item.priority).toBe('Low');
        expect(item.targetDate).toBeNull();
    });
});

describe('clone, i.e. the Prototype pattern', () => {
    const original = () => new ListItem({
        id: 'item-original',
        description: 'Walk Wolfie',
        dateEntered: '2026-09-01',
        priority: 'High',
        targetDate: '2026-09-02',
        completed: true
    });

    it('copies every field except the id', () => {
        const copy = original().clone();
        expect(copy.description).toBe('Walk Wolfie');
        expect(copy.dateEntered).toBe('2026-09-01');
        expect(copy.priority).toBe('High');
        expect(copy.targetDate).toBe('2026-09-02');
        expect(copy.completed).toBe(true);
    });

    it('gives the copy an id of its own', () => {
        // two items sharing an id would make the duplicate button produce a card
        // the application could no longer tell apart from the one it came from
        const item = original();
        const copy = item.clone();
        expect(copy.id).not.toBe(item.id);
        expect(copy.id).toMatch(/^item-/);
    });

    it('produces a genuinely separate object', () => {
        const item = original();
        const copy = item.clone();

        copy.applyValues({ description: 'Something else' });
        expect(item.description).toBe('Walk Wolfie');
    });

    it('produces a real ListItem, not a plain object', () => {
        // if clone returned a plain object the card would still render, and then
        // countCompleted would throw the first time it called isCompleted
        const copy = original().clone();
        expect(copy).toBeInstanceOf(ListItem);
        expect(copy.isCompleted()).toBe(true);
    });

    it('can be cloned again, and again', () => {
        const first = original().clone();
        const second = first.clone();
        expect(second.description).toBe('Walk Wolfie');
        expect(new Set([original().id, first.id, second.id]).size).toBe(3);
    });
});

describe('getValues and applyValues', () => {
    // These two are what the edit transaction is built on: getValues takes the
    // before and after snapshots, applyValues puts one of them back.
    it('getValues returns the editable fields and deliberately omits the id', () => {
        const item = new ListItem({
            id: 'item-a',
            description: 'Walk Wolfie',
            dateEntered: '2026-09-01',
            priority: 'High',
            targetDate: '2026-09-08',
            completed: false
        });

        expect(item.getValues()).toMatchObject({
            description: 'Walk Wolfie',
            dateEntered: '2026-09-01',
            priority: 'High',
            targetDate: '2026-09-08',
            completed: false
        });
        // the id is the one thing that must NOT be in here: applyValues is fed
        // this object, and an item may never be handed a new id. Anything else
        // you choose to carry alongside the five is your own business
        expect(item.getValues()).not.toHaveProperty('id');
    });

    it('getValues returns a snapshot, not a window onto the item', () => {
        // if getValues handed back a live reference, the edit transaction's
        // "before" would change as soon as the item did, and undo would restore
        // the very values it was supposed to be replacing
        const item = new ListItem({ description: 'Before' });
        const snapshot = item.getValues();
        item.applyValues({ description: 'After' });
        expect(snapshot.description).toBe('Before');
    });

    it('applyValues overwrites the editable fields', () => {
        const item = new ListItem({ id: 'item-a', description: 'Before', priority: 'Low' });

        item.applyValues({
            description: 'After',
            dateEntered: '2026-09-09',
            priority: 'High',
            targetDate: '2026-09-10',
            completed: true
        });

        expect(item.description).toBe('After');
        expect(item.dateEntered).toBe('2026-09-09');
        expect(item.priority).toBe('High');
        expect(item.targetDate).toBe('2026-09-10');
        expect(item.completed).toBe(true);
    });

    it('applyValues never touches the id', () => {
        // the whole point of editing in place is that anything holding a
        // reference to this item stays valid, and that includes the item card
        const item = new ListItem({ id: 'item-a' });
        item.applyValues({ description: 'After', id: 'item-somethingelse' });
        expect(item.id).toBe('item-a');
    });

    it('applyValues leaves out a field alone rather than blanking it', () => {
        const item = new ListItem({ description: 'Walk Wolfie', priority: 'High' });
        item.applyValues({ description: 'Walk Wolfie twice' });
        expect(item.priority).toBe('High');
    });

    it('applyValues can clear completed, which is how un-completing works', () => {
        const item = new ListItem({ targetDate: '2026-09-02', completed: true });
        item.applyValues({ completed: false });
        expect(item.isCompleted()).toBe(false);
        // un-completing says nothing about when the item was meant to be done
        expect(item.targetDate).toBe('2026-09-02');
    });

    it('applyValues can clear a target date without touching completed', () => {
        const item = new ListItem({ targetDate: '2026-09-02', completed: true });
        item.applyValues({ targetDate: null });
        expect(item.targetDate).toBeNull();
        expect(item.isCompleted()).toBe(true);
    });

    it('applyValues cleans a bad priority instead of storing it', () => {
        const item = new ListItem({ priority: 'High' });
        item.applyValues({ priority: 'Nonsense' });
        expect(item.priority).toBe('Low');
    });

    it('applyValues keeps the old dateEntered when handed a bad one', () => {
        const item = new ListItem({ dateEntered: '2026-09-01' });
        item.applyValues({ dateEntered: 'rubbish' });
        expect(item.dateEntered).toBe('2026-09-01');
    });
});

describe('fromJSON, i.e. coming back out of local storage', () => {
    it('rebuilds a real ListItem from a plain object', () => {
        const item = ListItem.fromJSON({
            id: 'item-a',
            description: 'Walk Wolfie',
            dateEntered: '2026-09-01',
            priority: 'High',
            targetDate: null,
            completed: false
        });

        expect(item).toBeInstanceOf(ListItem);
        expect(item.description).toBe('Walk Wolfie');
    });

    it('produces a usable item even from null', () => {
        expect(ListItem.fromJSON(null)).toBeInstanceOf(ListItem);
    });

    it('produces a usable item even from an empty object', () => {
        expect(ListItem.fromJSON({}).description).toBe('');
    });
});

describe('surviving local storage', () => {
    // This is the test that would catch somebody deleting toJSON(). The fields
    // are private, and private fields are invisible to JSON.stringify, so
    // without that method this round trip comes back empty and every saved item
    // loses its data.
    it('round trips through JSON with every field intact', () => {
        const before = new ListItem({
            id: 'item-a',
            description: 'Walk Wolfie',
            dateEntered: '2026-09-01',
            priority: 'High',
            targetDate: '2026-09-02',
            completed: true
        });

        const after = ListItem.fromJSON(JSON.parse(JSON.stringify(before)));

        expect(after.id).toBe(before.id);
        expect(after.getValues()).toEqual(before.getValues());
    });

    it('serializes all five fields plus the id', () => {
        // every one of these has to survive a save and a reload, which is what
        // this pins down. Anything extra you decide to store alongside them is
        // allowed, and fromJSON will be handed it straight back.
        const keys = Object.keys(JSON.parse(JSON.stringify(new ListItem())));
        expect(keys.sort()).toEqual(expect.arrayContaining(
            ['completed', 'dateEntered', 'description', 'id', 'priority', 'targetDate']));
    });
});

describe('toString', () => {
    it('describes the item well enough to read a transaction log', () => {
        expect(new ListItem({ description: 'Walk Wolfie' }).toString())
            .toBe('ListItem(Walk Wolfie)');
    });
});

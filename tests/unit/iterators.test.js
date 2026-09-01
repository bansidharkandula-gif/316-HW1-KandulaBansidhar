/**
 * iterators.test.js
 *
 * Both of our iterators obey the same contract, so both are tested against the
 * same list of questions: does hasNext know when to stop, does next hand things
 * back in order, does index report where we are, does reset start over.
 *
 * The block at the bottom is the one worth reading. Iterator implements
 * Symbol.iterator, which teaches JavaScript itself about our classes, and the
 * payoff is that for...of and the spread operator work on them exactly as they
 * do on an array. That is a lot of behavior to get from one method, and it is
 * behavior nothing else in the application currently uses, so without a test it
 * would be free to break unnoticed.
 */
import { describe, it, expect } from 'vitest';
import { Iterator } from '../../public/js/common/Iterator.js';
import { ListItemIterator } from '../../public/js/model/ListItemIterator.js';
import { WolfieListIterator } from '../../public/js/model/WolfieListIterator.js';
import { WolfieList } from '../../public/js/model/WolfieList.js';
import { ListItem } from '../../public/js/model/ListItem.js';

function makeABC() {
    return new WolfieList({
        name: 'Errands',
        items: [
            new ListItem({ id: 'item-a', description: 'A' }),
            new ListItem({ id: 'item-b', description: 'B' }),
            new ListItem({ id: 'item-c', description: 'C' })
        ]
    });
}

function makeThreeLists() {
    return [
        new WolfieList({ id: 'list-a', name: 'A' }),
        new WolfieList({ id: 'list-b', name: 'B' }),
        new WolfieList({ id: 'list-c', name: 'C' })
    ];
}

describe('Iterator, the abstract base class', () => {
    it.each(['hasNext', 'next', 'reset'])('refuses to let %s go unimplemented', (method) => {
        class Incomplete extends Iterator {}
        expect(() => new Incomplete()[method]()).toThrow(/must override/);
    });

    it('names the offending subclass in the error', () => {
        class ForgotEverything extends Iterator {}
        expect(() => new ForgotEverything().hasNext())
            .toThrow(/ForgotEverything must override hasNext/);
    });
});

describe('ListItemIterator', () => {
    it('walks every item in order', () => {
        const iterator = makeABC().createIterator();
        const seen = [];
        while (iterator.hasNext()) seen.push(iterator.next().description);
        expect(seen).toEqual(['A', 'B', 'C']);
    });

    it('reports hasNext false once it reaches the end', () => {
        const iterator = makeABC().createIterator();
        iterator.next();
        iterator.next();
        expect(iterator.hasNext()).toBe(true);
        iterator.next();
        expect(iterator.hasNext()).toBe(false);
    });

    it('throws rather than returning undefined past the end', () => {
        // a silent undefined would show up much later as a card with no text on
        // it, and the stack trace would point nowhere near the real problem
        const iterator = makeABC().createIterator();
        iterator.next();
        iterator.next();
        iterator.next();
        expect(() => iterator.next()).toThrow(RangeError);
    });

    it('says hasNext is false immediately for an empty list', () => {
        expect(new WolfieList().createIterator().hasNext()).toBe(false);
    });

    describe('index', () => {
        // ListView stamps every card with the index the iterator reports, and
        // that index is what drag and drop, edit and delete all work from. If it
        // were ever off by one, every button on every card would act on the wrong
        // item, so it is worth being exact about.
        it('is -1 before next has been called', () => {
            expect(makeABC().createIterator().index).toBe(-1);
        });

        it('reports the position of the item just returned', () => {
            const iterator = makeABC().createIterator();
            iterator.next();
            expect(iterator.index).toBe(0);
            iterator.next();
            expect(iterator.index).toBe(1);
            iterator.next();
            expect(iterator.index).toBe(2);
        });

        it('pairs each item with the right index all the way through', () => {
            const iterator = makeABC().createIterator();
            const pairs = [];
            while (iterator.hasNext()) {
                const item = iterator.next();
                pairs.push([iterator.index, item.description]);
            }
            expect(pairs).toEqual([[0, 'A'], [1, 'B'], [2, 'C']]);
        });
    });

    describe('reset', () => {
        it('starts the traversal over', () => {
            const iterator = makeABC().createIterator();
            while (iterator.hasNext()) iterator.next();

            iterator.reset();

            expect(iterator.hasNext()).toBe(true);
            expect(iterator.next().description).toBe('A');
        });

        it('puts index back to -1 as well', () => {
            const iterator = makeABC().createIterator();
            iterator.next();
            iterator.reset();
            expect(iterator.index).toBe(-1);
        });
    });

    it('reports the size of the collection it is walking', () => {
        expect(makeABC().createIterator().size()).toBe(3);
        expect(new WolfieList().createIterator().size()).toBe(0);
    });

    describe('forEachRemaining', () => {
        // this is the shape HomeView.render uses
        it('hands each element its position in the traversal', () => {
            const seen = [];
            makeABC().createIterator().forEachRemaining((item, position) => {
                seen.push([position, item.description]);
            });
            expect(seen).toEqual([[0, 'A'], [1, 'B'], [2, 'C']]);
        });

        it('only walks what is left, hence the name', () => {
            const iterator = makeABC().createIterator();
            iterator.next();

            const seen = [];
            iterator.forEachRemaining((item, position) => seen.push([position, item.description]));

            // the position is the position within this traversal, not within the
            // list, which is exactly why render always starts from a fresh iterator
            expect(seen).toEqual([[0, 'B'], [1, 'C']]);
        });

        it('does nothing at all on an exhausted iterator', () => {
            const iterator = makeABC().createIterator();
            while (iterator.hasNext()) iterator.next();

            const seen = [];
            iterator.forEachRemaining(() => seen.push(1));
            expect(seen).toEqual([]);
        });
    });
});

describe('WolfieListIterator', () => {
    it('walks every list in order', () => {
        const iterator = new WolfieListIterator(makeThreeLists());
        const seen = [];
        while (iterator.hasNext()) seen.push(iterator.next().name);
        expect(seen).toEqual(['A', 'B', 'C']);
    });

    it('throws past the end', () => {
        const iterator = new WolfieListIterator([]);
        expect(() => iterator.next()).toThrow(RangeError);
    });

    it('treats a missing array as an empty one', () => {
        // the model builds this from a field that is briefly undefined during
        // construction, so a null here must not be fatal
        const iterator = new WolfieListIterator(undefined);
        expect(iterator.hasNext()).toBe(false);
        expect(iterator.size()).toBe(0);
    });

    it('reports index and size the same way the item iterator does', () => {
        const iterator = new WolfieListIterator(makeThreeLists());
        expect(iterator.index).toBe(-1);
        expect(iterator.size()).toBe(3);
        iterator.next();
        expect(iterator.index).toBe(0);
    });

    it('resets to the beginning', () => {
        const iterator = new WolfieListIterator(makeThreeLists());
        iterator.next();
        iterator.next();
        iterator.reset();
        expect(iterator.next().name).toBe('A');
    });

    it('sees a list added after it was created, since it holds the live array', () => {
        // worth knowing rather than worth relying on. Every render in the
        // application builds a brand new iterator, so this never comes up there.
        const lists = makeThreeLists();
        const iterator = new WolfieListIterator(lists);
        lists.push(new WolfieList({ name: 'D' }));
        expect(iterator.size()).toBe(4);
    });
});

describe('working with the language itself, via Symbol.iterator', () => {
    // Iterator implements Symbol.iterator once, in the base class, and both
    // subclasses inherit all of the following for free.
    it('works with for...of', () => {
        const seen = [];
        for (const item of makeABC().createIterator()) {
            seen.push(item.description);
        }
        expect(seen).toEqual(['A', 'B', 'C']);
    });

    it('works with the spread operator', () => {
        const items = [...makeABC().createIterator()];
        expect(items).toHaveLength(3);
        expect(items[1].description).toBe('B');
    });

    it('works with Array.from', () => {
        const names = Array.from(new WolfieListIterator(makeThreeLists()), (list) => list.name);
        expect(names).toEqual(['A', 'B', 'C']);
    });

    it('works with destructuring', () => {
        const [first, second] = makeABC().createIterator();
        expect(first.description).toBe('A');
        expect(second.description).toBe('B');
    });

    it('stops cleanly rather than throwing at the end of a for...of', () => {
        // next() throws a RangeError past the end, so Symbol.iterator has to
        // check hasNext before calling it. This is the test of that guard.
        expect(() => {
            for (const _item of new WolfieList().createIterator()) { /* empty */ }
        }).not.toThrow();
    });
});

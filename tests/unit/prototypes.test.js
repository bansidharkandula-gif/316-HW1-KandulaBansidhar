// @vitest-environment jsdom

/**
 * prototypes.test.js
 *
 * The card prototypes produce DOM, so this file needs jsdom, but it is still a
 * unit test: each prototype is exercised entirely on its own. That is the pair
 * of ideas the folder layout keeps apart — needing a document is a fact about
 * the ENVIRONMENT a test requires, not about how much of the application it
 * involves.
 *
 * These are a good place to start reading, because they are pure functions in
 * disguise: hand one a list or an item, get an element back. There is no state,
 * no event handling and no model. The WolfieList and ListItem objects below are
 * input data, not collaborators under test.
 *
 * Three things are worth testing here and only one of them is obvious.
 *
 *   the obvious one   the data lands in the right parts of the card
 *   the pattern       there really is one prototype element, stamped out
 *                     repeatedly, rather than a card built from scratch each time
 *   the safety rule   text typed by a user is set with textContent and never
 *                     with innerHTML. The last block in this file is the test
 *                     that would catch somebody "simplifying" that away.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mountIndexHtml } from '../helpers/app.js';
import { CardPrototype } from '../../public/js/view/prototypes/CardPrototype.js';
import { ListCardPrototype } from '../../public/js/view/prototypes/ListCardPrototype.js';
import { ItemCardPrototype } from '../../public/js/view/prototypes/ItemCardPrototype.js';
import { WolfieList } from '../../public/js/model/WolfieList.js';
import { ListItem } from '../../public/js/model/ListItem.js';

// The blank cards are <template> elements in index.html, so the real markup has
// to be in the document before any prototype can stamp anything out. Using the
// actual file rather than a hand written snippet is the point: if somebody edits
// the template and forgets initializeClone, or the other way round, these tests
// are what notices.
beforeEach(() => {
    mountIndexHtml();
});

// ---------------------------------------------------------------------------
// where the markup comes from
// ---------------------------------------------------------------------------
describe('where the markup comes from', () => {
    // Each prototype fetches its own <template> out of index.html and clones it.
    // There is no markup in any .js file, which the guard in
    // no-html-in-javascript.test.js checks separately.
    const bothPrototypes = [
        ['ListCardPrototype', () => new ListCardPrototype(), 'list-card-template', 'list-card'],
        ['ItemCardPrototype', () => new ItemCardPrototype(), 'item-card-template', 'item-card']
    ];

    it.each(bothPrototypes)('%s clones the card out of index.html',
        (_name, build, _templateId, className) => {
            const card = build().buildPrototypeElement();

            expect(card).toBeInstanceOf(window.HTMLLIElement);
            expect(card.classList.contains(className)).toBe(true);
        });

    it.each(bothPrototypes)('%s skips the whitespace left by indenting the HTML nicely',
        (_name, build) => {
            // template.content.firstChild would be a text node, which is why the
            // implementations reach for firstElementChild instead
            expect(build().buildPrototypeElement().nodeType).toBe(1);
        });

    it.each(bothPrototypes)('%s hands back a copy, never the template own element',
        (_name, build, templateId) => {
            // if it returned the template's element, the first card built would
            // quietly become the prototype for every card after it
            const original = document.getElementById(templateId).content.firstElementChild;

            const card = build().buildPrototypeElement();
            card.dataset.scribbledOn = 'yes';

            expect(card).not.toBe(original);
            expect(original.dataset.scribbledOn).toBeUndefined();
        });

    it('copies deeply, buttons and all', () => {
        const card = new ItemCardPrototype().buildPrototypeElement();
        expect(card.querySelector('[data-action="duplicate-item"]')).toBeTruthy();
        expect(card.querySelector('[data-action="delete-item"]')).toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
// the base class
// ---------------------------------------------------------------------------
describe('CardPrototype, the abstract base class', () => {
    it('refuses to let buildPrototypeElement go unimplemented', () => {
        class Incomplete extends CardPrototype {}
        expect(() => new Incomplete().getPrototypeElement())
            .toThrow(/Incomplete must override buildPrototypeElement/);
    });

    it('refuses to let initializeClone go unimplemented', () => {
        class HalfDone extends CardPrototype {
            buildPrototypeElement() { return document.createElement('li'); }
        }
        expect(() => new HalfDone().clone({}, 0))
            .toThrow(/HalfDone must override initializeClone/);
    });

    it('builds the prototype element only once, however many cards are stamped', () => {
        // this is the Prototype pattern's whole economy: build one perfect blank
        // card, then clone it, rather than assembling every card from scratch
        let timesBuilt = 0;
        class Counting extends CardPrototype {
            buildPrototypeElement() {
                timesBuilt++;
                return document.createElement('li');
            }
            initializeClone() { /* nothing to pour in */ }
        }

        const prototype = new Counting();
        prototype.clone({}, 0);
        prototype.clone({}, 1);
        prototype.clone({}, 2);

        expect(timesBuilt).toBe(1);
    });

    it('hands back the same prototype element every time it is asked', () => {
        const prototype = new ListCardPrototype();
        expect(prototype.getPrototypeElement()).toBe(prototype.getPrototypeElement());
    });

    it('never puts the prototype element itself into the document', () => {
        const prototype = new ListCardPrototype();
        expect(prototype.getPrototypeElement().isConnected).toBe(false);
    });

    it('produces a new element per clone, not the prototype over again', () => {
        const prototype = new ListCardPrototype();
        const list = new WolfieList({ id: 'list-a', name: 'Errands' });

        const first = prototype.clone(list, 0);
        const second = prototype.clone(list, 1);

        expect(first).not.toBe(second);
        expect(first).not.toBe(prototype.getPrototypeElement());
    });

    describe('requirePart', () => {
        it('finds a part of a card', () => {
            const element = document.createElement('div');
            element.innerHTML = '<span class="wanted"></span>';
            expect(CardPrototype.requirePart(element, '.wanted')).toBeTruthy();
        });

        it('throws a useful error rather than returning null', () => {
            // a null here would produce a card that quietly renders half its
            // data, and the mistake would be found by eye, days later
            const element = document.createElement('div');
            expect(() => CardPrototype.requirePart(element, '.missing'))
                .toThrow(/missing a required part: \.missing/);
        });
    });
});

// ---------------------------------------------------------------------------
// the home screen card
// ---------------------------------------------------------------------------
describe('ListCardPrototype', () => {
    const prototype = new ListCardPrototype();

    const listWithThree = () => new WolfieList({
        id: 'list-a',
        name: 'Errands',
        items: [
            new ListItem({ description: 'A', completed: true }),
            new ListItem({ description: 'B' }),
            new ListItem({ description: 'C' })
        ]
    });

    it('shows the list name', () => {
        const card = prototype.clone(listWithThree(), 0);
        expect(card.querySelector('.list-card-title').textContent).toBe('Errands');
    });

    it('shows how much of the list is done', () => {
        const card = prototype.clone(listWithThree(), 0);
        expect(card.querySelector('.list-card-subtitle').textContent).toBe('1 of 3 completed');
    });

    it('says so plainly when a list has no items', () => {
        const card = prototype.clone(new WolfieList({ name: 'Empty' }), 0);
        expect(card.querySelector('.list-card-subtitle').textContent).toBe('No items yet');
    });

    it('reports every item completed when they are', () => {
        const list = new WolfieList({
            name: 'Done',
            items: [new ListItem({ description: 'A', completed: true })]
        });
        expect(prototype.clone(list, 0).querySelector('.list-card-subtitle').textContent)
            .toBe('1 of 1 completed');
    });

    it('stamps the card with the list id, which is how a click is traced back', () => {
        // HomeView listens on the container, not on each card, so the id has to
        // travel on the element itself
        const card = prototype.clone(listWithThree(), 0);
        expect(card.dataset.listId).toBe('list-a');
    });

    it('stamps the card with its position', () => {
        expect(prototype.clone(listWithThree(), 4).dataset.index).toBe('4');
    });

    it('carries a duplicate button and a delete button', () => {
        const card = prototype.clone(listWithThree(), 0);
        expect(card.querySelector('[data-action="duplicate-list"]')).toBeTruthy();
        expect(card.querySelector('[data-action="delete-list"]')).toBeTruthy();
    });

    it('is reachable and operable by keyboard', () => {
        const card = prototype.clone(listWithThree(), 0);
        expect(card.getAttribute('role')).toBe('button');
        expect(card.getAttribute('tabindex')).toBe('0');
    });

    it('names itself for a screen reader', () => {
        const card = prototype.clone(listWithThree(), 0);
        expect(card.getAttribute('aria-label')).toBe('Open the list named Errands');
        expect(card.querySelector('[data-action="delete-list"]').getAttribute('aria-label'))
            .toBe('Delete the list named Errands');
    });

    // ------------------------------------------------------------------------
    // The proof that the markup really does come from index.html rather than
    // from a string in the JavaScript. Edit the template, build a fresh
    // prototype, and the card that comes out has to have changed with it. A
    // class that still built its own card would sail past every other test in
    // this file and fail this one.
    // ------------------------------------------------------------------------
    it('reads its markup from index.html, so editing the template changes the card', () => {
        const template = document.getElementById('list-card-template');
        template.content.firstElementChild
            .insertAdjacentHTML('beforeend', '<span class="brand-new-part"></span>');

        const card = new ListCardPrototype().clone(listWithThree(), 0);

        expect(card.querySelector('.brand-new-part')).toBeTruthy();
    });

    it('names the template it comes from, so the two can be found from each other', () => {
        expect(ListCardPrototype.TEMPLATE_ID).toBe('list-card-template');
        expect(document.getElementById(ListCardPrototype.TEMPLATE_ID)).toBeTruthy();
    });

    it('gives two cards from the same prototype independent contents', () => {
        const first = prototype.clone(new WolfieList({ id: 'list-a', name: 'First' }), 0);
        const second = prototype.clone(new WolfieList({ id: 'list-b', name: 'Second' }), 1);

        expect(first.querySelector('.list-card-title').textContent).toBe('First');
        expect(second.querySelector('.list-card-title').textContent).toBe('Second');
    });
});

// ---------------------------------------------------------------------------
// the item card
// ---------------------------------------------------------------------------
describe('ItemCardPrototype', () => {
    const prototype = new ItemCardPrototype();

    const unfinished = () => new ListItem({
        id: 'item-a',
        description: 'Walk Wolfie',
        dateEntered: '2026-09-01',
        priority: 'High',
        targetDate: null,
        completed: false
    });

    const finished = () => new ListItem({
        id: 'item-b',
        description: 'Refill the kibble bin',
        dateEntered: '2026-09-01',
        priority: 'Medium',
        targetDate: '2026-09-02',
        completed: true
    });

    it('shows the description', () => {
        expect(prototype.clone(unfinished(), 0).querySelector('.item-description').textContent)
            .toBe('Walk Wolfie');
    });

    it('shows the dates in the display format, not the stored format', () => {
        const card = prototype.clone(finished(), 0);
        expect(card.querySelector('.item-date-entered').textContent).toBe('09/01/2026');
        expect(card.querySelector('.item-target-date').textContent).toBe('09/02/2026');
    });

    it('shows a dash where an item has no target date', () => {
        expect(prototype.clone(unfinished(), 0).querySelector('.item-target-date').textContent)
            .toBe('—');
    });

    it('reads completion from the checkbox field, not from the target date', () => {
        // an item can carry a target date and still not be done, which is the
        // whole reason these are two separate fields
        const targeted = new ListItem({ description: 'Walk Wolfie', targetDate: '2026-09-20' });
        const card = prototype.clone(targeted, 0);
        expect(card.querySelector('.item-target-date').textContent).toBe('09/20/2026');
        expect(card.classList.contains('item-completed')).toBe(false);
    });

    it('shows the priority in its pill', () => {
        expect(prototype.clone(unfinished(), 0).querySelector('.priority-pill').textContent)
            .toBe('High');
    });

    it('colors the card and the pill by priority', () => {
        // classList rather than className: what has to be true is that the right
        // priority class is on the card and on the pill, and that the wrong ones
        // are not. A class of your own alongside them is not a mistake, so this
        // does not call it one.
        const card = prototype.clone(unfinished(), 0);
        const pill = card.querySelector('.priority-pill');

        expect(card.classList.contains('priority-high')).toBe(true);
        expect(pill.classList.contains('priority-pill')).toBe(true);
        expect(pill.classList.contains('priority-high')).toBe(true);
        expect(pill.classList.contains('priority-medium')).toBe(false);
        expect(pill.classList.contains('priority-low')).toBe(false);
    });

    it('marks a completed item so the stylesheet can strike it through', () => {
        expect(prototype.clone(finished(), 0).classList.contains('item-completed')).toBe(true);
    });

    it('ticks the completed column for an item that is done', () => {
        // which character you tick with is yours to pick. Comparing the column
        // against a constant on ItemCardPrototype would only have compared your
        // code with itself, so this asks the question that actually matters: is
        // anything shown at all for an item that is done?
        expect(prototype.clone(finished(), 0).querySelector('.item-completed-mark').textContent)
            .not.toBe('');
    });

    it('leaves the completed column empty for an item that is not', () => {
        expect(prototype.clone(unfinished(), 0).querySelector('.item-completed-mark').textContent)
            .toBe('');
    });

    it('leaves an unfinished item unmarked', () => {
        expect(prototype.clone(unfinished(), 0).classList.contains('item-completed')).toBe(false);
    });

    it('does not carry a stale completed marker from a previous clone', () => {
        // every clone comes from the prototype, which carries neither class, so
        // this passes today. It is worth pinning down anyway: if cards were ever
        // reused rather than rebuilt, this is the test that would fail first.
        prototype.clone(finished(), 0);
        expect(prototype.clone(unfinished(), 1).classList.contains('item-completed')).toBe(false);
    });

    it('stamps the card with the item id and its index', () => {
        // the index is what every button on the card, and drag and drop, work from
        const card = prototype.clone(unfinished(), 3);
        expect(card.dataset.itemId).toBe('item-a');
        expect(card.dataset.index).toBe('3');
    });

    it('is draggable', () => {
        expect(prototype.clone(unfinished(), 0).getAttribute('draggable')).toBe('true');
    });

    it('carries a duplicate button and a delete button', () => {
        const card = prototype.clone(unfinished(), 0);
        expect(card.querySelector('[data-action="duplicate-item"]')).toBeTruthy();
        expect(card.querySelector('[data-action="delete-item"]')).toBeTruthy();
    });

    it('names itself and its buttons for a screen reader', () => {
        // the wording is yours. What somebody listening to the page needs is for
        // every name to say WHICH item it is talking about, because "Edit" and
        // "Duplicate", thirty times down a list, say nothing at all.
        const card = prototype.clone(unfinished(), 0);
        expect(card.getAttribute('aria-label')).toContain('Walk Wolfie');
        expect(card.querySelector('[data-action="duplicate-item"]').getAttribute('aria-label'))
            .toContain('Walk Wolfie');
    });

    it('says in the name that a completed item is completed', () => {
        // the tick is aria-hidden, so without this a screen reader would have no
        // way at all of telling a finished item from an unfinished one. How you
        // word it is again yours, so long as the two really do read differently.
        const done = prototype.clone(finished(), 0).getAttribute('aria-label');
        const notDone = prototype
            .clone(new ListItem({ description: 'Refill the kibble bin' }), 0)
            .getAttribute('aria-label');

        expect(done).toContain('Refill the kibble bin');
        expect(done).not.toBe(notDone);
    });

    it('falls back to the default priority class for a corrupted priority', () => {
        // A real ListItem cleans its priority in the constructor and, now that
        // its fields are private, cannot be corrupted afterwards either. So this
        // can only be reached by handing the prototype something that is not a
        // ListItem at all. The fallback is worth keeping tested: it is what would
        // still draw a card rather than throw if that ever happened.
        const notReallyAnItem = {
            id: 'item-x',
            description: 'Walk Wolfie',
            dateEntered: '2026-09-01',
            priority: 'Nonsense',
            targetDate: null,
            completed: false,
            isCompleted: () => false
        };
        expect(prototype.clone(notReallyAnItem, 0).classList.contains('priority-low')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// the safety rule
// ---------------------------------------------------------------------------
describe('user typed text is never allowed to become markup', () => {
    // CardPrototype's comment lays down one rule for initializeClone: set text
    // with textContent, never with innerHTML. The prototype's own markup is a
    // fixed string we wrote, but a list name and an item description were typed
    // by a user, and this is the pair of tests that holds the line.
    //
    // A student who "tidies" one of those assignments into innerHTML will see
    // these two fail immediately, with an explanation, which is a far better
    // lesson than a vague warning in a lecture slide.
    const dangerous = '<img src=x onerror="window.attacked = true"><script>alert(1)</script>';

    it('renders a list name containing markup as plain text', () => {
        const card = new ListCardPrototype().clone(
            new WolfieList({ id: 'list-a', name: dangerous }), 0);

        expect(card.querySelector('.list-card-title').textContent).toBe(dangerous);
        expect(card.querySelector('img')).toBeNull();
        expect(card.querySelector('script')).toBeNull();
    });

    it('renders an item description containing markup as plain text', () => {
        const card = new ItemCardPrototype().clone(
            new ListItem({ id: 'item-a', description: dangerous }), 0);

        expect(card.querySelector('.item-description').textContent).toBe(dangerous);
        expect(card.querySelector('img')).toBeNull();
        expect(card.querySelector('script')).toBeNull();
    });

    it('keeps markup out of the accessible name as well', () => {
        // setAttribute is safe for the same reason textContent is: the value is
        // stored as text and never parsed.
        //
        // Note what this test does NOT do. Serializing the card back to a string
        // and searching it for "<img" would fail, because the characters really
        // are in there, sitting inside the title and aria-label attributes where
        // they are correctly escaped and completely inert. The question that
        // actually matters is whether any element got CREATED, so that is the
        // question to ask, on the whole card and not just on one span.
        const card = new ListCardPrototype().clone(
            new WolfieList({ id: 'list-a', name: dangerous }), 0);

        expect(card.getAttribute('aria-label')).toContain(dangerous);
        expect(card.querySelectorAll('img, script')).toHaveLength(0);

        // the only elements on the card are the ones the prototype itself puts
        // there, so a name full of markup cannot smuggle an extra one in
        const cleanCard = new ListCardPrototype().clone(
            new WolfieList({ id: 'list-b', name: 'Ordinary' }), 0);
        expect(card.querySelectorAll('*')).toHaveLength(cleanCard.querySelectorAll('*').length);
    });
});

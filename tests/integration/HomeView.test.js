// @vitest-environment jsdom

/**
 * HomeView.test.js
 *
 * A view plays both halves of the Observer pattern, and this file is organized
 * around that split, because the two halves need completely different tests.
 *
 *   as an Observer  it listens to the model and redraws. Tested by changing the
 *                   model and looking at the document.
 *   as a Subject    it turns clicks into application events. Tested by clicking
 *                   and looking at what a RecordingObserver heard.
 *
 * No controller is built here, which is what makes the second half provable.
 * With nobody listening but our spy, clicking Delete announces
 * DELETE_LIST_REQUESTED and nothing whatsoever is deleted. A view that reported
 * the request AND deleted the list would pass a sloppier test and be wrong.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { EventTypes } from '../../public/js/common/EventTypes.js';
import { bootViews } from '../helpers/app.js';
import { listenTo } from '../helpers/observers.js';
import { seedStorage, makeListsJSON } from '../helpers/fixtures.js';

let model;
let homeView;
let observer;

/** @return {HTMLElement[]} the cards currently on the home screen */
const cards = () => [...document.querySelectorAll('#list-card-container .list-card')];
const cardFor = (listId) => document.querySelector(`.list-card[data-list-id="${listId}"]`);
const titles = () => cards().map((card) => card.querySelector('.list-card-title').textContent);

/** clicks something the way a browser would, so the container's one handler sees it */
function click(element) {
    element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
}

function pressKey(element, key) {
    element.dispatchEvent(new window.KeyboardEvent('keydown', {
        key, bubbles: true, cancelable: true
    }));
}

async function boot(lists = makeListsJSON()) {
    window.localStorage.clear();
    seedStorage(lists);
    ({ model, homeView } = await bootViews());
    observer = listenTo(homeView);
}

beforeEach(async () => {
    await boot();
});

// ---------------------------------------------------------------------------
// the Observer half: drawing
// ---------------------------------------------------------------------------
describe('drawing the home screen', () => {
    it('stamps out one card per list', () => {
        expect(cards()).toHaveLength(2);
        expect(titles()).toEqual(['Errands', 'Empty List']);
    });

    it('draws the cards in the order the model holds them', async () => {
        await boot([
            { id: 'list-1', name: 'First', items: [] },
            { id: 'list-2', name: 'Second', items: [] },
            { id: 'list-3', name: 'Third', items: [] }
        ]);
        expect(titles()).toEqual(['First', 'Second', 'Third']);
    });

    it('redraws when the model announces the lists changed', () => {
        model.createNewList();
        expect(cards()).toHaveLength(3);
        expect(titles().at(-1)).toBe('Untitled List');
    });

    it('redraws after a deletion', () => {
        model.deleteList('list-a');
        expect(titles()).toEqual(['Empty List']);
    });

    it('picks up a rename made from the list screen', () => {
        model.openList('list-a');
        model.renameCurrentList('Weekend');
        expect(titles()).toContain('Weekend');
    });

    it('ignores events that are not about the collection of lists', () => {
        // the view is subscribed to everything the model says, and must redraw
        // only for the one event that concerns it
        const before = document.getElementById('list-card-container').innerHTML;
        model.openList('list-a');
        expect(document.getElementById('list-card-container').innerHTML).toBe(before);
    });

    describe('when there are no lists at all', () => {
        beforeEach(async () => {
            await boot([]);
        });

        it('shows the invitation to make one', () => {
            expect(document.getElementById('home-empty-message').classList.contains('hidden'))
                .toBe(false);
        });

        it('hides the empty card container', () => {
            expect(document.getElementById('list-card-container').classList.contains('hidden'))
                .toBe(true);
        });

        it('hides the message again as soon as a list exists', () => {
            model.createNewList();
            expect(document.getElementById('home-empty-message').classList.contains('hidden'))
                .toBe(true);
        });
    });

    it('hides the empty message while there are lists', () => {
        expect(document.getElementById('home-empty-message').classList.contains('hidden'))
            .toBe(true);
    });
});

describe('showing and hiding the screen', () => {
    it('starts out visible, since it is the screen the user lands on', () => {
        expect(homeView.isShowing()).toBe(true);
    });

    it('hides', () => {
        homeView.hide();
        expect(homeView.isShowing()).toBe(false);
        expect(document.getElementById('home-view').classList.contains('hidden')).toBe(true);
    });

    it('redraws as it is shown, so it never appears holding stale cards', () => {
        homeView.hide();
        model.createNewList();

        homeView.show();

        expect(homeView.isShowing()).toBe(true);
        expect(cards()).toHaveLength(3);
    });
});

// ---------------------------------------------------------------------------
// the Subject half: reporting what the user did
// ---------------------------------------------------------------------------
describe('reporting what the user did', () => {
    it('announces that a new list was asked for', () => {
        click(document.getElementById('add-list-button'));

        expect(observer.types).toEqual([EventTypes.CREATE_LIST_REQUESTED]);
        // and, crucially, no list was created. That is the controller job.
        expect(model.getLists()).toHaveLength(2);
    });

    it('announces that a list should be opened, and says which', () => {
        click(cardFor('list-a'));

        expect(observer.first(EventTypes.OPEN_LIST_REQUESTED).get('listId')).toBe('list-a');
        expect(model.getCurrentList()).toBeNull();
    });

    it('opens the list when any part of the card is clicked', () => {
        click(cardFor('list-a').querySelector('.list-card-title'));
        expect(observer.first(EventTypes.OPEN_LIST_REQUESTED).get('listId')).toBe('list-a');
    });

    it('announces a duplicate request, and does not also open the list', () => {
        // the duplicate button sits inside the card, so without the closest()
        // check in the view this click would mean both things at once
        click(cardFor('list-a').querySelector('[data-action="duplicate-list"]'));

        expect(observer.types).toEqual([EventTypes.DUPLICATE_LIST_REQUESTED]);
        expect(observer.first(EventTypes.DUPLICATE_LIST_REQUESTED).get('listId')).toBe('list-a');
    });

    it('announces a delete request, carrying the name for the warning modal', () => {
        click(cardFor('list-a').querySelector('[data-action="delete-list"]'));

        const event = observer.first(EventTypes.DELETE_LIST_REQUESTED);
        expect(event.get('listId')).toBe('list-a');
        expect(event.get('listName')).toBe('Errands');
        // nothing is deleted by the view, under any circumstances
        expect(model.getLists()).toHaveLength(2);
    });

    it('says nothing when the click misses every card', () => {
        click(document.getElementById('list-card-container'));
        expect(observer.events).toEqual([]);
    });

    it('says nothing for a card whose list has since disappeared', () => {
        // a stale card cannot take the application down, it simply does nothing
        const card = cardFor('list-a');
        card.dataset.listId = 'list-that-was-deleted';

        click(card);

        expect(observer.events).toEqual([]);
    });
});

describe('working from the keyboard', () => {
    it('opens a list on Enter', () => {
        pressKey(cardFor('list-a'), 'Enter');
        expect(observer.first(EventTypes.OPEN_LIST_REQUESTED).get('listId')).toBe('list-a');
    });

    it('opens a list on Space', () => {
        pressKey(cardFor('list-b'), ' ');
        expect(observer.first(EventTypes.OPEN_LIST_REQUESTED).get('listId')).toBe('list-b');
    });

    it('ignores any other key', () => {
        pressKey(cardFor('list-a'), 'a');
        pressKey(cardFor('list-a'), 'Tab');
        expect(observer.events).toEqual([]);
    });

    it('stops the browser from scrolling the page on Space', () => {
        const event = new window.KeyboardEvent('keydown', {
            key: ' ', bubbles: true, cancelable: true
        });
        cardFor('list-a').dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
    });

    it('reaches the delete button when that is what has focus', () => {
        pressKey(cardFor('list-a').querySelector('[data-action="delete-list"]'), 'Enter');
        expect(observer.types).toEqual([EventTypes.DELETE_LIST_REQUESTED]);
    });
});

// ---------------------------------------------------------------------------
// event delegation
// ---------------------------------------------------------------------------
describe('event delegation', () => {
    // The view attaches exactly one click handler, to the container, rather than
    // one per card. Cards are thrown away and rebuilt on every redraw, so a
    // handler attached to a card would be a handler leaked, and a card built
    // after the handlers were wired would have none at all.
    it('still works on cards that did not exist when the handlers were wired', () => {
        const created = model.createNewList();
        observer.clear();

        click(cardFor(created.id));

        expect(observer.first(EventTypes.OPEN_LIST_REQUESTED).get('listId')).toBe(created.id);
    });

    it('keeps working through many redraws', () => {
        for (let i = 0; i < 5; i++) model.createNewList();
        observer.clear();

        click(cardFor('list-a'));

        expect(observer.count(EventTypes.OPEN_LIST_REQUESTED)).toBe(1);
    });

    it('reports one event per click, not one per card on screen', () => {
        click(cardFor('list-a'));
        expect(observer.events).toHaveLength(1);
    });
});

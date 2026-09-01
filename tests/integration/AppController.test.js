// @vitest-environment jsdom

/**
 * AppController.test.js
 *
 * The whole application, assembled exactly as main.js assembles it, driven by
 * clicking the actual buttons in the actual markup.
 *
 * This is the broadest test in the suite, and the furthest thing from a unit
 * test, on purpose. The controller has no behavior of its own to isolate: its
 * entire job is to sit between pieces that never speak to each other directly,
 * so the only way to test it is to check that a click at one end produces the
 * right change at the other. Isolating it with mocks on every side would leave
 * nothing behind worth asserting.
 *
 * These tests read as user stories, and that is deliberate. "Delete an item, then
 * undo, and the item comes back where it was" is a sentence from the assignment
 * handout, and it should be possible to find the test that proves it by searching
 * for those words.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { bootApplication } from '../helpers/app.js';
import { seedStorage, readStorage, makeListsJSON } from '../helpers/fixtures.js';

let app;
let model;

// --- reading the screen ----------------------------------------------------
const homeIsShowing = () =>
    !document.getElementById('home-view').classList.contains('hidden');
const listIsShowing = () =>
    !document.getElementById('list-view').classList.contains('hidden');

const listCards = () => [...document.querySelectorAll('.list-card')];
const listCardFor = (listId) => document.querySelector(`.list-card[data-list-id="${listId}"]`);
const listTitles = () =>
    listCards().map((card) => card.querySelector('.list-card-title').textContent);

const itemCards = () => [...document.querySelectorAll('.item-card')];
const itemCardAt = (index) => document.querySelector(`.item-card[data-index="${index}"]`);
const itemDescriptions = () =>
    itemCards().map((card) => card.querySelector('.item-description').textContent);

const isHidden = (id) => document.getElementById(id).classList.contains('hidden');
const undoButton = () => document.getElementById('undo-button');
const redoButton = () => document.getElementById('redo-button');

// --- acting on the screen --------------------------------------------------
function click(element) {
    element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
}

function pressKeyOnDocument(key, options = {}) {
    const event = new window.KeyboardEvent('keydown', {
        key, bubbles: true, cancelable: true, ...options
    });
    document.dispatchEvent(event);
    return event;
}

/** fills in the item editor and presses a button in it */
function fillItemModal({ description, priority } = {}) {
    if (description !== undefined) {
        document.getElementById('item-description-input').value = description;
    }
    if (priority !== undefined) {
        document.getElementById('item-priority-select').value = priority;
    }
}

/**
 * The item editor's heading is what tells a user where they have got to while
 * stepping through a list with Previous and Next, so it has to carry both the
 * position and the total. The sentence around those two numbers is yours to
 * write, which is why this looks for the numbers rather than for a sentence.
 *
 * @param {number} position which item is showing, counting from one
 * @param {number} total how many items the list holds
 */
function expectHeadingShowsItem(position, total) {
    const heading = document.getElementById('item-modal-heading').textContent;
    expect(heading, 'the item modal heading').toMatch(new RegExp(String.raw`\b${position}\b`));
    expect(heading, 'the item modal heading').toMatch(new RegExp(String.raw`\b${total}\b`));
}

const pressOk = () => click(document.getElementById('item-ok-button'));
const pressConfirmAccept = () => click(document.getElementById('confirm-accept-button'));
const pressConfirmDecline = () => click(document.getElementById('confirm-decline-button'));

async function boot(lists = makeListsJSON()) {
    window.localStorage.clear();
    seedStorage(lists);
    app = await bootApplication();
    model = app.model;
}

/** the common starting position: the three item list open on screen */
async function bootWithListOpen() {
    await boot();
    click(listCardFor('list-a'));
}

beforeEach(async () => {
    await boot();
});

// ---------------------------------------------------------------------------
// starting up
// ---------------------------------------------------------------------------
describe('starting the application', () => {
    it('lands on the home screen with the saved lists drawn', () => {
        expect(homeIsShowing()).toBe(true);
        expect(listIsShowing()).toBe(false);
        expect(listTitles()).toEqual(['Errands', 'Empty List']);
    });

    it('has no modal up', () => {
        expect(isHidden('modal-backdrop')).toBe(true);
    });

    it('subscribes everybody before the model loads', async () => {
        // if the subscriptions happened after load(), the LISTS_CHANGED that
        // loading sends would arrive before anyone was listening and the home
        // screen would come up empty
        await boot();
        expect(listCards()).toHaveLength(2);
    });
});

// ---------------------------------------------------------------------------
// the home screen
// ---------------------------------------------------------------------------
describe('creating a list', () => {
    beforeEach(() => {
        click(document.getElementById('add-list-button'));
    });

    it('makes the list and opens it straight away', () => {
        expect(model.getLists()).toHaveLength(3);
        expect(listIsShowing()).toBe(true);
        expect(homeIsShowing()).toBe(false);
    });

    it('opens it with the name selected, so typing renames it', () => {
        const nameInput = document.getElementById('list-name-input');
        expect(document.activeElement).toBe(nameInput);
        expect(nameInput.value).toBe('Untitled List');
        expect(nameInput.selectionEnd).toBe('Untitled List'.length);
    });

    it('opens it empty, with the invitation to add an item', () => {
        expect(itemCards()).toHaveLength(0);
        expect(isHidden('list-empty-message')).toBe(false);
    });

    it('saves it', () => {
        expect(readStorage().lists).toHaveLength(3);
    });
});

describe('opening a list', () => {
    it('shows the list screen with the items drawn', () => {
        click(listCardFor('list-a'));

        expect(listIsShowing()).toBe(true);
        expect(homeIsShowing()).toBe(false);
        expect(itemDescriptions()).toEqual([
            'Walk Wolfie', 'Refill the kibble bin', 'Book the vet']);
    });

    it('shows the list name in the toolbar', () => {
        click(listCardFor('list-a'));
        expect(document.getElementById('list-name-input').value).toBe('Errands');
    });

    it('starts with undo and redo greyed out', () => {
        click(listCardFor('list-a'));
        expect(undoButton().disabled).toBe(true);
        expect(redoButton().disabled).toBe(true);
    });
});

describe('duplicating a list', () => {
    it('copies it in place, without asking and without opening it', () => {
        click(listCardFor('list-a').querySelector('[data-action="duplicate-list"]'));

        // whatever you call the copy, it lands directly beneath the original and
        // the home screen stays where it is: no confirmation, no navigation
        const titles = listTitles();
        expect(titles).toHaveLength(3);
        expect(titles[0]).toBe('Errands');
        expect(titles[1]).not.toBe('Errands');
        expect(titles[2]).toBe('Empty List');
        expect(homeIsShowing()).toBe(true);
    });

    it('copies the items too', () => {
        click(listCardFor('list-a').querySelector('[data-action="duplicate-list"]'));
        expect(model.getLists()[1].size()).toBe(3);
    });
});

describe('deleting a list', () => {
    beforeEach(() => {
        click(listCardFor('list-a').querySelector('[data-action="delete-list"]'));
    });

    it('asks first, naming the list and warning that it cannot be undone', () => {
        // nothing in this application is destroyed without the warning modal
        expect(isHidden('confirm-modal')).toBe(false);
        expect(document.getElementById('confirm-modal-title').textContent)
            .toBe('Delete This List?');
        expect(document.getElementById('confirm-modal-message').textContent)
            .toContain('Errands');
        expect(document.getElementById('confirm-modal-message').textContent)
            .toMatch(/cannot be undone/i);
    });

    it('deletes it on yes', () => {
        pressConfirmAccept();

        expect(listTitles()).toEqual(['Empty List']);
        expect(readStorage().lists).toHaveLength(1);
        expect(isHidden('confirm-modal')).toBe(true);
    });

    it('keeps it on no', () => {
        pressConfirmDecline();

        expect(listTitles()).toEqual(['Errands', 'Empty List']);
        expect(isHidden('confirm-modal')).toBe(true);
    });

    it('keeps it on Escape', () => {
        pressKeyOnDocument('Escape');
        expect(model.getLists()).toHaveLength(2);
    });
});

// ---------------------------------------------------------------------------
// items
// ---------------------------------------------------------------------------
describe('adding an item', () => {
    beforeEach(async () => {
        await bootWithListOpen();
        click(document.getElementById('add-item-button'));
    });

    it('opens the editor ready for a new item', () => {
        expect(isHidden('item-modal')).toBe(false);
        expect(document.getElementById('item-modal-heading').textContent).toBe('New Item');
    });

    it('adds the item to the end of the list on OK', () => {
        fillItemModal({ description: 'Buy a new leash', priority: 'High' });
        pressOk();

        expect(itemDescriptions()).toEqual([
            'Walk Wolfie', 'Refill the kibble bin', 'Book the vet', 'Buy a new leash']);
        expect(isHidden('item-modal')).toBe(true);
    });

    it('records it as an undoable transaction', () => {
        fillItemModal({ description: 'Buy a new leash' });
        pressOk();

        expect(undoButton().disabled).toBe(false);

        click(undoButton());
        expect(itemDescriptions()).toHaveLength(3);

        click(redoButton());
        expect(itemDescriptions()).toContain('Buy a new leash');
    });

    it('adds nothing on Cancel', () => {
        fillItemModal({ description: 'Buy a new leash' });
        click(document.getElementById('item-cancel-button'));

        expect(itemDescriptions()).toHaveLength(3);
        expect(undoButton().disabled).toBe(true);
    });

    it('refuses an empty description and says why', () => {
        fillItemModal({ description: '   ' });
        pressOk();

        expect(isHidden('alert-modal')).toBe(false);
        expect(document.getElementById('alert-modal-title').textContent)
            .toBe('A Description Is Required');
        // and the editor is still there, waiting
        expect(isHidden('item-modal')).toBe(false);
        expect(itemDescriptions()).toHaveLength(3);
    });

    it('lets the user carry on after dismissing that warning', () => {
        fillItemModal({ description: '' });
        pressOk();
        click(document.getElementById('alert-ok-button'));

        fillItemModal({ description: 'Buy a new leash' });
        pressOk();

        expect(itemDescriptions()).toContain('Buy a new leash');
    });
});

describe('editing an item', () => {
    beforeEach(async () => {
        await bootWithListOpen();
    });

    it('opens the editor on the item that was clicked', () => {
        click(itemCardAt(1));

        expectHeadingShowsItem(2, 3);
        expect(document.getElementById('item-description-input').value)
            .toBe('Refill the kibble bin');
    });

    it('applies the change and records it as undoable', () => {
        click(itemCardAt(0));
        fillItemModal({ description: 'Walk Wolfie twice' });
        pressOk();

        expect(itemDescriptions()[0]).toBe('Walk Wolfie twice');

        click(undoButton());
        expect(itemDescriptions()[0]).toBe('Walk Wolfie');
    });

    it('keeps the item id across the edit', () => {
        click(itemCardAt(0));
        fillItemModal({ description: 'Walk Wolfie twice' });
        pressOk();

        expect(itemCardAt(0).dataset.itemId).toBe('item-a');
    });

    // ------------------------------------------------------------------------
    // The controller compares the before and after snapshots and skips the
    // transaction entirely when they match. Without that, opening an item and
    // pressing OK would put a transaction on the stack that undoes to exactly
    // what it undid from, so the undo button would light up and then appear to
    // do nothing when pressed.
    // ------------------------------------------------------------------------
    it('records nothing when the user changed nothing', () => {
        click(itemCardAt(0));
        pressOk();

        expect(undoButton().disabled).toBe(true);
    });

    it('records nothing when the user only added whitespace', () => {
        click(itemCardAt(0));
        fillItemModal({ description: '  Walk Wolfie  ' });
        pressOk();

        expect(undoButton().disabled).toBe(true);
    });

    it('moves to the next item on Next, saving as it goes', () => {
        click(itemCardAt(0));
        fillItemModal({ description: 'Fixed the first' });
        click(document.getElementById('item-next-button'));

        expect(itemDescriptions()[0]).toBe('Fixed the first');
        expect(isHidden('item-modal')).toBe(false);
        expectHeadingShowsItem(2, 3);
        expect(document.getElementById('item-description-input').value)
            .toBe('Refill the kibble bin');
    });

    it('moves to the previous item on Previous', () => {
        click(itemCardAt(2));
        click(document.getElementById('item-previous-button'));

        expectHeadingShowsItem(2, 3);
    });

    it('puts each fix on the stack as its own transaction', () => {
        // walking the list with Next, fixing typos, should leave one undoable
        // step per fix rather than one giant one
        click(itemCardAt(0));
        fillItemModal({ description: 'Fixed the first' });
        click(document.getElementById('item-next-button'));

        fillItemModal({ description: 'Fixed the second' });
        pressOk();

        click(undoButton());
        expect(itemDescriptions()[1]).toBe('Refill the kibble bin');
        expect(itemDescriptions()[0]).toBe('Fixed the first');

        click(undoButton());
        expect(itemDescriptions()[0]).toBe('Walk Wolfie');
    });
});

describe('duplicating an item', () => {
    beforeEach(async () => {
        await bootWithListOpen();
    });

    it('copies it in directly beneath, without asking', () => {
        click(itemCardAt(0).querySelector('[data-action="duplicate-item"]'));

        expect(itemDescriptions()).toEqual([
            'Walk Wolfie', 'Walk Wolfie', 'Refill the kibble bin', 'Book the vet']);
    });

    it('gives the copy an id of its own', () => {
        click(itemCardAt(0).querySelector('[data-action="duplicate-item"]'));
        expect(itemCardAt(1).dataset.itemId).not.toBe('item-a');
    });

    it('is undoable', () => {
        click(itemCardAt(0).querySelector('[data-action="duplicate-item"]'));
        click(undoButton());
        expect(itemDescriptions()).toHaveLength(3);
    });
});

describe('deleting an item', () => {
    beforeEach(async () => {
        await bootWithListOpen();
        click(itemCardAt(1).querySelector('[data-action="delete-item"]'));
    });

    it('asks first, and says the deletion can be undone', () => {
        expect(isHidden('confirm-modal')).toBe(false);
        expect(document.getElementById('confirm-modal-message').textContent)
            .toContain('Refill the kibble bin');
        expect(document.getElementById('confirm-modal-message').textContent)
            .toMatch(/can undo this/i);
    });

    it('deletes it on yes', () => {
        pressConfirmAccept();
        expect(itemDescriptions()).toEqual(['Walk Wolfie', 'Book the vet']);
    });

    it('keeps it on no', () => {
        pressConfirmDecline();
        expect(itemDescriptions()).toHaveLength(3);
        expect(undoButton().disabled).toBe(true);
    });

    // the sentence straight out of the handout
    it('brings the item back, in its old position, on undo', () => {
        pressConfirmAccept();
        click(undoButton());

        expect(itemDescriptions()).toEqual([
            'Walk Wolfie', 'Refill the kibble bin', 'Book the vet']);
        expect(itemCardAt(1).dataset.itemId).toBe('item-b');
    });
});

describe('renaming the open list', () => {
    beforeEach(async () => {
        await bootWithListOpen();
    });

    function typeName(value) {
        const input = document.getElementById('list-name-input');
        input.value = value;
        input.dispatchEvent(new window.Event('change', { bubbles: true }));
    }

    it('renames it and records the rename as undoable', () => {
        typeName('Weekend');

        expect(model.getCurrentList().name).toBe('Weekend');
        expect(undoButton().disabled).toBe(false);

        click(undoButton());
        expect(model.getCurrentList().name).toBe('Errands');
        expect(document.getElementById('list-name-input').value).toBe('Errands');
    });

    it('records nothing when the name would not actually change', () => {
        typeName('  Errands  ');
        expect(undoButton().disabled).toBe(true);
    });

    it('records nothing when the field is left exactly as it was', () => {
        typeName('Errands');
        expect(undoButton().disabled).toBe(true);
    });

    it('shows the new name on the home screen too', () => {
        typeName('Weekend');
        click(document.getElementById('close-button'));

        expect(listTitles()).toContain('Weekend');
    });
});

// ---------------------------------------------------------------------------
// undo and redo
// ---------------------------------------------------------------------------
describe('undo and redo', () => {
    beforeEach(async () => {
        await bootWithListOpen();
    });

    const duplicateFirst = () =>
        click(itemCardAt(0).querySelector('[data-action="duplicate-item"]'));

    it('greys the buttons out at each end of the stack', () => {
        expect(undoButton().disabled).toBe(true);
        expect(redoButton().disabled).toBe(true);

        duplicateFirst();
        expect(undoButton().disabled).toBe(false);
        expect(redoButton().disabled).toBe(true);

        click(undoButton());
        expect(undoButton().disabled).toBe(true);
        expect(redoButton().disabled).toBe(false);
    });

    it('unwinds several edits in reverse order', () => {
        duplicateFirst();
        click(itemCardAt(3).querySelector('[data-action="duplicate-item"]'));
        expect(itemCards()).toHaveLength(5);

        click(undoButton());
        expect(itemCards()).toHaveLength(4);

        click(undoButton());
        expect(itemDescriptions()).toEqual([
            'Walk Wolfie', 'Refill the kibble bin', 'Book the vet']);
    });

    it('throws the redo away once a new edit is made', () => {
        duplicateFirst();
        click(undoButton());
        expect(redoButton().disabled).toBe(false);

        click(itemCardAt(2).querySelector('[data-action="duplicate-item"]'));

        expect(redoButton().disabled).toBe(true);
    });

    // Undo must never reach back across a list boundary and start undoing edits
    // made to a list the user is no longer looking at.
    it('forgets the history when the list is closed', () => {
        duplicateFirst();
        click(document.getElementById('close-button'));
        click(listCardFor('list-a'));

        expect(undoButton().disabled).toBe(true);
        expect(redoButton().disabled).toBe(true);
        // and the edit itself stands, it was only the history that was dropped
        expect(itemCards()).toHaveLength(4);
    });

    it('forgets the history when a different list is opened', () => {
        duplicateFirst();
        click(document.getElementById('close-button'));
        click(listCardFor('list-b'));

        expect(undoButton().disabled).toBe(true);
    });
});

describe('the keyboard shortcuts', () => {
    beforeEach(async () => {
        await bootWithListOpen();
        click(itemCardAt(0).querySelector('[data-action="duplicate-item"]'));
        document.body.focus();
    });

    it('undoes on Ctrl+Z', () => {
        pressKeyOnDocument('z', { ctrlKey: true });
        expect(itemCards()).toHaveLength(3);
    });

    it('redoes on Ctrl+Y', () => {
        pressKeyOnDocument('z', { ctrlKey: true });
        pressKeyOnDocument('y', { ctrlKey: true });
        expect(itemCards()).toHaveLength(4);
    });

    it('redoes on Ctrl+Shift+Z as well', () => {
        pressKeyOnDocument('z', { ctrlKey: true });
        pressKeyOnDocument('z', { ctrlKey: true, shiftKey: true });
        expect(itemCards()).toHaveLength(4);
    });

    it('works with the command key, for the Mac', () => {
        pressKeyOnDocument('z', { metaKey: true });
        expect(itemCards()).toHaveLength(3);
    });

    it('ignores a bare Z with no modifier', () => {
        pressKeyOnDocument('z');
        expect(itemCards()).toHaveLength(4);
    });

    // ------------------------------------------------------------------------
    // The three deliberate exclusions.
    // ------------------------------------------------------------------------
    it('does nothing while a modal is up, since the modal owns the keyboard', () => {
        click(document.getElementById('add-item-button'));

        pressKeyOnDocument('z', { ctrlKey: true });

        expect(itemCards()).toHaveLength(4);
    });

    it('does nothing while the caret is in a text field', () => {
        // there Ctrl+Z belongs to the browser and means undo my typing
        document.getElementById('list-name-input').focus();

        pressKeyOnDocument('z', { ctrlKey: true });

        expect(itemCards()).toHaveLength(4);
    });

    it('does nothing on the home screen, where there is no list to undo', () => {
        click(document.getElementById('close-button'));

        pressKeyOnDocument('z', { ctrlKey: true });

        expect(homeIsShowing()).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// moving between screens, and reporting trouble
// ---------------------------------------------------------------------------
describe('closing a list', () => {
    it('goes back to the home screen with the cards up to date', async () => {
        await bootWithListOpen();
        click(itemCardAt(0).querySelector('[data-action="duplicate-item"]'));

        click(document.getElementById('close-button'));

        expect(homeIsShowing()).toBe(true);
        expect(listIsShowing()).toBe(false);
        expect(listCardFor('list-a').querySelector('.list-card-subtitle').textContent)
            .toBe('1 of 4 completed');
    });

    // The Wolfie in the top left corner is the second way out, and it must be
    // indistinguishable from the first: same screen change, same saved state,
    // same emptied undo history.
    describe('by clicking the Wolfie in the corner', () => {
        it('goes back to the home screen', async () => {
            await bootWithListOpen();

            click(document.getElementById('home-button'));

            expect(homeIsShowing()).toBe(true);
            expect(listIsShowing()).toBe(false);
        });

        it('closes the list in the model, not merely on screen', async () => {
            await bootWithListOpen();

            click(document.getElementById('home-button'));

            expect(model.getCurrentList()).toBeNull();
            expect(model.hasCurrentList()).toBe(false);
        });

        it('keeps the edits made while the list was open', async () => {
            await bootWithListOpen();
            click(itemCardAt(0).querySelector('[data-action="duplicate-item"]'));

            click(document.getElementById('home-button'));

            expect(listCardFor('list-a').querySelector('.list-card-subtitle').textContent)
                .toBe('1 of 4 completed');
            expect(readStorage().lists[0].items).toHaveLength(4);
        });

        it('forgets the undo history, exactly as the close button does', async () => {
            await bootWithListOpen();
            click(itemCardAt(0).querySelector('[data-action="duplicate-item"]'));
            expect(undoButton().disabled).toBe(false);

            click(document.getElementById('home-button'));
            click(listCardFor('list-a'));

            expect(undoButton().disabled).toBe(true);
            expect(redoButton().disabled).toBe(true);
        });
    });
});

describe('reporting trouble to the user', () => {
    it('shows the informative modal when a change cannot be saved', () => {
        vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
            throw new DOMException('quota', 'QuotaExceededError');
        });

        click(document.getElementById('add-list-button'));

        expect(isHidden('alert-modal')).toBe(false);
        expect(document.getElementById('alert-modal-title').textContent)
            .toMatch(/were not saved/i);
    });

    it('complains loudly about an event nobody handles', async () => {
        // the default branch of the controller switch exists to catch a typo in
        // an event name, which is otherwise a completely silent failure
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        app.homeView.notifyObservers('AN_EVENT_THAT_DOES_NOT_EXIST', {});

        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('does not handle'), expect.any(String));
    });
});

// ---------------------------------------------------------------------------
// the whole way round
// ---------------------------------------------------------------------------
describe('a whole session', () => {
    it('survives a long sequence of edits, undos and redos', async () => {
        await bootWithListOpen();

        // add one, duplicate one, delete one, rename the list
        click(document.getElementById('add-item-button'));
        fillItemModal({ description: 'Buy a new leash' });
        pressOk();

        click(itemCardAt(0).querySelector('[data-action="duplicate-item"]'));

        click(itemCardAt(4).querySelector('[data-action="delete-item"]'));
        pressConfirmAccept();

        const nameInput = document.getElementById('list-name-input');
        nameInput.value = 'Weekend';
        nameInput.dispatchEvent(new window.Event('change', { bubbles: true }));

        expect(itemDescriptions()).toEqual([
            'Walk Wolfie', 'Walk Wolfie', 'Refill the kibble bin', 'Book the vet']);

        // now unwind all four
        for (let i = 0; i < 4; i++) click(undoButton());

        expect(model.getCurrentList().name).toBe('Errands');
        expect(itemDescriptions()).toEqual([
            'Walk Wolfie', 'Refill the kibble bin', 'Book the vet']);
        expect(undoButton().disabled).toBe(true);

        // and replay them
        for (let i = 0; i < 4; i++) click(redoButton());

        expect(model.getCurrentList().name).toBe('Weekend');
        expect(itemDescriptions()).toEqual([
            'Walk Wolfie', 'Walk Wolfie', 'Refill the kibble bin', 'Book the vet']);
        expect(redoButton().disabled).toBe(true);
    });

    it('writes everything through to local storage as it goes', async () => {
        await bootWithListOpen();

        click(document.getElementById('add-item-button'));
        fillItemModal({ description: 'Buy a new leash' });
        pressOk();

        const saved = readStorage();
        expect(saved.lists[0].items.map((item) => item.description)).toEqual([
            'Walk Wolfie', 'Refill the kibble bin', 'Book the vet', 'Buy a new leash']);
    });

    it('writes the undo through to local storage too', async () => {
        await bootWithListOpen();

        click(itemCardAt(0).querySelector('[data-action="duplicate-item"]'));
        click(undoButton());

        expect(readStorage().lists[0].items).toHaveLength(3);
    });
});

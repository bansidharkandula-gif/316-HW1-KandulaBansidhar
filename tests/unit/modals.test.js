// @vitest-environment jsdom

/**
 * modals.test.js
 *
 * All three modals plus the base class they share.
 *
 * Modal is the most stateful class in the application: it keeps a static stack of
 * whichever modals are open and a static latch recording whether it has installed
 * its document-wide key handler. Both of those are reset between tests by the
 * vi.resetModules() inside importApp, which is the only reason a file like this
 * can run more than one test.
 *
 * A note on focus. Modal filters what Tab may reach by asking each element for
 * its offsetParent, and jsdom, having no layout engine, answers null for
 * everything. The tests that care about focus therefore call
 * enableOffsetParent() first, which is a shim rather than the truth, so they are
 * grouped together and labelled.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventTypes } from '../../public/js/common/EventTypes.js';
import { mountIndexHtml, importApp } from '../helpers/app.js';
import { listenTo } from '../helpers/observers.js';
import { enableOffsetParent } from '../helpers/layout.js';

let Modal;
let ItemModal;
let ConfirmModal;
let AlertModal;
let WolfieList;
let ListItem;

let itemModal;
let confirmModal;
let alertModal;

const backdrop = () => document.getElementById('modal-backdrop');
const isHidden = (id) => document.getElementById(id).classList.contains('hidden');

function click(element) {
    element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
}

/** the document-wide handler Modal installs is what listens for these */
function pressKeyOnDocument(key, options = {}) {
    const event = new window.KeyboardEvent('keydown', {
        key, bubbles: true, cancelable: true, ...options
    });
    document.dispatchEvent(event);
    return event;
}

beforeEach(async () => {
    mountIndexHtml();
    ({ Modal, ItemModal, ConfirmModal, AlertModal, WolfieList, ListItem } = await importApp());

    itemModal = new ItemModal();
    confirmModal = new ConfirmModal();
    alertModal = new AlertModal();
});

afterEach(() => {
    vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// the shared behavior
// ---------------------------------------------------------------------------
describe('Modal, the shared behavior', () => {
    it('refuses to be built for an element that is not in the page', () => {
        expect(() => new (class extends Modal {})('no-such-modal'))
            .toThrow(/cannot find an element with the id no-such-modal/);
    });

    describe('opening and closing', () => {
        it('puts the modal and the backdrop on screen', () => {
            alertModal.inform({ title: 'Notice', message: 'Something happened' });

            expect(isHidden('alert-modal')).toBe(false);
            expect(isHidden('modal-backdrop')).toBe(false);
            expect(alertModal.isOpen()).toBe(true);
        });

        it('marks the body, so the stylesheet can stop the page behind scrolling', () => {
            alertModal.inform({ message: 'Something happened' });
            expect(document.body.classList.contains('modal-is-open')).toBe(true);
        });

        it('takes both back off again on close', () => {
            alertModal.inform({ message: 'Something happened' });
            alertModal.hide();

            expect(isHidden('alert-modal')).toBe(true);
            expect(isHidden('modal-backdrop')).toBe(true);
            expect(document.body.classList.contains('modal-is-open')).toBe(false);
            expect(alertModal.isOpen()).toBe(false);
        });

        it('ignores a second request to close', () => {
            alertModal.inform({ message: 'Something happened' });
            alertModal.hide();
            expect(() => alertModal.hide()).not.toThrow();
        });

        it('reports whether any modal at all is open', () => {
            // AppController checks this before acting on Ctrl+Z, so that the
            // topmost modal owns the keyboard while it is up
            expect(Modal.isAnyOpen()).toBe(false);
            alertModal.inform({ message: 'Something happened' });
            expect(Modal.isAnyOpen()).toBe(true);
            alertModal.hide();
            expect(Modal.isAnyOpen()).toBe(false);
        });
    });

    describe('stacking one modal on another', () => {
        // This really happens: the item editor opens the informative modal on top
        // of itself when a description is missing.
        beforeEach(() => {
            itemModal.openForNewItem();
            alertModal.inform({ title: 'A Description Is Required', message: 'Please say what.' });
        });

        it('leaves the modal underneath on screen', () => {
            expect(isHidden('item-modal')).toBe(false);
            expect(isHidden('alert-modal')).toBe(false);
        });

        it('stacks the newer modal above the older one', () => {
            expect(Number(document.getElementById('alert-modal').style.zIndex))
                .toBeGreaterThan(Number(document.getElementById('item-modal').style.zIndex));
        });

        it('reports the topmost modal, which is the one the keyboard talks to', () => {
            expect(Modal.topMost()).toBe(alertModal);
        });

        it('keeps the backdrop up when only the top modal closes', () => {
            alertModal.hide();

            expect(isHidden('modal-backdrop')).toBe(false);
            expect(Modal.topMost()).toBe(itemModal);
        });

        it('takes the backdrop down only when the last modal closes', () => {
            alertModal.hide();
            itemModal.hide();

            expect(isHidden('modal-backdrop')).toBe(true);
            expect(Modal.topMost()).toBeNull();
        });
    });

    describe('the Escape key', () => {
        it('cancels the modal that is open', () => {
            const observer = listenTo(alertModal);
            alertModal.inform({ message: 'Something happened' });

            pressKeyOnDocument('Escape');

            expect(isHidden('alert-modal')).toBe(true);
            expect(observer.types).toEqual([EventTypes.ALERT_DISMISSED]);
        });

        it('cancels only the topmost modal', () => {
            itemModal.openForNewItem();
            alertModal.inform({ message: 'Please say what.' });

            pressKeyOnDocument('Escape');

            expect(isHidden('alert-modal')).toBe(true);
            expect(isHidden('item-modal')).toBe(false);
        });

        it('does nothing at all when no modal is open', () => {
            const event = pressKeyOnDocument('Escape');
            expect(event.defaultPrevented).toBe(false);
        });
    });

    describe('clicking the backdrop', () => {
        // Deliberately not "close". A modal exists to insist on an answer, and
        // throwing away a half finished edit because the user clicked slightly
        // outside the box would be unkind. It shakes instead.
        it('does not close the modal', () => {
            itemModal.openForNewItem();

            click(backdrop());

            expect(isHidden('item-modal')).toBe(false);
            expect(itemModal.isOpen()).toBe(true);
        });

        it('shakes the modal to point out that it is waiting', () => {
            itemModal.openForNewItem();

            click(backdrop());

            expect(document.getElementById('item-modal').classList.contains('modal-shake'))
                .toBe(true);
        });

        it('shakes only the topmost modal', () => {
            itemModal.openForNewItem();
            alertModal.inform({ message: 'Please say what.' });

            click(backdrop());

            expect(document.getElementById('alert-modal').classList.contains('modal-shake'))
                .toBe(true);
            expect(document.getElementById('item-modal').classList.contains('modal-shake'))
                .toBe(false);
        });
    });
});

// ---------------------------------------------------------------------------
// focus, which needs the layout shim
// ---------------------------------------------------------------------------
describe('focus handling (uses the jsdom offsetParent shim)', () => {
    beforeEach(() => {
        enableOffsetParent();
    });

    it('moves focus into the modal when it opens', () => {
        alertModal.inform({ message: 'Something happened' });
        expect(document.activeElement).toBe(document.getElementById('alert-ok-button'));
    });

    it('hands focus back to wherever it came from when the modal closes', () => {
        const addItemButton = document.getElementById('add-item-button');
        addItemButton.focus();

        alertModal.inform({ message: 'Something happened' });
        alertModal.hide();

        expect(document.activeElement).toBe(addItemButton);
    });

    it('starts a warning modal on Cancel, never on the destructive button', () => {
        // somebody hammering the Enter key must not be able to destroy anything
        confirmModal.ask({ title: 'Delete This List?', message: 'Are you sure?' });
        expect(document.activeElement).toBe(document.getElementById('confirm-decline-button'));
    });

    it('starts the item editor in the description field', () => {
        // the field the user actually came here to type in, not whichever
        // control happens to come first in the markup
        itemModal.openForNewItem();
        expect(document.activeElement).toBe(document.getElementById('item-description-input'));
    });

    describe('trapping Tab inside the modal', () => {
        // being able to Tab out to the buttons of the screen behind a modal
        // defeats the entire point of having one
        it('wraps from the last control back to the first', () => {
            confirmModal.ask({ title: 'Delete This List?', message: 'Are you sure?' });
            document.getElementById('confirm-accept-button').focus();

            const event = pressKeyOnDocument('Tab');

            expect(event.defaultPrevented).toBe(true);
            expect(document.activeElement).toBe(document.getElementById('confirm-decline-button'));
        });

        it('wraps backwards from the first control to the last', () => {
            confirmModal.ask({ title: 'Delete This List?', message: 'Are you sure?' });
            document.getElementById('confirm-decline-button').focus();

            const event = pressKeyOnDocument('Tab', { shiftKey: true });

            expect(event.defaultPrevented).toBe(true);
            expect(document.activeElement).toBe(document.getElementById('confirm-accept-button'));
        });

        it('pulls focus back in if it has escaped the modal altogether', () => {
            confirmModal.ask({ title: 'Delete This List?', message: 'Are you sure?' });
            document.getElementById('add-list-button').focus();

            pressKeyOnDocument('Tab');

            expect(document.getElementById('confirm-modal')
                .contains(document.activeElement)).toBe(true);
        });

        it('leaves Tab alone when no modal is open', () => {
            const event = pressKeyOnDocument('Tab');
            expect(event.defaultPrevented).toBe(false);
        });
    });
});

// ---------------------------------------------------------------------------
// the informative modal
// ---------------------------------------------------------------------------
describe('AlertModal', () => {
    it('shows the title and message it is given', () => {
        alertModal.inform({ title: 'Nothing Can Be Saved', message: 'Local storage is off.' });

        expect(document.getElementById('alert-modal-title').textContent)
            .toBe('Nothing Can Be Saved');
        expect(document.getElementById('alert-modal-message').textContent)
            .toBe('Local storage is off.');
    });

    it('falls back to a generic title', () => {
        alertModal.inform({ message: 'Something happened' });
        expect(document.getElementById('alert-modal-title').textContent).toBe('Notice');
    });

    it('closes and announces when OK is pressed', () => {
        const observer = listenTo(alertModal);
        alertModal.inform({ message: 'Something happened' });

        click(document.getElementById('alert-ok-button'));

        expect(isHidden('alert-modal')).toBe(true);
        expect(observer.types).toEqual([EventTypes.ALERT_DISMISSED]);
    });

    it('sets the message as text, so a message can never become markup', () => {
        alertModal.inform({ message: '<b>bold</b>' });
        expect(document.getElementById('alert-modal-message').querySelector('b')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// the warning modal
// ---------------------------------------------------------------------------
describe('ConfirmModal', () => {
    const ask = (context = { action: 'delete-list', listId: 'list-a' }) =>
        confirmModal.ask({
            title: 'Delete This List?',
            message: 'The list named "Errands" will be permanently deleted.',
            acceptLabel: 'Delete List',
            context
        });

    it('shows the question and labels the dangerous button', () => {
        ask();

        expect(document.getElementById('confirm-modal-title').textContent)
            .toBe('Delete This List?');
        expect(document.getElementById('confirm-modal-message').textContent)
            .toContain('permanently deleted');
        expect(document.getElementById('confirm-accept-button').textContent).toBe('Delete List');
    });

    it('defaults the dangerous button label', () => {
        confirmModal.ask({ title: 'Delete?', message: 'Sure?' });
        expect(document.getElementById('confirm-accept-button').textContent).toBe('Delete');
    });

    // The context object is what lets a single modal guard every destructive
    // action in the program. The modal has no idea what it is asking about, it
    // simply carries whatever it was handed back out again with the answer.
    it('hands the context back with a yes', () => {
        const observer = listenTo(confirmModal);
        ask({ action: 'delete-item', index: 2 });

        click(document.getElementById('confirm-accept-button'));

        expect(observer.first(EventTypes.CONFIRM_ACCEPTED).get('context'))
            .toEqual({ action: 'delete-item', index: 2 });
    });

    it('hands the context back with a no, so the controller can tell what was declined', () => {
        const observer = listenTo(confirmModal);
        ask({ action: 'delete-list', listId: 'list-a' });

        click(document.getElementById('confirm-decline-button'));

        expect(observer.first(EventTypes.CONFIRM_DECLINED).get('context'))
            .toEqual({ action: 'delete-list', listId: 'list-a' });
    });

    it('treats Escape as a no', () => {
        const observer = listenTo(confirmModal);
        ask();

        pressKeyOnDocument('Escape');

        expect(observer.types).toEqual([EventTypes.CONFIRM_DECLINED]);
        expect(isHidden('confirm-modal')).toBe(true);
    });

    it('closes on either answer', () => {
        ask();
        click(document.getElementById('confirm-accept-button'));
        expect(isHidden('confirm-modal')).toBe(true);
    });

    it('carries a different context on a second question', () => {
        const observer = listenTo(confirmModal);

        ask({ action: 'delete-list', listId: 'list-a' });
        click(document.getElementById('confirm-decline-button'));

        ask({ action: 'delete-item', index: 1 });
        click(document.getElementById('confirm-accept-button'));

        expect(observer.first(EventTypes.CONFIRM_ACCEPTED).get('context'))
            .toEqual({ action: 'delete-item', index: 1 });
    });
});

// ---------------------------------------------------------------------------
// the item editor
// ---------------------------------------------------------------------------
describe('ItemModal', () => {
    const description = () => document.getElementById('item-description-input');
    const dateEntered = () => document.getElementById('item-date-entered-input');
    const prioritySelect = () => document.getElementById('item-priority-select');
    const targetDate = () => document.getElementById('item-target-date-input');
    const completedCheckbox = () => document.getElementById('item-completed-checkbox');
    const okButton = () => document.getElementById('item-ok-button');
    const previousButton = () => document.getElementById('item-previous-button');
    const nextButton = () => document.getElementById('item-next-button');

    /** a three item list to open the modal onto */
    const makeList = () => new WolfieList({
        id: 'list-a',
        name: 'Errands',
        items: [
            new ListItem({
                id: 'item-a', description: 'Walk Wolfie',
                dateEntered: '2026-09-01', priority: 'High', targetDate: null, completed: false
            }),
            new ListItem({
                id: 'item-b', description: 'Refill the kibble bin',
                dateEntered: '2026-09-01', priority: 'Medium',
                targetDate: '2026-09-02', completed: true
            }),
            new ListItem({ id: 'item-c', description: 'Book the vet' })
        ]
    });

    function freezeClockAt(isoDate) {
        const [year, month, day] = isoDate.split('-').map(Number);
        vi.useFakeTimers();
        vi.setSystemTime(new Date(year, month - 1, day, 10, 0, 0));
    }

    it('offers exactly the three priorities, most urgent first', () => {
        // build these options out of one shared vocabulary rather than typing
        // them into the markup, so that a fourth priority some day is a one line
        // change in one place rather than a change here and a forgotten one there
        expect([...prioritySelect().options].map((option) => option.value))
            .toEqual(['High', 'Medium', 'Low']);
    });

    it('rebuilds the options rather than adding to them', () => {
        new ItemModal();
        expect(prioritySelect().options).toHaveLength(['High', 'Medium', 'Low'].length);
    });

    describe('opening for a new item', () => {
        beforeEach(() => {
            freezeClockAt('2026-09-10');
            itemModal.openForNewItem();
        });

        it('says what it is for', () => {
            // the handout asks for "New Item" and "Add", but the exact words are
            // yours. What has to be true is that the heading and the button both
            // tell the user this modal is making an item rather than editing one
            expect(document.getElementById('item-modal-heading').textContent)
                .toMatch(/new/i);
            expect(okButton().textContent).toMatch(/add/i);
        });

        it('starts empty, dated today, at the default priority', () => {
            expect(description().value).toBe('');
            expect(dateEntered().value).toBe('2026-09-10');
            expect(prioritySelect().value).toBe('Low');
            expect(targetDate().value).toBe('');
            expect(completedCheckbox().checked).toBe(false);
        });

        it('switches off Previous and Next, which mean nothing yet', () => {
            expect(previousButton().disabled).toBe(true);
            expect(nextButton().disabled).toBe(true);
        });

        it('does not carry values over from a previous item', () => {
            itemModal.hide();
            itemModal.openForItem(makeList(), 1);
            itemModal.hide();

            itemModal.openForNewItem();

            expect(description().value).toBe('');
            expect(completedCheckbox().checked).toBe(false);
        });
    });

    describe('opening on an existing item', () => {
        it('says which item this is', () => {
            // stepping through a list with Previous and Next, the heading is the
            // only thing telling the user where they have got to, so it has to
            // carry both the position and the total. The sentence is yours.
            itemModal.openForItem(makeList(), 1);
            const heading = document.getElementById('item-modal-heading').textContent;

            expect(heading).toMatch(/\b2\b/);
            expect(heading).toMatch(/\b3\b/);
            expect(okButton().textContent).toMatch(/ok/i);
        });

        it('loads every one of the item values', () => {
            itemModal.openForItem(makeList(), 1);

            expect(description().value).toBe('Refill the kibble bin');
            expect(dateEntered().value).toBe('2026-09-01');
            expect(prioritySelect().value).toBe('Medium');
            expect(targetDate().value).toBe('2026-09-02');
            expect(completedCheckbox().checked).toBe(true);
        });

        it('empties the target date for an item that has none', () => {
            itemModal.openForItem(makeList(), 0);
            expect(targetDate().value).toBe('');
            expect(completedCheckbox().checked).toBe(false);
        });

        it('switches off Previous on the first item', () => {
            itemModal.openForItem(makeList(), 0);
            expect(previousButton().disabled).toBe(true);
            expect(nextButton().disabled).toBe(false);
        });

        it('switches off Next on the last item', () => {
            itemModal.openForItem(makeList(), 2);
            expect(previousButton().disabled).toBe(false);
            expect(nextButton().disabled).toBe(true);
        });

        it('offers both in the middle', () => {
            itemModal.openForItem(makeList(), 1);
            expect(previousButton().disabled).toBe(false);
            expect(nextButton().disabled).toBe(false);
        });

        it('does not open at all for an index that is not there', () => {
            itemModal.openForItem(makeList(), 99);
            expect(itemModal.isOpen()).toBe(false);
        });
    });

    describe('the target date and the completed checkbox', () => {
        // These are two independent facts. A target date says when an item is
        // meant to be finished, which the user picks long before it is, so
        // nothing the checkbox does may reach into the date beside it.
        function tick(checked) {
            completedCheckbox().checked = checked;
            completedCheckbox().dispatchEvent(new window.Event('change', { bubbles: true }));
        }

        it('leaves the target date editable whether or not the item is done', () => {
            itemModal.openForItem(makeList(), 0);
            expect(targetDate().disabled).toBe(false);

            tick(true);
            expect(targetDate().disabled).toBe(false);
        });

        it('does not fill in a target date when the item is ticked off', () => {
            freezeClockAt('2026-09-10');
            itemModal.openForItem(makeList(), 0);

            tick(true);

            expect(targetDate().value).toBe('');
        });

        it('does not clear the target date when the item is un-ticked', () => {
            itemModal.openForItem(makeList(), 1);

            tick(false);

            expect(targetDate().value).toBe('2026-09-02');
        });

        it('carries a target date on an item that is not done', () => {
            itemModal.openForItem(makeList(), 0);
            targetDate().value = '2026-09-20';

            const observer = listenTo(itemModal);
            click(okButton());

            expect(observer.first(EventTypes.ITEM_MODAL_COMMIT).get('values'))
                .toMatchObject({ targetDate: '2026-09-20', completed: false });
        });
    });

    describe('committing', () => {
        it('announces everything the controller needs to build a transaction', () => {
            const observer = listenTo(itemModal);
            itemModal.openForItem(makeList(), 1);

            description().value = 'Refill the kibble bin twice';
            prioritySelect().value = 'High';
            click(okButton());

            const event = observer.first(EventTypes.ITEM_MODAL_COMMIT);
            expect(event.get('mode')).toBe(ItemModal.MODE_EDIT);
            expect(event.get('index')).toBe(1);
            expect(event.get('then')).toBe('close');
            expect(event.get('values')).toEqual({
                description: 'Refill the kibble bin twice',
                dateEntered: '2026-09-01',
                priority: 'High',
                targetDate: '2026-09-02',
                completed: true
            });
        });

        it('reports the create mode for a brand new item', () => {
            const observer = listenTo(itemModal);
            itemModal.openForNewItem();

            description().value = 'Something new';
            click(okButton());

            expect(observer.first(EventTypes.ITEM_MODAL_COMMIT).get('mode'))
                .toBe(ItemModal.MODE_CREATE);
        });

        it('trims the description', () => {
            const observer = listenTo(itemModal);
            itemModal.openForNewItem();

            description().value = '   Something new   ';
            click(okButton());

            expect(observer.first(EventTypes.ITEM_MODAL_COMMIT).get('values').description)
                .toBe('Something new');
        });

        it('reports a null target date where the field was left empty', () => {
            const observer = listenTo(itemModal);
            itemModal.openForItem(makeList(), 0);

            click(okButton());

            expect(observer.first(EventTypes.ITEM_MODAL_COMMIT).get('values').targetDate)
                .toBeNull();
        });

        it('changes nothing itself', () => {
            // the modal reads values in and hands values out, and that is all.
            // Whether this becomes an add, an edit, or nothing is the controller decision.
            const list = makeList();
            itemModal.openForItem(list, 0);

            description().value = 'Changed';
            click(okButton());

            expect(list.getItemAt(0).description).toBe('Walk Wolfie');
        });

        it('commits when Enter is pressed in the form', () => {
            const observer = listenTo(itemModal);
            itemModal.openForNewItem();
            description().value = 'Something new';

            const event = new window.KeyboardEvent('keydown', {
                key: 'Enter', bubbles: true, cancelable: true
            });
            document.getElementById('item-modal-form').dispatchEvent(event);

            expect(event.defaultPrevented).toBe(true);
            expect(observer.count(EventTypes.ITEM_MODAL_COMMIT)).toBe(1);
        });
    });

    describe('Previous and Next', () => {
        it('commits first and says where to go next', () => {
            const observer = listenTo(itemModal);
            itemModal.openForItem(makeList(), 1);

            description().value = 'Fixed a typo';
            click(nextButton());

            const event = observer.first(EventTypes.ITEM_MODAL_COMMIT);
            expect(event.get('then')).toBe('next');
            expect(event.get('values').description).toBe('Fixed a typo');
        });

        it('says previous for the other button', () => {
            const observer = listenTo(itemModal);
            itemModal.openForItem(makeList(), 1);

            click(previousButton());

            expect(observer.first(EventTypes.ITEM_MODAL_COMMIT).get('then')).toBe('previous');
        });

        it('stays open, since the controller decides where to move it', () => {
            itemModal.openForItem(makeList(), 1);
            click(nextButton());
            expect(itemModal.isOpen()).toBe(true);
        });
    });

    describe('an empty description', () => {
        it('is refused, with an explanation rather than a commit', () => {
            const observer = listenTo(itemModal);
            itemModal.openForNewItem();

            description().value = '   ';
            click(okButton());

            expect(observer.count(EventTypes.ITEM_MODAL_COMMIT)).toBe(0);

            const invalid = observer.first(EventTypes.ITEM_MODAL_INVALID);
            expect(invalid.get('title')).toBe('A Description Is Required');
            // deliberately loose. What matters is that the user is told which
            // field is at fault, not the exact sentence used to tell them, and a
            // test that pins down the whole wording turns every improvement to
            // the copy into a failing build.
            expect(invalid.get('message')).toMatch(/description/i);
        });

        it('leaves the editor open so the description can be typed in', () => {
            itemModal.openForNewItem();
            description().value = '';
            click(okButton());

            expect(itemModal.isOpen()).toBe(true);
        });

        it('refuses Next as well as OK', () => {
            const observer = listenTo(itemModal);
            itemModal.openForItem(makeList(), 0);

            description().value = '';
            click(nextButton());

            expect(observer.count(EventTypes.ITEM_MODAL_COMMIT)).toBe(0);
            expect(observer.count(EventTypes.ITEM_MODAL_INVALID)).toBe(1);
        });
    });

    describe('cancelling', () => {
        it('announces the cancellation and closes', () => {
            const observer = listenTo(itemModal);
            itemModal.openForItem(makeList(), 0);

            click(document.getElementById('item-cancel-button'));

            expect(observer.types).toEqual([EventTypes.ITEM_MODAL_CANCELLED]);
            expect(itemModal.isOpen()).toBe(false);
        });

        it('says which mode was cancelled', () => {
            const observer = listenTo(itemModal);
            itemModal.openForNewItem();

            click(document.getElementById('item-cancel-button'));

            expect(observer.first(EventTypes.ITEM_MODAL_CANCELLED).get('mode'))
                .toBe(ItemModal.MODE_CREATE);
        });

        it('never announces a commit, however much was typed', () => {
            const observer = listenTo(itemModal);
            itemModal.openForItem(makeList(), 0);

            description().value = 'Typed and then thought better of';
            click(document.getElementById('item-cancel-button'));

            expect(observer.count(EventTypes.ITEM_MODAL_COMMIT)).toBe(0);
        });

        it('treats Escape as Cancel', () => {
            const observer = listenTo(itemModal);
            itemModal.openForItem(makeList(), 0);

            pressKeyOnDocument('Escape');

            expect(observer.types).toEqual([EventTypes.ITEM_MODAL_CANCELLED]);
        });
    });
});

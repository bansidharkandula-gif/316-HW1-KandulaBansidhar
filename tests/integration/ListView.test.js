// @vitest-environment jsdom

/**
 * ListView.test.js
 *
 * Same shape as HomeView.test.js: the Observer half is tested by changing the
 * model and reading the document, the Subject half by acting on the document and
 * reading a spy. Again no controller is built, so the view is genuinely on its
 * own and cannot be caught doing the controller's work for it.
 *
 * The drag and drop block at the bottom is the most involved thing in the whole
 * unit suite, and it is worth the trouble. The index adjustment it tests is the
 * single most error-prone calculation in the application, it is invisible in the
 * DOM, and by eye a wrong answer looks almost right.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { EventTypes } from '../../public/js/common/EventTypes.js';
import { bootViews } from '../helpers/app.js';
import { listenTo } from '../helpers/observers.js';
import { seedStorage, makeListsJSON } from '../helpers/fixtures.js';
import { stackVertically, makeDataTransfer, fireDragEvent } from '../helpers/layout.js';

let model;
let listView;
let observer;
/** taken from the freshly built module graph, see tests/helpers/app.js */
let ListItem;

const cards = () => [...document.querySelectorAll('#item-card-container .item-card')];
const cardAt = (index) => document.querySelector(`.item-card[data-index="${index}"]`);
const descriptions = () =>
    cards().map((card) => card.querySelector('.item-description').textContent);

const nameInput = () => document.getElementById('list-name-input');
const undoButton = () => document.getElementById('undo-button');
const redoButton = () => document.getElementById('redo-button');

function click(element) {
    element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
}

function pressKey(element, key) {
    const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return event;
}

async function boot({ lists = makeListsJSON(), open = 'list-a' } = {}) {
    window.localStorage.clear();
    seedStorage(lists);
    ({ model, listView, ListItem } = await bootViews());
    if (open !== null) model.openList(open);
    listView.show();
    observer = listenTo(listView);
}

beforeEach(async () => {
    await boot();
});

// ---------------------------------------------------------------------------
// the Observer half: drawing
// ---------------------------------------------------------------------------
describe('drawing the open list', () => {
    it('stamps out one card per item, in order', () => {
        expect(cards()).toHaveLength(3);
        expect(descriptions()).toEqual([
            'Walk Wolfie', 'Refill the kibble bin', 'Book the vet']);
    });

    it('numbers the cards from zero', () => {
        expect(cards().map((card) => card.dataset.index)).toEqual(['0', '1', '2']);
    });

    it('puts the list name in the toolbar', () => {
        expect(nameInput().value).toBe('Errands');
    });

    it('redraws when the open list changes', () => {
        model.addItemToCurrentList(new ListItem({ description: 'New' }), 3);
        expect(descriptions()).toContain('New');
    });

    it('renumbers the cards after an item is removed', () => {
        // every button on a card acts on the index stamped into it, so stale
        // numbering would send the next click to the wrong item
        model.removeItemFromCurrentList(0);
        expect(cards().map((card) => card.dataset.index)).toEqual(['0', '1']);
        expect(descriptions()).toEqual(['Refill the kibble bin', 'Book the vet']);
    });

    it('follows a rename into the toolbar', () => {
        model.renameCurrentList('Weekend');
        expect(nameInput().value).toBe('Weekend');
    });

    it('empties the container when no list is open', () => {
        model.closeCurrentList();
        expect(cards()).toHaveLength(0);
    });

    describe('an empty list', () => {
        beforeEach(async () => {
            await boot({ open: 'list-b' });
        });

        it('shows the invitation to add an item', () => {
            expect(document.getElementById('list-empty-message').classList.contains('hidden'))
                .toBe(false);
        });

        it('hides the column headers, which would otherwise label nothing', () => {
            expect(document.querySelector('.item-column-headers').classList.contains('hidden'))
                .toBe(true);
        });

        it('brings the headers back once there is an item', () => {
            model.addItemToCurrentList(model.getListById('list-a').getItemAt(0).clone(), 0);
            expect(document.querySelector('.item-column-headers').classList.contains('hidden'))
                .toBe(false);
        });
    });
});

describe('the undo and redo buttons', () => {
    it('start disabled on a freshly opened list', () => {
        expect(undoButton().disabled).toBe(true);
        expect(redoButton().disabled).toBe(true);
    });

    it('follow what the model announces about the stack', () => {
        listView.onNotify({
            type: EventTypes.TRANSACTION_STACK_CHANGED,
            get: (key) => ({ canUndo: true, canRedo: false })[key]
        });

        expect(undoButton().disabled).toBe(false);
        expect(redoButton().disabled).toBe(true);
    });

    it('are set directly by updateUndoRedoButtons', () => {
        listView.updateUndoRedoButtons(true, true);
        expect(undoButton().disabled).toBe(false);
        expect(redoButton().disabled).toBe(false);

        listView.updateUndoRedoButtons(false, false);
        expect(undoButton().disabled).toBe(true);
        expect(redoButton().disabled).toBe(true);
    });
});

describe('showing and hiding the screen', () => {
    it('is hidden until it is shown', async () => {
        await boot({ open: null });
        listView.hide();
        expect(listView.isShowing()).toBe(false);
    });

    it('redraws as it is shown', () => {
        listView.hide();
        model.removeItemFromCurrentList(0);

        listView.show();

        expect(listView.isShowing()).toBe(true);
        expect(cards()).toHaveLength(2);
    });

    it('selects the name so that typing replaces it', () => {
        // a brand new list opens with its name selected, so naming it is simply
        // the next thing the user types
        listView.focusNameInput();
        expect(document.activeElement).toBe(nameInput());
        expect(nameInput().selectionStart).toBe(0);
        expect(nameInput().selectionEnd).toBe('Errands'.length);
    });
});

// ---------------------------------------------------------------------------
// the Subject half: reporting what the user did
// ---------------------------------------------------------------------------
describe('reporting what the user did', () => {
    it('announces undo, redo, close and add', () => {
        listView.updateUndoRedoButtons(true, true);

        click(undoButton());
        click(redoButton());
        click(document.getElementById('close-button'));
        click(document.getElementById('add-item-button'));

        expect(observer.types).toEqual([
            EventTypes.UNDO_REQUESTED,
            EventTypes.REDO_REQUESTED,
            EventTypes.CLOSE_LIST_REQUESTED,
            EventTypes.ADD_ITEM_REQUESTED
        ]);
    });

    it('announces the same close request from the Wolfie in the corner', () => {
        // the home button is a second door out of the list, and it deliberately
        // announces the same event the close button does rather than one of its
        // own, so that there is only one path back to the home screen
        click(document.getElementById('home-button'));

        expect(observer.types).toEqual([EventTypes.CLOSE_LIST_REQUESTED]);
    });

    it('closes nothing itself when the Wolfie is clicked', () => {
        click(document.getElementById('home-button'));
        expect(model.getCurrentList()).not.toBeNull();
    });

    it('announces that an item should be edited, and says which', () => {
        click(cardAt(1));

        expect(observer.first(EventTypes.EDIT_ITEM_REQUESTED).get('index')).toBe(1);
    });

    it('announces an edit from any part of the card', () => {
        click(cardAt(2).querySelector('.item-description'));
        expect(observer.first(EventTypes.EDIT_ITEM_REQUESTED).get('index')).toBe(2);
    });

    it('announces a duplicate request instead of an edit', () => {
        click(cardAt(0).querySelector('[data-action="duplicate-item"]'));

        expect(observer.types).toEqual([EventTypes.DUPLICATE_ITEM_REQUESTED]);
        expect(observer.first(EventTypes.DUPLICATE_ITEM_REQUESTED).get('index')).toBe(0);
    });

    it('announces a delete request, carrying the description for the warning modal', () => {
        click(cardAt(1).querySelector('[data-action="delete-item"]'));

        const event = observer.first(EventTypes.DELETE_ITEM_REQUESTED);
        expect(event.get('index')).toBe(1);
        expect(event.get('description')).toBe('Refill the kibble bin');
        // and nothing was deleted
        expect(model.getCurrentList().size()).toBe(3);
    });

    it('says nothing when the click misses every card', () => {
        click(document.getElementById('item-card-container'));
        expect(observer.events).toEqual([]);
    });

    it('says nothing for a card whose item has since disappeared', () => {
        const card = cardAt(0);
        card.dataset.index = '99';
        click(card);
        expect(observer.events).toEqual([]);
    });

    it('opens an item from the keyboard', () => {
        pressKey(cardAt(1), 'Enter');
        expect(observer.first(EventTypes.EDIT_ITEM_REQUESTED).get('index')).toBe(1);
    });

    it('ignores keys other than Enter and Space on a card', () => {
        pressKey(cardAt(1), 'a');
        expect(observer.events).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// the list name field
// ---------------------------------------------------------------------------
describe('renaming from the toolbar', () => {
    /** the change event is what the browser fires when the user is finished */
    function finishTyping(value) {
        nameInput().value = value;
        nameInput().dispatchEvent(new window.Event('change', { bubbles: true }));
    }

    it('announces a rename once the user has finished, not on every keystroke', () => {
        // one transaction per rename, not one per letter typed
        finishTyping('Weekend');

        expect(observer.count(EventTypes.RENAME_LIST_REQUESTED)).toBe(1);
        expect(observer.first(EventTypes.RENAME_LIST_REQUESTED).get('name')).toBe('Weekend');
    });

    it('reports the raw text and leaves the tidying up to the model', () => {
        finishTyping('   Weekend   ');
        expect(observer.first(EventTypes.RENAME_LIST_REQUESTED).get('name')).toBe('   Weekend   ');
    });

    it('does not rename the list itself', () => {
        finishTyping('Weekend');
        expect(model.getCurrentList().name).toBe('Errands');
    });

    it('takes the caret out of the field on Enter, which is what commits it', () => {
        nameInput().focus();
        nameInput().value = 'Weekend';

        const event = pressKey(nameInput(), 'Enter');

        expect(event.defaultPrevented).toBe(true);
        expect(document.activeElement).not.toBe(nameInput());
    });

    it('puts the old name back on Escape', () => {
        nameInput().focus();
        nameInput().value = 'Half typed nam';

        pressKey(nameInput(), 'Escape');

        expect(nameInput().value).toBe('Errands');
        expect(observer.count(EventTypes.RENAME_LIST_REQUESTED)).toBe(0);
    });
});

describe('the name field and the caret', () => {
    // render runs after every single edit, and assigning to value would send the
    // caret back to the end of the text each time. The view therefore only
    // assigns when the field is genuinely out of date, and these two tests pin
    // both halves of that decision down.
    it('leaves the field alone when it already shows the right name', () => {
        nameInput().focus();
        nameInput().setSelectionRange(2, 2);

        listView.render();

        expect(nameInput().selectionStart).toBe(2);
    });

    it('updates the field when undo changes the name underneath the caret', () => {
        model.renameCurrentList('Weekend');
        expect(nameInput().value).toBe('Weekend');

        model.renameCurrentList('Errands');
        expect(nameInput().value).toBe('Errands');
    });
});

// ---------------------------------------------------------------------------
// drag and drop
// ---------------------------------------------------------------------------
describe('reordering by dragging', () => {
    /**
     * Performs a whole drag, from picking a card up to letting go.
     *
     * jsdom has no DragEvent and no layout, so both are supplied: the cards are
     * given a stacked geometry, and the events are built by hand. What is being
     * tested is ListView's arithmetic, not the browser's drag machinery, and the
     * Playwright test in tests/e2e/drag-and-drop.spec.js covers the other half.
     *
     * @param {number} fromIndex the card to pick up
     * @param {Object} target where to let go: an index plus which half of it
     */
    function drag(fromIndex, { onIndex = null, half = 'top' } = {}) {
        const geometry = stackVertically(cards(), 40);
        const dataTransfer = makeDataTransfer();

        fireDragEvent(cardAt(fromIndex), 'dragstart', { dataTransfer });

        const container = document.getElementById('item-card-container');
        const dropTarget = onIndex === null ? container : cardAt(onIndex);
        const clientY = onIndex === null
            ? 999
            : (half === 'top' ? geometry[onIndex].top + 5 : geometry[onIndex].bottom - 5);

        fireDragEvent(dropTarget, 'dragover', { clientY, dataTransfer });
        fireDragEvent(dropTarget, 'drop', { clientY, dataTransfer });
        fireDragEvent(cardAt(fromIndex) ?? container, 'dragend', { dataTransfer });
    }

    it('marks the card being dragged, so the stylesheet can fade it', () => {
        const dataTransfer = makeDataTransfer();
        fireDragEvent(cardAt(0), 'dragstart', { dataTransfer });

        expect(cardAt(0).classList.contains('dragging')).toBe(true);
    });

    it('cleans the marker off again when the drag ends', () => {
        const dataTransfer = makeDataTransfer();
        fireDragEvent(cardAt(0), 'dragstart', { dataTransfer });
        fireDragEvent(cardAt(0), 'dragend', { dataTransfer });

        expect(document.querySelector('.dragging')).toBeNull();
    });

    it('allows the drop, which a browser forbids unless preventDefault is called', () => {
        const dataTransfer = makeDataTransfer();
        stackVertically(cards(), 40);
        fireDragEvent(cardAt(0), 'dragstart', { dataTransfer });

        const dragOver = fireDragEvent(cardAt(1), 'dragover', { clientY: 45, dataTransfer });

        expect(dragOver.defaultPrevented).toBe(true);
    });

    it('shows where the card would land', () => {
        const dataTransfer = makeDataTransfer();
        const geometry = stackVertically(cards(), 40);
        fireDragEvent(cardAt(0), 'dragstart', { dataTransfer });

        fireDragEvent(cardAt(2), 'dragover', { clientY: geometry[2].top + 5, dataTransfer });
        expect(cardAt(2).classList.contains('drop-before')).toBe(true);

        fireDragEvent(cardAt(2), 'dragover', { clientY: geometry[2].bottom - 5, dataTransfer });
        expect(cardAt(2).classList.contains('drop-after')).toBe(true);
        expect(cardAt(2).classList.contains('drop-before')).toBe(false);
    });

    it('announces a move from the top of the list to the bottom', () => {
        drag(0, { onIndex: 2, half: 'bottom' });

        const event = observer.first(EventTypes.MOVE_ITEM_REQUESTED);
        expect(event.get('fromIndex')).toBe(0);
        expect(event.get('toIndex')).toBe(2);
    });

    it('announces a move from the bottom of the list to the top', () => {
        drag(2, { onIndex: 0, half: 'top' });

        const event = observer.first(EventTypes.MOVE_ITEM_REQUESTED);
        expect(event.get('fromIndex')).toBe(2);
        expect(event.get('toIndex')).toBe(0);
    });

    // ------------------------------------------------------------------------
    // The adjustment. Dropping the card from index 0 onto the lower half of the
    // card at index 1 means "insert at position 2" among the cards as they are
    // drawn right now. But the model pulls the dragged card out first, which
    // shifts everything after it down by one, so the destination it needs is 1.
    // Getting this wrong produces a move that is off by one in one direction
    // only, which is exactly the kind of bug that survives manual testing.
    // ------------------------------------------------------------------------
    it('accounts for the dragged card being removed before it is reinserted', () => {
        drag(0, { onIndex: 1, half: 'bottom' });
        expect(observer.first(EventTypes.MOVE_ITEM_REQUESTED).get('toIndex')).toBe(1);
    });

    it('needs no adjustment when dragging upwards', () => {
        // dragging from 2 onto the lower half of 0 inserts at 1, and since the
        // card came from below that point, nothing shifts
        drag(2, { onIndex: 0, half: 'bottom' });
        expect(observer.first(EventTypes.MOVE_ITEM_REQUESTED).get('toIndex')).toBe(1);
    });

    it('drops onto the end when let go in the space below the last card', () => {
        drag(0, { onIndex: null });
        expect(observer.first(EventTypes.MOVE_ITEM_REQUESTED).get('toIndex')).toBe(2);
    });

    it('says nothing when the card is dropped back where it started', () => {
        drag(1, { onIndex: 1, half: 'top' });
        expect(observer.count(EventTypes.MOVE_ITEM_REQUESTED)).toBe(0);
    });

    it('does not reorder anything itself', () => {
        // the view announces, the controller builds a transaction, the model
        // moves. That round trip is what makes a drag undoable.
        drag(0, { onIndex: 2, half: 'bottom' });
        expect(descriptions()).toEqual([
            'Walk Wolfie', 'Refill the kibble bin', 'Book the vet']);
    });

    it('ignores a drop that never began with a dragstart', () => {
        const dataTransfer = makeDataTransfer();
        fireDragEvent(cardAt(1), 'drop', { clientY: 50, dataTransfer });
        expect(observer.events).toEqual([]);
    });

    it('clears the landing indicator after the drop', () => {
        drag(0, { onIndex: 2, half: 'bottom' });
        expect(document.querySelector('.drop-before, .drop-after')).toBeNull();
    });
});

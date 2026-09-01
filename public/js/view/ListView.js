/**
 * ListView.js
 *
 * The screen for viewing and editing one list: a toolbar carrying undo, redo, the
 * list's name and a close button, and beneath it a scrollable container of item
 * cards that can be reordered by dragging.
 *
 * Like the HomeView this class is both a Subject and an Observer, and like the
 * HomeView it changes nothing. Dragging a card does not move anything, it
 * announces MOVE_ITEM_REQUESTED. The controller answers that by building a
 * transaction, the transaction changes the model, the model announces that it
 * changed, and only then does this view redraw. That round trip is what makes
 * every last edit undoable, including a drag.
 */
import { Subject } from '../common/Subject.js';
import { EventTypes } from '../common/EventTypes.js';
import { ItemCardPrototype } from './prototypes/ItemCardPrototype.js';

export class ListView extends Subject {
    #model;
    #section;
    #cardContainer;
    #columnHeaders;
    #emptyMessage;
    #undoButton;
    #redoButton;
    #closeButton;
    #homeButton;
    #listNameInput;
    #cardPrototype;

    // drag and drop bookkeeping
    #dragFromIndex;
    #dropTargetIndex;

    /**
     * @param {WolfieListsModel} model
     */
    constructor(model) {
        super();
        this.#model = model;

        this.#section = document.getElementById('list-view');
        this.#cardContainer = document.getElementById('item-card-container');
        this.#columnHeaders = this.#section.querySelector('.item-column-headers');
        this.#emptyMessage = document.getElementById('list-empty-message');
        this.#undoButton = document.getElementById('undo-button');
        this.#redoButton = document.getElementById('redo-button');
        this.#closeButton = document.getElementById('close-button');
        this.#homeButton = document.getElementById('home-button');
        this.#listNameInput = document.getElementById('list-name-input');

        this.#cardPrototype = new ItemCardPrototype();

        this.#dragFromIndex = -1;
        this.#dropTargetIndex = -1;

        this.#wireToolbarHandlers();
        this.#wireCardHandlers();
        this.#wireDragAndDropHandlers();
    }

    // -------------------------------------------------------------------------
    // the Observer half
    // -------------------------------------------------------------------------

    onNotify(event) {
        switch (event.type) {
            case EventTypes.CURRENT_LIST_CHANGED:
                this.render();
                break;
            case EventTypes.TRANSACTION_STACK_CHANGED:
                this.updateUndoRedoButtons(event.get('canUndo', false), event.get('canRedo', false));
                break;
            default:
                break;
        }
    }

    // -------------------------------------------------------------------------
    // drawing
    // -------------------------------------------------------------------------

    /**
     * Rebuilds the toolbar's name field and every item card.
     *
     * ITERATOR DESIGN PATTERN plus PROTOTYPE DESIGN PATTERN, exactly as on the
     * home screen. Ask the open list for an iterator, walk it, and stamp out one
     * card per item.
     */
    render() {
        const list = this.#model.getCurrentList();
        if (list === null) {
            this.#cardContainer.replaceChildren();
            return;
        }

        // Only touch the name field when it is actually out of date. Assigning to
        // value would send the caret back to the end of the text, and this method
        // runs after every single edit, so doing it needlessly would be felt.
        //
        // Note that a rename is only reported once the user has finished, on the
        // change event, so there is no danger of overwriting a half typed name
        // here. Undo and redo, on the other hand, must be able to put the old
        // name back even when the caret happens to still be sitting in the field.
        if (this.#listNameInput.value !== list.name) {
            this.#listNameInput.value = list.name;
        }

        const iterator = list.createIterator();
        const fragment = document.createDocumentFragment();

        while (iterator.hasNext()) {
            const item = iterator.next();
            fragment.appendChild(this.#cardPrototype.clone(item, iterator.index));
        }

        this.#cardContainer.replaceChildren(fragment);

        const isEmpty = list.isEmpty();
        this.#emptyMessage.classList.toggle('hidden', !isEmpty);
        this.#columnHeaders.classList.toggle('hidden', isEmpty);
        this.#cardContainer.classList.toggle('hidden', isEmpty);
    }

    /**
     * Greys out undo and redo when there is nothing to undo or redo. A disabled
     * button is a far better answer than a button that does nothing.
     */
    updateUndoRedoButtons(canUndo, canRedo) {
        this.#undoButton.disabled = !canUndo;
        this.#redoButton.disabled = !canRedo;
    }

    show() {
        this.#section.classList.remove('hidden');
        this.render();
        this.updateUndoRedoButtons(
            this.#model.hasTransactionToUndo(), this.#model.hasTransactionToRedo());
    }

    hide() {
        this.#section.classList.add('hidden');
    }

    isShowing() {
        return !this.#section.classList.contains('hidden');
    }

    /**
     * Puts the caret in the name field with the current name selected, so that
     * naming a brand new list is simply the next thing the user types.
     */
    focusNameInput() {
        this.#listNameInput.focus();
        this.#listNameInput.select();
    }

    // -------------------------------------------------------------------------
    // the Subject half
    // -------------------------------------------------------------------------

    #wireToolbarHandlers() {
        this.#undoButton.addEventListener('click', () => {
            this.notifyObservers(EventTypes.UNDO_REQUESTED);
        });

        this.#redoButton.addEventListener('click', () => {
            this.notifyObservers(EventTypes.REDO_REQUESTED);
        });

        this.#closeButton.addEventListener('click', () => {
            this.notifyObservers(EventTypes.CLOSE_LIST_REQUESTED);
        });

        // The Wolfie in the top left corner is a second way of doing exactly
        // what the close button does, so it announces the very same event rather
        // than an event of its own. That is worth being deliberate about: two
        // events meaning the same thing would need two branches in the
        // controller, and the day somebody changed one of them the other would
        // quietly keep the old behavior. One way out of a list, one place for it
        // to go wrong.
        this.#homeButton.addEventListener('click', () => {
            this.notifyObservers(EventTypes.CLOSE_LIST_REQUESTED);
        });

        // change fires once the user is finished, i.e. on Enter or on leaving the
        // field, which is exactly the granularity we want on the undo stack. One
        // transaction per rename, not one per keystroke.
        this.#listNameInput.addEventListener('change', () => {
            this.notifyObservers(EventTypes.RENAME_LIST_REQUESTED, {
                name: this.#listNameInput.value
            });
        });

        this.#listNameInput.addEventListener('keydown', (domEvent) => {
            if (domEvent.key === 'Enter') {
                domEvent.preventDefault();
                this.#listNameInput.blur();
            } else if (domEvent.key === 'Escape') {
                // put the old name back, which also means no change event fires
                const list = this.#model.getCurrentList();
                if (list !== null) this.#listNameInput.value = list.name;
                this.#listNameInput.blur();
            }
        });
    }

    #wireCardHandlers() {
        this.#cardContainer.addEventListener('click', (domEvent) => {
            this.#handleCardActivation(domEvent.target);
        });

        this.#cardContainer.addEventListener('keydown', (domEvent) => {
            if (domEvent.key !== 'Enter' && domEvent.key !== ' ') return;
            if (domEvent.target.closest('.item-card') === null) return;
            domEvent.preventDefault();
            this.#handleCardActivation(domEvent.target);
        });
    }

    /**
     * @param {EventTarget} target whatever was clicked inside the container
     */
    #handleCardActivation(target) {
        const card = target.closest('.item-card');
        if (card === null) return;

        const index = Number(card.dataset.index);
        const list = this.#model.getCurrentList();
        const item = list?.getItemAt(index);
        if (!item) return;

        const actionButton = target.closest('[data-action]');
        const action = actionButton?.dataset.action ?? 'edit-item';

        switch (action) {
            case 'duplicate-item':
                this.notifyObservers(EventTypes.DUPLICATE_ITEM_REQUESTED, { index });
                break;
            default:
                this.notifyObservers(EventTypes.EDIT_ITEM_REQUESTED, { index });
                break;
        }
    }

    // -------------------------------------------------------------------------
    // drag and drop reordering
    //
    // Four handlers, all of them on the container rather than on the cards, for
    // the same reason the click handler is: cards are replaced on every redraw.
    // -------------------------------------------------------------------------

    #wireDragAndDropHandlers() {
        this.#cardContainer.addEventListener('dragstart', (domEvent) => {
            const card = domEvent.target.closest('.item-card');
            if (card === null) return;

            this.#dragFromIndex = Number(card.dataset.index);
            card.classList.add('dragging');
            domEvent.dataTransfer.effectAllowed = 'move';
            // Firefox refuses to start a drag unless something is on the clipboard
            domEvent.dataTransfer.setData('text/plain', String(this.#dragFromIndex));
        });

        this.#cardContainer.addEventListener('dragover', (domEvent) => {
            if (this.#dragFromIndex < 0) return;

            // without this the browser will not allow a drop at all
            domEvent.preventDefault();
            domEvent.dataTransfer.dropEffect = 'move';

            this.#updateDropIndicator(domEvent);
        });

        this.#cardContainer.addEventListener('drop', (domEvent) => {
            if (this.#dragFromIndex < 0) return;
            domEvent.preventDefault();

            const fromIndex = this.#dragFromIndex;
            const toIndex = this.#dropTargetIndex;
            this.#endDrag();

            if (toIndex >= 0 && toIndex !== fromIndex) {
                this.notifyObservers(EventTypes.MOVE_ITEM_REQUESTED, { fromIndex, toIndex });
            }
        });

        // fires whether the drag ended in a drop, on the wrong place, or with the
        // Escape key, so this is where cleanup belongs
        this.#cardContainer.addEventListener('dragend', () => this.#endDrag());
    }

    /**
     * Draws the line showing where the card would land, and works out the index
     * it would land at.
     *
     * The index needs one adjustment that is easy to get wrong. Say the user
     * drags the card at index 1 and drops it below the card at index 4. The
     * insertion point among the current cards is 5, but the model first pulls the
     * dragged card out, which shifts everything after it down by one, so the
     * correct destination is 4.
     */
    #updateDropIndicator(domEvent) {
        this.#clearDropIndicators();

        const cards = [...this.#cardContainer.querySelectorAll('.item-card')];
        if (cards.length === 0) {
            this.#dropTargetIndex = -1;
            return;
        }

        const cardUnderCursor = domEvent.target.closest('.item-card');
        let insertionPoint;

        if (cardUnderCursor === null) {
            // the cursor is in the empty space below the last card
            insertionPoint = cards.length;
            cards[cards.length - 1].classList.add('drop-after');
        } else {
            const bounds = cardUnderCursor.getBoundingClientRect();
            const isBelowMidline = (domEvent.clientY - bounds.top) > (bounds.height / 2);
            const cardIndex = Number(cardUnderCursor.dataset.index);

            insertionPoint = isBelowMidline ? cardIndex + 1 : cardIndex;
            cardUnderCursor.classList.add(isBelowMidline ? 'drop-after' : 'drop-before');
        }

        // the adjustment described above
        let destination = insertionPoint;
        if (this.#dragFromIndex < destination) destination--;
        this.#dropTargetIndex = destination;
    }

    #clearDropIndicators() {
        for (const card of this.#cardContainer.querySelectorAll('.drop-before, .drop-after')) {
            card.classList.remove('drop-before', 'drop-after');
        }
    }

    #endDrag() {
        this.#clearDropIndicators();
        for (const card of this.#cardContainer.querySelectorAll('.dragging')) {
            card.classList.remove('dragging');
        }
        this.#dragFromIndex = -1;
        this.#dropTargetIndex = -1;
    }
}

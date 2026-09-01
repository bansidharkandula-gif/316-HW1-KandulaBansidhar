/**
 * HomeView.js
 *
 * The screen the user lands on: a scrollable container of cards, one per list,
 * plus the + button that makes a new one.
 *
 * This class plays both roles in the Observer pattern at once, which is normal
 * for a view and worth understanding:
 *
 *   as a Subject   it announces what the user did, i.e. OPEN_LIST_REQUESTED, and
 *                  the AppController is listening
 *   as an Observer it listens to the model, and redraws whenever the collection
 *                  of lists changes
 *
 * Notice what it does not do. It never deletes a list, it never creates one, it
 * never touches local storage. It reports and it draws, nothing more.
 *
 * EVENT DELEGATION. There is exactly one click handler on the container, not one
 * per card. Cards come and go constantly as the model changes, and a handler
 * attached to a card that gets thrown away is a handler leaked. One handler on
 * the container that never moves sidesteps the whole problem.
 */
import { Subject } from '../common/Subject.js';
import { EventTypes } from '../common/EventTypes.js';
import { ListCardPrototype } from './prototypes/ListCardPrototype.js';

export class HomeView extends Subject {
    #model;
    #section;
    #cardContainer;
    #emptyMessage;
    #addListButton;
    #cardPrototype;

    /**
     * @param {WolfieListsModel} model the model to draw
     */
    constructor(model) {
        super();
        this.#model = model;

        this.#section = document.getElementById('home-view');
        this.#cardContainer = document.getElementById('list-card-container');
        this.#emptyMessage = document.getElementById('home-empty-message');
        this.#addListButton = document.getElementById('add-list-button');

        this.#cardPrototype = new ListCardPrototype();

        this.#wireEventHandlers();
    }

    // -------------------------------------------------------------------------
    // the Observer half, i.e. reacting to the model
    // -------------------------------------------------------------------------

    /**
     * @param {UIEvent} event something the model announced
     */
    onNotify(event) {
        if (event.type === EventTypes.LISTS_CHANGED) {
            this.render();
        }
    }

    // -------------------------------------------------------------------------
    // drawing
    // -------------------------------------------------------------------------

    /**
     * Rebuilds every card on the home screen.
     *
     * ITERATOR DESIGN PATTERN. We ask the model for an iterator and walk it. This
     * method has no idea that lists happen to live in an array, and it would not
     * have to change if that stopped being true.
     *
     * PROTOTYPE DESIGN PATTERN. Each card is stamped out of the one blank card
     * held by our ListCardPrototype.
     *
     * The cards are assembled inside a document fragment and put into the page in
     * a single operation, so the browser lays the page out once rather than once
     * per card.
     */
    render() {
        const iterator = this.#model.createListIterator();
        const fragment = document.createDocumentFragment();

        // forEachRemaining walks whatever the iterator has left and hands each
        // element to us along with its position. The ListView does the same
        // traversal the long way round, with hasNext and next, so that both ways
        // of driving an iterator appear in the code somewhere.
        iterator.forEachRemaining((list, index) => {
            fragment.appendChild(this.#cardPrototype.clone(list, index));
        });

        this.#cardContainer.replaceChildren(fragment);

        const isEmpty = iterator.size() === 0;
        this.#emptyMessage.classList.toggle('hidden', !isEmpty);
        this.#cardContainer.classList.toggle('hidden', isEmpty);
    }

    show() {
        this.#section.classList.remove('hidden');
        this.render();
    }

    hide() {
        this.#section.classList.add('hidden');
    }

    isShowing() {
        return !this.#section.classList.contains('hidden');
    }

    // -------------------------------------------------------------------------
    // the Subject half, i.e. turning raw DOM events into application events
    // -------------------------------------------------------------------------

    #wireEventHandlers() {
        this.#addListButton.addEventListener('click', () => {
            this.notifyObservers(EventTypes.CREATE_LIST_REQUESTED);
        });

        this.#cardContainer.addEventListener('click', (domEvent) => {
            this.#handleCardActivation(domEvent.target, domEvent);
        });

        // a card is reachable by keyboard, so it has to be operable by keyboard
        this.#cardContainer.addEventListener('keydown', (domEvent) => {
            if (domEvent.key !== 'Enter' && domEvent.key !== ' ') return;
            const card = domEvent.target.closest('.list-card');
            if (card === null) return;
            domEvent.preventDefault();
            this.#handleCardActivation(domEvent.target, domEvent);
        });
    }

    /**
     * Works out what the user just clicked on inside the card container and
     * announces the matching request.
     *
     * @param {EventTarget} target whatever was actually clicked
     */
    #handleCardActivation(target) {
        const card = target.closest('.list-card');
        if (card === null) return;

        const listId = card.dataset.listId;
        const list = this.#model.getListById(listId);
        if (list === null) return;

        // was the button on the right pressed, or the card itself?
        const actionButton = target.closest('[data-action]');
        const action = actionButton?.dataset.action ?? 'open-list';

        switch (action) {
            case 'delete-list':
                this.notifyObservers(EventTypes.DELETE_LIST_REQUESTED, {
                    listId,
                    listName: list.name
                });
                break;
            default:
                this.notifyObservers(EventTypes.OPEN_LIST_REQUESTED, { listId });
                break;
        }
    }
}

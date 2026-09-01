/**
 * AppController.js
 *
 * The one place in the application where decisions are made.
 *
 * Every view and every modal is a Subject that announces what the user did. This
 * class is the Observer that hears all of it, and it is the only class allowed to
 * answer: it builds transactions, it asks the model to change, and it decides
 * which screen is showing. Views draw, the model remembers, the controller
 * decides. Keeping those three jobs apart is the entire reason the code is
 * arranged the way it is.
 *
 * Every event this class can receive is listed in the switch inside onNotify, so
 * that switch doubles as a table of contents for everything the application can
 * be asked to do.
 */
import { Observer } from '../common/Observer.js';
import { EventTypes } from '../common/EventTypes.js';
import { WolfieList } from '../model/WolfieList.js';
import { Modal } from '../view/modals/Modal.js';
import { ItemModal } from '../view/modals/ItemModal.js';

import { DuplicateItem_Transaction } from '../transactions/DuplicateItem_Transaction.js';
import { EditItem_Transaction } from '../transactions/EditItem_Transaction.js';
import { MoveItem_Transaction } from '../transactions/MoveItem_Transaction.js';
import { RenameList_Transaction } from '../transactions/RenameList_Transaction.js';

export class AppController extends Observer {
    #model;
    #homeView;
    #listView;
    #itemModal;
    #confirmModal;
    #alertModal;

    /**
     * @param {WolfieListsModel} model
     * @param {HomeView} homeView
     * @param {ListView} listView
     * @param {ItemModal} itemModal
     * @param {ConfirmModal} confirmModal
     * @param {AlertModal} alertModal
     */
    constructor(model, homeView, listView, itemModal, confirmModal, alertModal) {
        super();
        this.#model = model;
        this.#homeView = homeView;
        this.#listView = listView;
        this.#itemModal = itemModal;
        this.#confirmModal = confirmModal;
        this.#alertModal = alertModal;
    }

    /**
     * Subscribes everybody to everybody, puts the home screen up, and loads the
     * lists. Note the order: all of the subscriptions are in place before the
     * model loads, otherwise the LISTS_CHANGED that loading sends out would
     * arrive before anyone was listening for it.
     *
     * The home screen goes up before the loading rather than after, so that the
     * header is on screen while the example lists are being fetched on a first
     * visit, instead of the user staring at a blank white page.
     *
     * @return {Promise<void>} resolved once the lists are on screen
     */
    async start() {
        // the controller listens to every view and every modal
        this.#homeView.subscribe(this);
        this.#listView.subscribe(this);
        this.#itemModal.subscribe(this);
        this.#confirmModal.subscribe(this);
        this.#alertModal.subscribe(this);

        // the views listen to the model so that they redraw themselves, and the
        // controller listens too, so that it can report storage problems
        this.#model.subscribe(this.#homeView);
        this.#model.subscribe(this.#listView);
        this.#model.subscribe(this);

        this.#installKeyboardShortcuts();

        this.#showHomeView();
        await this.#model.load();
    }

    /**
     * Everything the user can ask for arrives here.
     *
     * @param {UIEvent} event
     */
    onNotify(event) {
        switch (event.type) {
            // ---------- the home screen ----------
            case EventTypes.CREATE_LIST_REQUESTED:
                this.#handleCreateList();
                break;
            case EventTypes.OPEN_LIST_REQUESTED:
                this.#openList(event.get('listId'));
                break;
            case EventTypes.DELETE_LIST_REQUESTED:
                this.#confirmDeleteList(event.get('listId'), event.get('listName'));
                break;

            // ---------- the list screen ----------
            case EventTypes.UNDO_REQUESTED:
                this.#model.undo();
                break;
            case EventTypes.REDO_REQUESTED:
                this.#model.redo();
                break;
            case EventTypes.CLOSE_LIST_REQUESTED:
                this.#model.closeCurrentList();
                this.#showHomeView();
                break;
            case EventTypes.RENAME_LIST_REQUESTED:
                this.#handleRenameList(event.get('name'));
                break;
            case EventTypes.EDIT_ITEM_REQUESTED:
                this.#itemModal.openForItem(this.#model.getCurrentList(), event.get('index'));
                break;
            case EventTypes.DUPLICATE_ITEM_REQUESTED:
                this.#model.addTransaction(
                    new DuplicateItem_Transaction(this.#model, event.get('index')));
                break;
            case EventTypes.MOVE_ITEM_REQUESTED:
                this.#model.addTransaction(new MoveItem_Transaction(
                    this.#model, event.get('fromIndex'), event.get('toIndex')));
                break;

            // ---------- the item modal ----------
            case EventTypes.ITEM_MODAL_COMMIT:
                this.#handleItemCommit(event);
                break;
            case EventTypes.ITEM_MODAL_CANCELLED:
                // nothing to do, the modal has already closed itself and the model
                // was never touched, which is exactly what cancel should mean
                break;
            case EventTypes.ITEM_MODAL_INVALID:
                this.#alertModal.inform({
                    title: event.get('title'),
                    message: event.get('message')
                });
                break;

            // ---------- the warning modal ----------
            case EventTypes.CONFIRM_ACCEPTED:
                this.#handleConfirmAccepted(event.get('context', {}));
                break;
            case EventTypes.CONFIRM_DECLINED:
            case EventTypes.ALERT_DISMISSED:
                break;

            // ---------- the model ----------
            // The controller subscribes to the model only so that it can report a
            // storage problem. Redrawing after these three is the views' business,
            // not ours, but they are listed so that the default case below stays
            // what it is meant to be: a report of an event nobody expected.
            case EventTypes.LISTS_CHANGED:
            case EventTypes.CURRENT_LIST_CHANGED:
            case EventTypes.TRANSACTION_STACK_CHANGED:
                break;

            case EventTypes.STORAGE_FAILED:
            case EventTypes.STARTER_LISTS_FAILED:
                this.#alertModal.inform({
                    title: event.get('title', 'Storage Problem'),
                    message: event.get('message', '')
                });
                break;

            default:
                // an event nobody handles is almost always a typo in an event name
                console.warn('AppController received an event it does not handle:', event.toString());
                break;
        }
    }

    // -------------------------------------------------------------------------
    // moving between the two screens
    // -------------------------------------------------------------------------

    #showHomeView() {
        this.#listView.hide();
        this.#homeView.show();
    }

    /**
     * @param {string} listId the list to open
     */
    #openList(listId) {
        const list = this.#model.openList(listId);
        if (list === null) return;
        this.#homeView.hide();
        this.#listView.show();
    }

    // -------------------------------------------------------------------------
    // handling the requests that need more than one line
    // -------------------------------------------------------------------------

    /**
     * A brand new list opens straight away with its name selected, so that naming
     * it is simply the next thing the user types.
     */
    #handleCreateList() {
        const list = this.#model.createNewList();
        this.#openList(list.id);
        this.#listView.focusNameInput();
    }

    /**
     * Renaming the open list is an edit made inside that list, so it goes on the
     * undo stack like every other edit. We work out what the name would actually
     * become first, and do nothing at all if that is what it already is.
     *
     * @param {string} requestedName whatever is in the toolbar's name field
     */
    #handleRenameList(requestedName) {
        const list = this.#model.getCurrentList();
        if (list === null) return;

        const newName = WolfieList.normalizeName(requestedName);
        if (newName === list.name) return;

        this.#model.addTransaction(new RenameList_Transaction(this.#model, list.name, newName));
    }

    /**
     * @param {UIEvent} event an ITEM_MODAL_COMMIT
     */
    #handleItemCommit(event) {
        const index = event.get('index');
        const values = event.get('values');
        const then = event.get('then', 'close');

        const list = this.#model.getCurrentList();
        if (list === null) {
            this.#itemModal.hide();
            return;
        }

        // record the edit, unless nothing actually changed
        const item = list.getItemAt(index);
        if (item === null) {
            this.#itemModal.hide();
            return;
        }

        const oldValues = item.getValues();
        if (!EditItem_Transaction.valuesAreEqual(oldValues, values)) {
            this.#model.addTransaction(
                new EditItem_Transaction(this.#model, index, oldValues, values));
        }

        // Next keeps the modal open and moves it onto the following item
        if (then === 'next') {
            this.#itemModal.openForItem(list, index + 1);
        } else {
            this.#itemModal.hide();
        }
    }

    #confirmDeleteList(listId, listName) {
        this.#confirmModal.ask({
            title: 'Delete This List?',
            message: `The list named "${listName}" and everything in it will be permanently deleted. Deleting a list cannot be undone.`,
            acceptLabel: 'Delete List',
            context: { action: 'delete-list', listId }
        });
    }

    /**
     * The warning modal has come back with a yes. What that yes meant is in the
     * context object we handed the modal when we asked the question.
     *
     * @param {Object} context
     */
    #handleConfirmAccepted(context) {
        switch (context.action) {
            case 'delete-list':
                this.#model.deleteList(context.listId);
                break;
            default:
                console.warn('AppController was confirmed for an unknown action:', context);
                break;
        }
    }

    // -------------------------------------------------------------------------
    // keyboard shortcuts
    // -------------------------------------------------------------------------

    /**
     * Ctrl+Z and Ctrl+Y drive the transaction stack while a list is open.
     *
     * Two things are deliberately excluded. Nothing happens while a modal is up,
     * because the topmost modal owns the keyboard. And nothing happens while the
     * caret is in a text field, because there Ctrl+Z belongs to the browser and
     * means undo my typing.
     */
    #installKeyboardShortcuts() {
        document.addEventListener('keydown', (domEvent) => {
            if (!(domEvent.ctrlKey || domEvent.metaKey)) return;
            if (Modal.isAnyOpen()) return;
            if (!this.#listView.isShowing()) return;

            const tagName = document.activeElement?.tagName;
            if (tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'TEXTAREA') return;

            const key = domEvent.key.toLowerCase();
            if (key === 'z' && !domEvent.shiftKey) {
                domEvent.preventDefault();
                this.#model.undo();
            } else if (key === 'y' || (key === 'z' && domEvent.shiftKey)) {
                domEvent.preventDefault();
                this.#model.redo();
            }
        });
    }
}

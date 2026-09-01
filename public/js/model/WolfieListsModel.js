/**
 * WolfieListsModel.js
 *
 * The model for the whole application: every list the user owns, which list is
 * currently open, and the transaction stack that makes editing that list undoable.
 *
 * The model is a Subject. Whenever anything about it changes it announces that
 * fact and the views redraw themselves. It never touches the DOM, and it never
 * imports anything out of the view folder. Read the imports at the top of this
 * file and you will see the dependency arrow only ever points one way.
 *
 * Where the pieces meet:
 *   - the DataStorageManager singleton is asked to save after every change
 *   - the jsTPS holds the undo/redo stack for the list that is currently open
 *   - the transactions in the transactions folder are the only things that call
 *     the item level methods down at the bottom of this file
 */
import { Subject } from '../common/Subject.js';
import { EventTypes } from '../common/EventTypes.js';
import { DataStorageManager, StorageError } from '../data/DataStorageManager.js';
import { WolfieList } from './WolfieList.js';
import { WolfieListIterator } from './WolfieListIterator.js';
import { jsTPS } from '../../lib/jsTPS.js';

export class WolfieListsModel extends Subject {
    #lists;
    #currentList;
    #tps;

    constructor() {
        super();
        this.#lists = [];
        this.#currentList = null;
        this.#tps = new jsTPS();
    }

    /**
     * The one DataStorageManager, asked for afresh at every use rather than kept
     * in a field of this model.
     *
     * That is the point of a Singleton: getInstance() is already the single
     * source of the single instance, so holding a second reference to it here
     * would add a way for the model to be looking at a different object than the
     * rest of the application, and would outlive anything that ever replaced it.
     * Asking each time costs a property read.
     *
     * @return {DataStorageManager}
     */
    static #storage() {
        return DataStorageManager.getInstance();
    }

    // -------------------------------------------------------------------------
    // startup
    // -------------------------------------------------------------------------

    /**
     * Loads whatever was saved during a previous visit, or, on a browser that has
     * never run this application before, the example lists that ship with it.
     *
     * Nothing in here is allowed to be fatal. Local storage may be switched off,
     * the saved data may be unreadable, the example file may be missing. Each of
     * those is announced and then worked around, because a to-do list that
     * refuses to start is worse than one that starts empty.
     *
     * @return {Promise<void>} resolved once the home screen has its lists
     */
    async load() {
        // certain browsers, in certain privacy modes, define local storage and
        // then throw the moment it is used. Better to say so plainly at startup
        // than to let every single save fail one at a time.
        if (!WolfieListsModel.#storage().isAvailable()) {
            this.notifyObservers(EventTypes.STORAGE_FAILED, {
                title: 'Nothing Can Be Saved',
                message: 'This browser is not allowing Wolfie Lists to use local storage, which may be because it is in a private browsing mode. You can still work, but nothing will be here when you come back.'
            });
            this.notifyObservers(EventTypes.LISTS_CHANGED, { lists: this.#lists });
            return;
        }

        // ask before reading, because reading unreadable data clears it away
        const isFirstEverVisit = !WolfieListsModel.#storage().hasSavedData();

        try {
            this.#lists = WolfieListsModel.#storage().loadLists();
        } catch (error) {
            this.#lists = [];
            this.notifyObservers(EventTypes.STORAGE_FAILED, {
                title: 'Saved Lists Could Not Be Loaded',
                message: error.message
            });
        }

        if (isFirstEverVisit) {
            await this.#loadStarterLists();
        }

        this.notifyObservers(EventTypes.LISTS_CHANGED, { lists: this.#lists });
    }

    /**
     * Fills a brand new home screen with the example lists, and saves them, so
     * that from the user's point of view they are simply lists they own like any
     * other: they can be renamed, edited and deleted, and once deleted they stay
     * deleted rather than coming back on the next visit.
     */
    async #loadStarterLists() {
        try {
            this.#lists = await WolfieListsModel.#storage().loadStarterLists();
            this.#save();
        } catch (error) {
            this.#lists = [];
            this.notifyObservers(EventTypes.STARTER_LISTS_FAILED, {
                title: 'Example Lists Could Not Be Loaded',
                message: `Wolfie Lists could not read its example lists, so it has started empty. Press the + button to make a list of your own. (${error.message})`
            });
        }
    }

    // -------------------------------------------------------------------------
    // reading
    // -------------------------------------------------------------------------

    getLists() {
        return this.#lists;
    }

    /**
     * ITERATOR DESIGN PATTERN. The HomeView walks the lists with this and never
     * sees the underlying array.
     *
     * @return {WolfieListIterator}
     */
    createListIterator() {
        return new WolfieListIterator(this.#lists);
    }

    getListById(listId) {
        return this.#lists.find((list) => list.id === listId) ?? null;
    }

    getCurrentList() {
        return this.#currentList;
    }

    hasCurrentList() {
        return this.#currentList !== null;
    }

    hasTransactionToUndo() {
        return this.#tps.hasTransactionToUndo();
    }

    hasTransactionToRedo() {
        return this.#tps.hasTransactionToRedo();
    }

    // -------------------------------------------------------------------------
    // operations on the collection of lists. note that creating, duplicating and
    // deleting a whole list are NOT transactions, since the specification asks
    // for undo/redo of the edits made while inside a list
    // -------------------------------------------------------------------------

    /**
     * Makes a brand new empty list with a name that is not already taken.
     *
     * @return {WolfieList} the new list
     */
    createNewList() {
        const newList = new WolfieList({ name: this.#buildUnusedName(WolfieList.DEFAULT_NAME) });
        this.#lists.push(newList);
        this.#saveAndAnnounceLists();
        return newList;
    }

    /**
     * PROTOTYPE DESIGN PATTERN. The list clones itself, we simply file the copy
     * away directly beneath the original.
     *
     * @param {string} listId the list to copy
     * @return {WolfieList|null} the copy
     */
    /**
     * @param {string} listId the list to throw away
     * @return {boolean} true if a list was actually removed
     */
    deleteList(listId) {
        const index = this.#lists.findIndex((list) => list.id === listId);
        if (index < 0) return false;

        this.#lists.splice(index, 1);

        // deleting the list you are looking at also closes it
        if (this.#currentList !== null && this.#currentList.id === listId) {
            this.closeCurrentList();
        }
        this.#saveAndAnnounceLists();
        return true;
    }

    /**
     * Opens a list for editing. The transaction stack is emptied first, since
     * undo must never reach back across a list boundary and start undoing edits
     * made to some other list.
     *
     * @param {string} listId
     * @return {WolfieList|null} the list that was opened
     */
    openList(listId) {
        const list = this.getListById(listId);
        if (list === null) return null;

        this.#currentList = list;
        this.#tps.clearAllTransactions();
        this.notifyObservers(EventTypes.CURRENT_LIST_CHANGED, { list });
        this.#announceTransactionStack();
        return list;
    }

    /**
     * Closes whatever list is open and forgets its undo history.
     */
    closeCurrentList() {
        this.#currentList = null;
        this.#tps.clearAllTransactions();
        this.notifyObservers(EventTypes.CURRENT_LIST_CHANGED, { list: null });
        this.#announceTransactionStack();
    }

    // -------------------------------------------------------------------------
    // undo and redo
    // -------------------------------------------------------------------------

    /**
     * Runs a transaction and files it on the stack so that it can be undone. This
     * is the only door through which an edit to an open list may enter the model.
     *
     * @param {jsTPS_Transaction} transaction
     */
    addTransaction(transaction) {
        this.#tps.addTransaction(transaction);
        this.#announceTransactionStack();
    }

    undo() {
        if (!this.#tps.hasTransactionToUndo()) return;
        this.#tps.undoTransaction();
        this.#announceTransactionStack();
    }

    redo() {
        if (!this.#tps.hasTransactionToRedo()) return;
        this.#tps.doTransaction();
        this.#announceTransactionStack();
    }

    // -------------------------------------------------------------------------
    // operations on the open list. every one of these is called from inside a
    // transaction, never straight from a view, which is exactly what makes all of
    // them undoable
    // -------------------------------------------------------------------------

    /**
     * @param {ListItem} item
     * @param {number} index where to insert, defaulting to the end
     */
    addItemToCurrentList(item, index = undefined) {
        if (this.#currentList === null) return;
        this.#currentList.addItem(item, index ?? this.#currentList.size());
        this.#saveAndAnnounceCurrentList();
    }

    /**
     * @param {number} index
     * @return {ListItem|null} the item that was removed, which the delete
     * transaction hangs onto so that undo can put it back
     */
    removeItemFromCurrentList(index) {
        if (this.#currentList === null) return null;
        const removed = this.#currentList.removeItemAt(index);
        if (removed !== null) this.#saveAndAnnounceCurrentList();
        return removed;
    }

    /**
     * @param {number} index which item to change
     * @param {Object} values the new description, dateEntered, priority,
     * targetDate and completed
     */
    updateItemInCurrentList(index, values) {
        if (this.#currentList === null) return;
        const item = this.#currentList.getItemAt(index);
        if (item === null) return;
        item.applyValues(values);
        this.#saveAndAnnounceCurrentList();
    }

    /**
     * @param {number} fromIndex
     * @param {number} toIndex
     */
    moveItemInCurrentList(fromIndex, toIndex) {
        if (this.#currentList === null) return;
        if (this.#currentList.moveItem(fromIndex, toIndex)) {
            this.#saveAndAnnounceCurrentList();
        }
    }

    /**
     * @param {string} name the open list's new name
     */
    renameCurrentList(name) {
        if (this.#currentList === null) return;
        this.#currentList.setName(name);
        this.#saveAndAnnounceCurrentList();
        // the home screen shows list names too, so it needs to hear about this
        this.notifyObservers(EventTypes.LISTS_CHANGED, { lists: this.#lists });
    }

    // -------------------------------------------------------------------------
    // private helpers
    // -------------------------------------------------------------------------

    /**
     * Saves, then tells everyone the collection of lists changed.
     */
    #saveAndAnnounceLists() {
        this.#save();
        this.notifyObservers(EventTypes.LISTS_CHANGED, { lists: this.#lists });
    }

    /**
     * Saves, then tells everyone the open list changed.
     */
    #saveAndAnnounceCurrentList() {
        this.#save();
        this.notifyObservers(EventTypes.CURRENT_LIST_CHANGED, { list: this.#currentList });
    }

    #announceTransactionStack() {
        this.notifyObservers(EventTypes.TRANSACTION_STACK_CHANGED, {
            canUndo: this.#tps.hasTransactionToUndo(),
            canRedo: this.#tps.hasTransactionToRedo()
        });
    }

    /**
     * Every change is written straight through to local storage. If that write
     * fails the change still stands in memory, but the user is told that it did
     * not make it to disk.
     */
    #save() {
        try {
            WolfieListsModel.#storage().saveLists(this.#lists);
        } catch (error) {
            if (!(error instanceof StorageError)) throw error;
            this.notifyObservers(EventTypes.STORAGE_FAILED, {
                title: 'Changes Were Not Saved',
                message: error.message
            });
        }
    }

    /**
     * Turns "Untitled List" into "Untitled List 2" when "Untitled List" is
     * already taken, then into "Untitled List 3", and so on.
     *
     * @param {string} desiredName
     * @return {string} a name no existing list is using
     */
    #buildUnusedName(desiredName) {
        const taken = new Set(this.#lists.map((list) => list.name));
        if (!taken.has(desiredName)) return desiredName;

        let counter = 2;
        while (taken.has(`${desiredName} ${counter}`)) counter++;
        return `${desiredName} ${counter}`;
    }
}

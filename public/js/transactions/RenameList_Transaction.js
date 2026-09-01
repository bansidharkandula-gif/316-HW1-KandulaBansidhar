/**
 * RenameList_Transaction.js
 *
 * Records a change to the open list's name. Renaming a list is an edit made from
 * inside the list view, so like every other edit made there it belongs on the
 * undo stack.
 */
import { jsTPS_Transaction } from '../../lib/jsTPS.js';

export class RenameList_Transaction extends jsTPS_Transaction {
    #model;
    #oldName;
    #newName;

    /**
     * @param {WolfieListsModel} model
     * @param {string} oldName the name before the edit
     * @param {string} newName the name after the edit
     */
    constructor(model, oldName, newName) {
        super();
        this.#model = model;
        this.#oldName = oldName;
        this.#newName = newName;
    }

    doTransaction() {
        this.#model.renameCurrentList(this.#newName);
    }

    undoTransaction() {
        this.#model.renameCurrentList(this.#oldName);
    }

    toString() {
        return `RenameList_Transaction(${this.#oldName} to ${this.#newName})`;
    }
}

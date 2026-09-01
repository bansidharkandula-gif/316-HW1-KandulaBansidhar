/**
 * DuplicateItem_Transaction.js
 *
 * Copies one item and drops the copy in directly beneath the original.
 *
 * PROTOTYPE DESIGN PATTERN. This transaction never builds a ListItem itself, it
 * asks the item being duplicated to clone itself. The copy is made once, on the
 * first doTransaction, and then reused on every redo so that the duplicate keeps
 * one stable id no matter how much undoing and redoing happens.
 */
import { jsTPS_Transaction } from '../../lib/jsTPS.js';

export class DuplicateItem_Transaction extends jsTPS_Transaction {
    #model;
    #index;
    #copy;

    /**
     * @param {WolfieListsModel} model
     * @param {number} index which item to duplicate
     */
    constructor(model, index) {
        super();
        this.#model = model;
        this.#index = index;
        this.#copy = null;
    }

    doTransaction() {
        if (this.#copy === null) {
            const original = this.#model.getCurrentList()?.getItemAt(this.#index);
            if (!original) return;
            this.#copy = original.clone();
        }
        this.#model.addItemToCurrentList(this.#copy, this.#index + 1);
    }

    undoTransaction() {
        this.#model.removeItemFromCurrentList(this.#index + 1);
    }

    toString() {
        return `DuplicateItem_Transaction(index ${this.#index})`;
    }
}

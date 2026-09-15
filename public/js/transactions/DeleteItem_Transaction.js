// @vitest-environment jsdom

import { jsTPS_Transaction } from '../../lib/jsTPS.js';

export class DeleteItem_Transaction extends jsTPS_Transaction {
    #model;
    #index;
    #removedItem;

    /**
     * @param {WolfieListsModel} model
     * @param {number} index which item to delete
     */
    constructor(model, index) {
        super();
        this.#model = model;
        this.#index = index;
        this.#removedItem = null;
    }

    doTransaction() {
        const removed = this.#model.removeItemFromCurrentList(this.#index);
        if (removed !== null) this.#removedItem = removed;
    }

    undoTransaction() {
        if (this.#removedItem === null) return;
        this.#model.addItemToCurrentList(this.#removedItem, this.#index);
    }

    toString() {
        return `DeleteItem_Transaction(index ${this.#index})`;
    }
}
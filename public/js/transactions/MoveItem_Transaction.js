/**
 * MoveItem_Transaction.js
 *
 * Records one drag and drop reordering.
 *
 * This is the shortest transaction in the application because the model's
 * moveItem is its own inverse: pulling an item out of position 5 and inserting it
 * at position 2 is undone by pulling it out of position 2 and inserting it back
 * at position 5.
 */
import { jsTPS_Transaction } from '../../lib/jsTPS.js';

export class MoveItem_Transaction extends jsTPS_Transaction {
    #model;
    #fromIndex;
    #toIndex;

    /**
     * @param {WolfieListsModel} model
     * @param {number} fromIndex where the item was picked up
     * @param {number} toIndex where it was dropped
     */
    constructor(model, fromIndex, toIndex) {
        super();
        this.#model = model;
        this.#fromIndex = fromIndex;
        this.#toIndex = toIndex;
    }

    doTransaction() {
        this.#model.moveItemInCurrentList(this.#fromIndex, this.#toIndex);
    }

    undoTransaction() {
        this.#model.moveItemInCurrentList(this.#toIndex, this.#fromIndex);
    }

    toString() {
        return `MoveItem_Transaction(${this.#fromIndex} to ${this.#toIndex})`;
    }
}

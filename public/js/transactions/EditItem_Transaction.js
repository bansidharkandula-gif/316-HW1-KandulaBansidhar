/**
 * EditItem_Transaction.js
 *
 * Records one trip through the item modal: the values the item had before OK was
 * pressed, and the values it has after.
 *
 * Both snapshots are plain objects taken with ListItem.getValues(), never
 * references to the item itself. If we stored the item, then "before" and "after"
 * would be the same object and undo would have nothing to restore.
 */
import { jsTPS_Transaction } from '../../lib/jsTPS.js';

export class EditItem_Transaction extends jsTPS_Transaction {
    #model;
    #index;
    #oldValues;
    #newValues;

    /**
     * @param {WolfieListsModel} model
     * @param {number} index which item was edited
     * @param {Object} oldValues its values before the edit
     * @param {Object} newValues its values after the edit
     */
    constructor(model, index, oldValues, newValues) {
        super();
        this.#model = model;
        this.#index = index;
        this.#oldValues = { ...oldValues };
        this.#newValues = { ...newValues };
    }

    doTransaction() {
        this.#model.updateItemInCurrentList(this.#index, this.#newValues);
    }

    undoTransaction() {
        this.#model.updateItemInCurrentList(this.#index, this.#oldValues);
    }

    /**
     * Lets the controller skip building a transaction at all when the user opened
     * the modal, changed nothing, and pressed OK.
     *
     * @param {Object} oldValues
     * @param {Object} newValues
     * @return {boolean} true if the two snapshots are identical
     */
    static valuesAreEqual(oldValues, newValues) {
        return oldValues.description === newValues.description
            && oldValues.dateEntered === newValues.dateEntered
            && oldValues.priority === newValues.priority
            && oldValues.targetDate === newValues.targetDate
            && oldValues.completed === newValues.completed;
    }

    toString() {
        return `EditItem_Transaction(index ${this.#index})`;
    }
}

// @vitest-environment jsdom

import { jsTPS_Transaction } from '../../lib/jsTPS.js';
import { ListItem } from '../model/ListItem.js';

export class AddItem_Transaction extends jsTPS_Transaction {
    #model;
    #item;
    #index;

    constructor(model, item, index) {
        super();
        this.#model = model;
        this.#index = index;
        this.#item = item;
    }

    doTransaction() {
        this.#model.addItemToCurrentList(this.#item, this.#index);
    }

    undoTransaction() {
        const list = this.#model.getCurrentList();
        if (list === null) return;

        const index = list.items.findIndex((item) => item.id === this.#item.id);
        if (index >= 0) this.#model.removeItemFromCurrentList(index);
    }

    toString() {
        return `AddItem_Transaction(index ${this.#index})`;
    }
}
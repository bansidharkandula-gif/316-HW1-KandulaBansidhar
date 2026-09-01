/**
 * WolfieListIterator.js
 *
 * An Iterator over every list the user owns. This is the one the HomeView uses to
 * build the cards on the home screen. It is a separate class from
 * ListItemIterator because the two walk different collections, but both obey the
 * same Iterator contract, which is precisely why both views can be written the
 * same way.
 */
import { Iterator } from '../common/Iterator.js';

export class WolfieListIterator extends Iterator {
    #lists;
    #cursor;
    #indexOfLastReturned;

    /**
     * @param {WolfieList[]} lists the lists to walk, in the order they should
     * appear on screen
     */
    constructor(lists) {
        super();
        this.#lists = lists ?? [];
        this.reset();
    }

    hasNext() {
        return this.#cursor < this.#lists.length;
    }

    /**
     * @return {WolfieList} the next list
     */
    next() {
        if (!this.hasNext()) {
            throw new RangeError('WolfieListIterator has no more lists');
        }
        const list = this.#lists[this.#cursor];
        this.#indexOfLastReturned = this.#cursor;
        this.#cursor++;
        return list;
    }

    /**
     * @return {number} the position of the list next() most recently returned
     */
    get index() {
        return this.#indexOfLastReturned;
    }

    reset() {
        this.#cursor = 0;
        this.#indexOfLastReturned = -1;
    }

    size() {
        return this.#lists.length;
    }
}

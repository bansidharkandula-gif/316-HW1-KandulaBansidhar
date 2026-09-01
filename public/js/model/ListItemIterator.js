/**
 * ListItemIterator.js
 *
 * An Iterator over the items inside a single WolfieList. This is what the
 * ListView uses to walk a list when it renders it into the DOM, so the view has
 * no idea whether a list stores its items in an array, a linked list, or
 * somewhere else entirely.
 *
 * Because Iterator implements Symbol.iterator, this also works with for...of:
 *
 *     for (const item of list.createIterator()) { ... }
 *
 * ---------------------------------------------------------------------------
 * YOU HAVE TO WRITE THIS ONE. As it stands hasNext() always answers false, so a
 * list renders as empty however many items it holds.
 *
 * WolfieListIterator, beside this file, is the finished version of the same idea
 * for the collection of lists. Read it first.
 * ---------------------------------------------------------------------------
 */
import { Iterator } from '../common/Iterator.js';

export class ListItemIterator extends Iterator {
    /**
     * @param {WolfieList} list the list to walk
     */
    constructor(list) {
        super();
    }

    /**
     * @return {boolean} true while there is another item to hand out
     */
    hasNext() {
        return false;
    }

    /**
     * @return {ListItem} the next item in the list
     * @throws {RangeError} if there is no next item
     */
    next() {
        return null;
    }

    /**
     * Puts the iterator back at the first item.
     */
    reset() {
    }
}

/**
 * WolfieList.js
 *
 * A single named to-do list, i.e. a name plus an ordered collection of ListItems.
 *
 * This class knows how to change itself, but it does not know anything about the
 * screen, about local storage, or about undo. Those belong to the view, to the
 * DataStorageManager, and to the transactions respectively. Keeping the model
 * ignorant of all three is what lets us reuse it unchanged when the user
 * interface is rewritten.
 *
 * ENCAPSULATION
 * -------------
 * All three fields are private. The name changes only through setName(), which
 * normalizes it, and the items change only through addItem, removeItemAt and
 * moveItem, every one of which is called from inside a transaction so that every
 * change to a list is undoable. The items getter hands back a copy of the array
 * for exactly that reason: reading a list must never be a way of rearranging one.
 *
 * As with ListItem, JSON.stringify cannot see private fields, so toJSON() at the
 * bottom is what a saved list actually looks like. See the note there.
 */
import { IdGenerator } from '../common/IdGenerator.js';
import { ListItem } from './ListItem.js';
import { ListItemIterator } from './ListItemIterator.js';

export class WolfieList {
    static DEFAULT_NAME = 'Untitled List';
    static MAX_NAME_LENGTH = 60;

    #id;
    #name;
    #items;

    /**
     * @param {Object} initialValues
     */
    constructor({
        id = IdGenerator.next('list'),
        name = WolfieList.DEFAULT_NAME,
        items = []
    } = {}) {
        this.#id = id;
        this.#name = name;
        this.#items = items.map((item) =>
            item instanceof ListItem ? item : ListItem.fromJSON(item));
    }

    // -------------------------------------------------------------------------
    // reading
    // -------------------------------------------------------------------------

    get id() { return this.#id; }
    get name() { return this.#name; }

    /**
     * @return {ListItem[]} a COPY of the array, holding the real items. Splicing
     * what comes back rearranges nothing: use addItem, removeItemAt and moveItem,
     * which is what makes every rearrangement undoable.
     */
    get items() { return [...this.#items]; }

    size() {
        return this.#items.length;
    }

    isEmpty() {
        return this.#items.length === 0;
    }

    /**
     * @param {number} index
     * @return {ListItem|null} the item at that index, or null if out of bounds
     */
    getItemAt(index) {
        return (index >= 0 && index < this.#items.length) ? this.#items[index] : null;
    }

    /**
     * ITERATOR DESIGN PATTERN
     *
     * Hands back a fresh iterator positioned at the first item. This is the only
     * way any other class should walk a list.
     *
     * @return {ListItemIterator}
     */
    createIterator() {
        return new ListItemIterator(this);
    }

    // -------------------------------------------------------------------------
    // writing. every one of these is called from inside a transaction, never
    // directly from a view, which is what makes all of them undoable
    // -------------------------------------------------------------------------

    /**
     * @param {ListItem} item
     * @param {number} index where to put it, defaulting to the end
     */
    addItem(item, index = this.#items.length) {
        const safeIndex = Math.max(0, Math.min(index, this.#items.length));
        this.#items.splice(safeIndex, 0, item);
    }

    /**
     * @param {number} index
     * @return {ListItem|null} whatever was removed, so a transaction can put it
     * back later
     */
    removeItemAt(index) {
        if (index < 0 || index >= this.#items.length) return null;
        return this.#items.splice(index, 1)[0];
    }

    /**
     * Pulls the item out of fromIndex and drops it back in at toIndex. Note that
     * the perfect inverse of moveItem(from, to) is moveItem(to, from), which is
     * exactly what makes the drag and drop transaction so short.
     *
     * @param {number} fromIndex
     * @param {number} toIndex
     * @return {boolean} true if anything actually moved
     */
    moveItem(fromIndex, toIndex) {
        if (fromIndex === toIndex) return false;
        if (fromIndex < 0 || fromIndex >= this.#items.length) return false;
        if (toIndex < 0 || toIndex >= this.#items.length) return false;
        const [moved] = this.#items.splice(fromIndex, 1);
        this.#items.splice(toIndex, 0, moved);
        return true;
    }

    /**
     * @param {string} name the list's new name
     */
    setName(name) {
        this.#name = WolfieList.normalizeName(name);
    }

    /**
     * Turns whatever the user typed into a name a list may actually have: no
     * surrounding whitespace, no longer than the limit, and never empty.
     *
     * This is a static so that the controller can ask what a name would become
     * before deciding whether a rename is even worth putting on the undo stack.
     *
     * @param {string} name
     * @return {string}
     */
    static normalizeName(name) {
        const trimmed = String(name ?? '').trim();
        return (trimmed.length === 0)
            ? WolfieList.DEFAULT_NAME
            : trimmed.slice(0, WolfieList.MAX_NAME_LENGTH);
    }

    // -------------------------------------------------------------------------
    // prototype pattern and serialization
    // -------------------------------------------------------------------------

    /**
     * PROTOTYPE DESIGN PATTERN
     *
     * Produces a deep copy of this whole list, new ids and all, which is what the
     * duplicate button on the home screen uses. Notice that the list does not
     * copy its items itself, it asks each item to clone itself, so if ListItem
     * ever grows a new field this method still does the right thing.
     *
     * @param {string} newName what to call the copy
     * @return {WolfieList} the copy
     */
    clone(newName = `${this.#name} (Copy)`) {
        return new WolfieList({
            id: IdGenerator.next('list'),
            name: newName.slice(0, WolfieList.MAX_NAME_LENGTH),
            items: this.#items.map((item) => item.clone())
        });
    }

    /**
     * What JSON.stringify writes when a list is saved.
     *
     * Without this the private fields above would be invisible to it and every
     * saved list would be written as {}. Each ListItem inside carries a toJSON of
     * its own, which stringify calls in turn.
     *
     * @return {Object}
     */
    toJSON() {
        return { id: this.#id, name: this.#name, items: this.#items };
    }

    /**
     * @param {Object} json an object that came back out of local storage
     * @return {WolfieList}
     */
    static fromJSON(json) {
        return new WolfieList(json ?? {});
    }

    toString() {
        return `WolfieList(${this.#name}, ${this.size()} items)`;
    }
}

/**
 * ListItem.js
 *
 * One row inside a Wolfie List: what has to be done, and the day it was entered.
 *
 * PROTOTYPE DESIGN PATTERN
 * ------------------------
 * This class carries a clone() method. Rather than a caller having to know which
 * fields a ListItem has in order to copy one, it asks an existing item to produce
 * a copy of itself. That existing item is the prototype. This is what the
 * duplicate button on every item card uses, and it is also how the item modal
 * takes a snapshot of an item before editing so that the edit can be undone.
 *
 * ENCAPSULATION, AND THE ONE PROBLEM IT CAUSES HERE
 * -------------------------------------------------
 * Every field is private. Nothing outside this class can reach in and set a date
 * to last Tuesday: reading goes through the getters below, and the only way to
 * change an item is applyValues(), which cleans everything on the way in.
 *
 * That has one consequence worth understanding, because it is a genuine trap.
 * JSON.stringify cannot see private fields at all, so an item written to local
 * storage would come back as {} and every saved list would silently lose its
 * contents. The toJSON() method at the bottom is what prevents that: stringify
 * calls it if it exists, so it is the one place that decides what a saved item
 * looks like. Add a field and it must be added there too.
 */
import { IdGenerator } from '../common/IdGenerator.js';
import { DateUtil } from '../common/DateUtil.js';

export class ListItem {
    #id;
    #description;
    #dateEntered;

    /**
     * @param {Object} initialValues any subset of the fields below
     */
    constructor({
        id = IdGenerator.next('item'),
        description = '',
        dateEntered = DateUtil.today()
    } = {}) {
        this.#id = id;
        this.#description = description;
        this.#dateEntered = DateUtil.clean(dateEntered) ?? DateUtil.today();
    }

    // -------------------------------------------------------------------------
    // reading. Getters rather than public fields, so that every one of these is
    // read only from the outside
    // -------------------------------------------------------------------------

    get id() { return this.#id; }
    get description() { return this.#description; }
    get dateEntered() { return this.#dateEntered; }

    /**
     * @return {Object} just this item's editable values, i.e. everything except
     * the id. This is the snapshot the edit transaction remembers.
     */
    getValues() {
        return {
            description: this.#description,
            dateEntered: this.#dateEntered
        };
    }

    // -------------------------------------------------------------------------
    // writing
    // -------------------------------------------------------------------------

    /**
     * Overwrites this item's editable fields, leaving the id alone. Used by the
     * edit transaction, which needs to change an item in place rather than swap
     * in a different object, so that anything holding a reference stays valid.
     *
     * This is the only way in. Everything arriving here is cleaned first, so an
     * item can never be holding a date it should not.
     *
     * @param {Object} values the new description and dateEntered
     */
    applyValues({ description, dateEntered }) {
        if (description !== undefined) this.#description = description;
        if (dateEntered !== undefined) this.#dateEntered = DateUtil.clean(dateEntered) ?? this.#dateEntered;
    }

    // -------------------------------------------------------------------------
    // copying and serialization
    // -------------------------------------------------------------------------

    /**
     * The Prototype pattern in action. Produces a new ListItem carrying identical
     * data, but with an id of its own, since two different items must never share
     * an id. getValues() deliberately omits the id, so the constructor mints a
     * fresh one.
     *
     * @return {ListItem} the copy
     */
    clone() {
        return new ListItem(this.getValues());
    }

    /**
     * What JSON.stringify writes when an item is saved.
     *
     * Without this the private fields above would be invisible to it and every
     * saved item would be written as {}. This is the whole shape of a stored
     * item, so a new field has to be listed here as well as in the constructor.
     *
     * @return {Object}
     */
    toJSON() {
        return { id: this.#id, ...this.getValues() };
    }

    /**
     * @param {Object} json an object that came back out of local storage
     * @return {ListItem} a real ListItem, with anything malformed cleaned up
     */
    static fromJSON(json) {
        return new ListItem(json ?? {});
    }

    toString() {
        return `ListItem(${this.#description})`;
    }
}

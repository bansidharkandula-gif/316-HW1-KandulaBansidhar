/**
 * CardPrototype.js
 *
 * PROTOTYPE DESIGN PATTERN
 * ------------------------
 * Both of our screens are made of cards, and both build a great many of them.
 * Rather than assembling a card element from scratch every single time, we build
 * one perfect blank card once, keep it, and stamp out copies of it with
 * cloneNode(true). That blank card is the prototype.
 *
 * Two reasons this is worth doing. The obvious one is speed, cloning a finished
 * subtree is considerably cheaper than a dozen createElement and appendChild
 * calls. The better one is that the shape of a card is now described in exactly
 * one place, so a change to the markup of a card cannot possibly get applied to
 * some cards and forgotten on others.
 *
 * WHERE THE BLANK CARD COMES FROM
 * ------------------------------
 * It is not built here. Every blank card is a <template> in index.html, and
 * buildPrototypeElement does nothing but fetch it and clone it. There is no HTML
 * anywhere in this folder, or anywhere else in js/.
 *
 * That is worth insisting on. Markup written as a string inside a .js file is
 * invisible to anyone searching index.html, unchecked by any HTML validator,
 * unhighlighted by the editor, and free to drift away from the stylesheet the
 * moment somebody edits one and forgets the other. Markup written in the HTML
 * file is none of those things. A <template> is the browser's own mechanism for
 * exactly this: its contents are parsed but completely inert, never rendered and
 * unreachable by getElementById, so the only thing anybody can do with one is
 * copy it.
 *
 * Subclasses fill in two methods:
 *   buildPrototypeElement()  which template this card comes from, called once
 *   initializeClone()        pour one list's or one item's data into a fresh copy
 *
 * One rule about that second method: it must set text with textContent and never
 * with innerHTML. The template's markup is fixed and was written by us, but the
 * data poured into a clone was typed by the user, and typed-in text must never
 * be allowed to turn into live markup.
 */
export class CardPrototype {
    #prototypeElement;

    constructor() {
        this.#prototypeElement = null;
    }

    /**
     * Builds the blank card. Subclasses must override this.
     *
     * @return {HTMLElement}
     */
    buildPrototypeElement() {
        throw new Error(`${this.constructor.name} must override buildPrototypeElement()`);
    }

    /**
     * Pours data into a fresh copy of the prototype. Subclasses must override.
     *
     * @param {HTMLElement} element the clone being prepared
     * @param {Object} data the list or item this card represents
     * @param {number} index where it sits in its collection
     */
    initializeClone(element, data, index) {
        throw new Error(`${this.constructor.name} must override initializeClone()`);
    }

    /**
     * The prototype itself, built the first time it is asked for and then kept.
     * Note that this element is never put into the document, it exists only to be
     * copied.
     *
     * @return {HTMLElement}
     */
    getPrototypeElement() {
        if (this.#prototypeElement === null) {
            this.#prototypeElement = this.buildPrototypeElement();
        }
        return this.#prototypeElement;
    }

    /**
     * Stamps out one ready to use card.
     *
     * @param {Object} data the list or item this card represents
     * @param {number} index where it sits in its collection
     * @return {HTMLElement} a card ready to be added to the document
     */
    clone(data, index) {
        const element = this.getPrototypeElement().cloneNode(true);
        this.initializeClone(element, data, index);
        return element;
    }

    /**
     * A small convenience for subclasses. Finds one piece of a clone and
     * complains loudly if it is missing, which turns a typo in a selector into an
     * immediate error rather than a card that quietly renders half of its data.
     *
     * @param {HTMLElement} element
     * @param {string} selector
     * @return {HTMLElement}
     */
    static requirePart(element, selector) {
        const part = element.querySelector(selector);
        if (part === null) {
            throw new Error(`Card prototype is missing a required part: ${selector}`);
        }
        return part;
    }
}

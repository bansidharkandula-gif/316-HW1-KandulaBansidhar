/**
 * Iterator.js
 *
 * The abstract base class for the Iterator design pattern. An iterator lets you
 * walk through a collection one element at a time without knowing or caring how
 * that collection stores its elements.
 *
 * Today our lists hold their items in a plain array. In a later assignment they
 * might arrive from a database a page at a time. Every piece of code that renders
 * a list goes through an iterator, so none of that rendering code has to change
 * when the underlying storage does.
 */
export class Iterator {
    /**
     * @return {boolean} true if next() would return an element
     */
    hasNext() {
        throw new Error(`${this.constructor.name} must override hasNext()`);
    }

    /**
     * @return {*} the next element in the traversal
     */
    next() {
        throw new Error(`${this.constructor.name} must override next()`);
    }

    /**
     * Puts the cursor back at the beginning so the collection can be walked again.
     */
    reset() {
        throw new Error(`${this.constructor.name} must override reset()`);
    }

    /**
     * Walks whatever is left, handing each element plus its position to a callback.
     *
     * @param {Function} callback invoked as callback(element, positionInTraversal)
     */
    forEachRemaining(callback) {
        let position = 0;
        while (this.hasNext()) {
            callback(this.next(), position++);
        }
    }

    /**
     * Teaches JavaScript itself about our iterator, so that our own classes work
     * with for...of and with the spread operator exactly like a built-in
     * collection does.
     */
    [Symbol.iterator]() {
        const iterator = this;
        return {
            next() {
                return iterator.hasNext()
                    ? { value: iterator.next(), done: false }
                    : { value: undefined, done: true };
            }
        };
    }
}

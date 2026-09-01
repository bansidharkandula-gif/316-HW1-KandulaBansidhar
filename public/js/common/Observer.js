/**
 * Observer.js
 *
 * The Observer half of the Observer design pattern. An Observer is anything that
 * wants to be told when something interesting happens somewhere else, without the
 * two objects having to know much about each other.
 *
 * In this application the AppController observes every view and every modal, and
 * the views observe the model. Nothing ever reaches across those boundaries and
 * calls another object's methods directly, everything travels as an event.
 */
export class Observer {
    /**
     * Called by a Subject when it has something to report. Subclasses must
     * override this.
     *
     * @param {UIEvent} event what happened
     */
    onNotify(event) {
        throw new Error(`${this.constructor.name} must override onNotify(event)`);
    }
}

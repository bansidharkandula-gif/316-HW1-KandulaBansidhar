/**
 * UIEvent.js
 *
 * The message that travels from a Subject to its Observers. We define our own
 * event type rather than reusing the DOM's CustomEvent because our events are
 * about our application, i.e. "the user asked to delete a list", not about the
 * DOM, i.e. "a mouse button went down on a span".
 */
export class UIEvent {
    /**
     * @param {string} type one of the constants in EventTypes
     * @param {Object} source the Subject that sent this event
     * @param {Object} payload any data the observer needs, i.e. { listId: "..." }
     */
    constructor(type, source, payload = {}) {
        this.type = type;
        this.source = source;
        this.payload = payload;
    }

    /**
     * Safely reads one value out of the payload.
     */
    get(key, defaultValue = undefined) {
        return Object.hasOwn(this.payload, key) ? this.payload[key] : defaultValue;
    }

    toString() {
        const sourceName = this.source?.constructor?.name ?? 'unknown';
        return `UIEvent[${this.type}] from ${sourceName} ${JSON.stringify(this.payload)}`;
    }
}

/**
 * Subject.js
 *
 * The Subject half of the Observer design pattern. A Subject keeps a list of
 * interested Observers and notifies every one of them whenever something happens.
 *
 * Note that a Subject never knows who its observers are or what they will do with
 * the news. That is the whole point, and it is what will let us replace the entire
 * user interface in a later assignment without touching the model.
 */
import { UIEvent } from './UIEvent.js';

export class Subject {
    // #observers is private, so nothing outside this class can quietly reach in
    // and corrupt the subscription list
    #observers;

    constructor() {
        this.#observers = [];
    }

    /**
     * Registers an observer. Anything with an onNotify(event) method qualifies,
     * which lets a class that already extends something else, i.e. our views,
     * still play the Observer role.
     *
     * @param {Observer} observer the object to start notifying
     * @return {Observer} that same observer, so callers can hold onto it
     */
    subscribe(observer) {
        if (!observer || typeof observer.onNotify !== 'function') {
            throw new TypeError('Subject.subscribe requires an object with an onNotify(event) method');
        }
        if (!this.#observers.includes(observer)) {
            this.#observers.push(observer);
        }
        return observer;
    }

    /**
     * Stops notifying an observer.
     */
    unsubscribe(observer) {
        const index = this.#observers.indexOf(observer);
        if (index >= 0) this.#observers.splice(index, 1);
    }

    countObservers() {
        return this.#observers.length;
    }

    /**
     * Builds a UIEvent and hands it to every subscribed observer. We iterate over
     * a copy of the list because an observer is allowed to unsubscribe itself in
     * response to the very event it is being handed.
     *
     * @param {string} type one of the EventTypes constants
     * @param {Object} payload the data that goes along with the event
     * @return {UIEvent} the event that was sent
     */
    notifyObservers(type, payload = {}) {
        const event = new UIEvent(type, this, payload);
        for (const observer of [...this.#observers]) {
            observer.onNotify(event);
        }
        return event;
    }
}

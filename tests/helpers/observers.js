/**
 * observers.js
 *
 * A test double for the Observer half of the Observer pattern.
 *
 * Every view and the model itself are Subjects, and a Subject's whole job is to
 * announce things. The natural way to test one is therefore to subscribe
 * something that writes down everything it hears, do something, and then read
 * what was written down. That object is a spy, and this is it.
 *
 * It is worth noticing what this makes possible. We can test that clicking a
 * delete button announces DELETE_LIST_REQUESTED without any list ever being
 * deleted, because the view genuinely does not delete anything. If these tests
 * had to check that the list disappeared, that would be evidence the view was
 * doing the controller's job.
 */

export class RecordingObserver {
    constructor() {
        this.events = [];
    }

    /** the one method the Subject requires */
    onNotify(event) {
        this.events.push(event);
    }

    /** @return {string[]} the types of everything heard, in order */
    get types() {
        return this.events.map((event) => event.type);
    }

    /** @return {UIEvent[]} every event of one type */
    ofType(type) {
        return this.events.filter((event) => event.type === type);
    }

    /**
     * @return {UIEvent|undefined} the first event of a type, which is what a test
     * normally wants to read a payload out of
     */
    first(type) {
        return this.ofType(type)[0];
    }

    /** @return {UIEvent|undefined} the most recent event of a type */
    last(type) {
        return this.ofType(type).at(-1);
    }

    /** @return {number} how many of a type were heard */
    count(type) {
        return this.ofType(type).length;
    }

    clear() {
        this.events = [];
    }
}

/**
 * Subscribes a fresh RecordingObserver to a Subject.
 *
 * @param {Subject} subject
 * @return {RecordingObserver}
 */
export function listenTo(subject) {
    const observer = new RecordingObserver();
    subject.subscribe(observer);
    return observer;
}

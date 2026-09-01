/**
 * observer-pattern.test.js
 *
 * Subject, Observer and the UIEvent that travels between them.
 *
 * The other three required patterns each had a natural home in an existing test
 * file — the Singleton in DataStorageManager.test.js, the Iterator in
 * iterators.test.js, the Prototype in prototypes.test.js. The Observer pattern
 * did not, because it is used absolutely everywhere and belongs to no single
 * class. So it gets a file of its own, and it is tested here in the abstract,
 * with no model and no view involved at all.
 *
 * That abstraction is the point of the pattern. A Subject never knows who its
 * observers are or what they will do with the news, which is precisely what will
 * let the entire user interface be replaced in a later assignment without the
 * model changing at all. Every test below is written against that contract rather
 * than against any particular use of it.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Subject } from '../../public/js/common/Subject.js';
import { Observer } from '../../public/js/common/Observer.js';
import { UIEvent } from '../../public/js/common/UIEvent.js';
import { EventTypes } from '../../public/js/common/EventTypes.js';

/** an observer that writes down everything it hears */
class Recorder extends Observer {
    constructor(name = 'recorder') {
        super();
        this.name = name;
        this.heard = [];
    }

    onNotify(event) {
        this.heard.push(event);
    }
}

let subject;

beforeEach(() => {
    subject = new Subject();
});

describe('Observer, the abstract base class', () => {
    it('refuses to be used without onNotify being overridden', () => {
        class Forgetful extends Observer {}
        expect(() => new Forgetful().onNotify(new UIEvent('ANYTHING', null)))
            .toThrow(/Forgetful must override onNotify/);
    });
});

describe('subscribing', () => {
    it('starts with no observers', () => {
        expect(subject.countObservers()).toBe(0);
    });

    it('registers an observer and hands it back', () => {
        const recorder = new Recorder();
        expect(subject.subscribe(recorder)).toBe(recorder);
        expect(subject.countObservers()).toBe(1);
    });

    it('accepts anything at all with an onNotify method', () => {
        // this is what lets a view, which already extends Subject, still play the
        // Observer role. JavaScript has no multiple inheritance, so the pattern
        // is defined by the method rather than by the base class.
        const duck = { onNotify: vi.fn() };

        subject.subscribe(duck);
        subject.notifyObservers(EventTypes.LISTS_CHANGED);

        expect(duck.onNotify).toHaveBeenCalledOnce();
    });

    it('refuses anything that could not be notified', () => {
        // failing here, loudly, at subscribe time, is far kinder than failing
        // later inside a notify that nobody is watching
        expect(() => subject.subscribe(null)).toThrow(TypeError);
        expect(() => subject.subscribe({})).toThrow(/onNotify/);
        expect(() => subject.subscribe({ onNotify: 'not a function' })).toThrow(TypeError);
    });

    it('ignores a repeated subscription rather than notifying twice', () => {
        const recorder = new Recorder();

        subject.subscribe(recorder);
        subject.subscribe(recorder);

        expect(subject.countObservers()).toBe(1);
        subject.notifyObservers(EventTypes.LISTS_CHANGED);
        expect(recorder.heard).toHaveLength(1);
    });
});

describe('unsubscribing', () => {
    it('stops the observer being notified', () => {
        const recorder = new Recorder();
        subject.subscribe(recorder);

        subject.unsubscribe(recorder);
        subject.notifyObservers(EventTypes.LISTS_CHANGED);

        expect(subject.countObservers()).toBe(0);
        expect(recorder.heard).toEqual([]);
    });

    it('leaves the others alone', () => {
        const staying = new Recorder('staying');
        const going = new Recorder('going');
        subject.subscribe(staying);
        subject.subscribe(going);

        subject.unsubscribe(going);
        subject.notifyObservers(EventTypes.LISTS_CHANGED);

        expect(staying.heard).toHaveLength(1);
        expect(going.heard).toHaveLength(0);
    });

    it('does nothing when given an observer that was never subscribed', () => {
        expect(() => subject.unsubscribe(new Recorder())).not.toThrow();
    });
});

describe('notifying', () => {
    it('tells every observer', () => {
        const first = new Recorder('first');
        const second = new Recorder('second');
        subject.subscribe(first);
        subject.subscribe(second);

        subject.notifyObservers(EventTypes.LISTS_CHANGED, { lists: [] });

        expect(first.heard).toHaveLength(1);
        expect(second.heard).toHaveLength(1);
    });

    it('tells them in the order they subscribed', () => {
        const order = [];
        subject.subscribe({ onNotify: () => order.push('first') });
        subject.subscribe({ onNotify: () => order.push('second') });

        subject.notifyObservers(EventTypes.LISTS_CHANGED);

        expect(order).toEqual(['first', 'second']);
    });

    it('builds an event carrying the type, the source and the payload', () => {
        const recorder = new Recorder();
        subject.subscribe(recorder);

        subject.notifyObservers(EventTypes.OPEN_LIST_REQUESTED, { listId: 'list-a' });

        const [event] = recorder.heard;
        expect(event).toBeInstanceOf(UIEvent);
        expect(event.type).toBe(EventTypes.OPEN_LIST_REQUESTED);
        expect(event.source).toBe(subject);
        expect(event.payload).toEqual({ listId: 'list-a' });
    });

    it('hands every observer the same event object', () => {
        const first = new Recorder('first');
        const second = new Recorder('second');
        subject.subscribe(first);
        subject.subscribe(second);

        subject.notifyObservers(EventTypes.LISTS_CHANGED);

        expect(first.heard[0]).toBe(second.heard[0]);
    });

    it('returns the event it sent', () => {
        const event = subject.notifyObservers(EventTypes.LISTS_CHANGED, { lists: [] });
        expect(event).toBeInstanceOf(UIEvent);
        expect(event.type).toBe(EventTypes.LISTS_CHANGED);
    });

    it('defaults the payload to an empty object', () => {
        const recorder = new Recorder();
        subject.subscribe(recorder);

        subject.notifyObservers(EventTypes.UNDO_REQUESTED);

        expect(recorder.heard[0].payload).toEqual({});
    });

    it('is harmless when nobody is listening', () => {
        expect(() => subject.notifyObservers(EventTypes.LISTS_CHANGED)).not.toThrow();
    });

    // ------------------------------------------------------------------------
    // Subject iterates over a COPY of its observer list, and this is why. An
    // observer is entitled to unsubscribe itself in response to the very event
    // it is being handed, and iterating the live array while it is being spliced
    // would silently skip whichever observer happened to come next.
    // ------------------------------------------------------------------------
    it('lets an observer unsubscribe itself mid-notification', () => {
        const quitter = {
            heard: 0,
            onNotify() {
                this.heard++;
                subject.unsubscribe(this);
            }
        };
        const bystander = new Recorder('bystander');

        subject.subscribe(quitter);
        subject.subscribe(bystander);

        subject.notifyObservers(EventTypes.LISTS_CHANGED);

        // the bystander was not skipped, even though the list shrank underneath
        expect(quitter.heard).toBe(1);
        expect(bystander.heard).toHaveLength(1);

        subject.notifyObservers(EventTypes.LISTS_CHANGED);
        expect(quitter.heard).toBe(1);
        expect(bystander.heard).toHaveLength(2);
    });

    it('lets an observer subscribe another one mid-notification', () => {
        const latecomer = new Recorder('latecomer');
        subject.subscribe({ onNotify: () => subject.subscribe(latecomer) });

        subject.notifyObservers(EventTypes.LISTS_CHANGED);

        // the newcomer does not hear the event that added it, only the next one
        expect(latecomer.heard).toHaveLength(0);

        subject.notifyObservers(EventTypes.LISTS_CHANGED);
        expect(latecomer.heard).toHaveLength(1);
    });
});

describe('the observer list is private', () => {
    it('is not reachable from outside the class', () => {
        // #observers is a genuine private field, so there is no property to find
        subject.subscribe(new Recorder());
        expect(Object.keys(subject)).toEqual([]);
        expect(JSON.parse(JSON.stringify(subject))).toEqual({});
    });
});

describe('UIEvent', () => {
    it('reads a value out of the payload', () => {
        const event = new UIEvent(EventTypes.MOVE_ITEM_REQUESTED, subject, {
            fromIndex: 0, toIndex: 2
        });

        expect(event.get('fromIndex')).toBe(0);
        expect(event.get('toIndex')).toBe(2);
    });

    it('returns undefined for a key that is not there', () => {
        expect(new UIEvent('ANY', subject, {}).get('missing')).toBeUndefined();
    });

    it('returns the default the caller asked for instead', () => {
        // AppController relies on this, i.e. event.get('then', 'close')
        expect(new UIEvent('ANY', subject, {}).get('missing', 'fallback')).toBe('fallback');
    });

    it('returns a stored value even when it is falsy', () => {
        // the bug this guards against is writing `payload[key] ?? defaultValue`,
        // which would turn a perfectly good index of 0 into the default
        const event = new UIEvent('ANY', subject, {
            index: 0, name: '', flag: false, nothing: null
        });

        expect(event.get('index', 99)).toBe(0);
        expect(event.get('name', 'fallback')).toBe('');
        expect(event.get('flag', true)).toBe(false);
        expect(event.get('nothing', 'fallback')).toBeNull();
    });

    it('does not mistake an inherited property for a payload value', () => {
        expect(new UIEvent('ANY', subject, {}).get('toString', 'fallback')).toBe('fallback');
        expect(new UIEvent('ANY', subject, {}).get('constructor', 'fallback')).toBe('fallback');
    });

    it('defaults the payload to an empty object', () => {
        expect(new UIEvent('ANY', subject).payload).toEqual({});
    });

    describe('toString', () => {
        it('names the type, the sender and the payload', () => {
            const text = new UIEvent(EventTypes.OPEN_LIST_REQUESTED, subject, { listId: 'list-a' })
                .toString();

            expect(text).toContain('UIEvent[OPEN_LIST_REQUESTED]');
            expect(text).toContain('from Subject');
            expect(text).toContain('"listId":"list-a"');
        });

        it('copes with an event that has no source', () => {
            // AppController prints this when it receives an event it does not
            // handle, so it must not itself throw while reporting a problem
            expect(() => new UIEvent('ANY', null).toString()).not.toThrow();
            expect(new UIEvent('ANY', null).toString()).toContain('from unknown');
        });
    });
});

describe('EventTypes', () => {
    it('gives every constant a value equal to its own name', () => {
        // a constant whose value did not match its name would still work, but it
        // would make every console log and every stack trace harder to read
        for (const [name, value] of Object.entries(EventTypes)) {
            expect(value, `EventTypes.${name}`).toBe(name);
        }
    });

    it('has no two constants sharing a value', () => {
        // two events with the same string would be indistinguishable in the
        // controller switch, and one of them would silently never fire
        const values = Object.values(EventTypes);
        expect(new Set(values).size).toBe(values.length);
    });

    it('is undefined for a misspelled name, which is the whole point', () => {
        // referring to a constant rather than writing a bare string means a typo
        // becomes an immediate undefined instead of an event nobody ever hears
        expect(EventTypes.OPEN_LIST_REQUESTD).toBeUndefined();
    });
});

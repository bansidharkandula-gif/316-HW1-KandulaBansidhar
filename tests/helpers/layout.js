/**
 * layout.js
 *
 * jsdom parses HTML and runs scripts, but it never lays anything out. There are
 * no pixels in it at all. Two consequences bite our tests:
 *
 *   getBoundingClientRect()  always returns zeroes
 *   offsetParent             is always null, even for a visible element
 *
 * Most of our code does not care. Two pieces do. ListView decides where a
 * dragged card should land by comparing the cursor's y against the midline of
 * the card underneath it, and Modal decides what Tab may reach by filtering on
 * offsetParent. Testing either of those in jsdom means supplying the numbers
 * jsdom will not.
 *
 * The functions below do that, loudly and in one place, so that a test which
 * depends on faked geometry is obvious at a glance. Everything they change is
 * undone by Vitest's restoreMocks between tests.
 *
 * This is also the honest boundary of this tier of testing. We can prove
 * ListView computes the right destination index for a given cursor position; we
 * cannot prove Chrome puts the cursor where we think. That second half is what
 * the Playwright test in tests/e2e/drag-and-drop.spec.js is for.
 */
import { vi } from 'vitest';

/**
 * Gives one element a rectangle, so code that measures it gets real numbers.
 *
 * @param {HTMLElement} element
 * @param {Object} rect top and height are the two ListView actually reads
 */
export function giveLayout(element, { top = 0, height = 40, left = 0, width = 600 } = {}) {
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
        top, height, left, width,
        bottom: top + height,
        right: left + width,
        x: left,
        y: top,
        toJSON() { return { top, height, left, width }; }
    });
}

/**
 * Stacks a container's children vertically, each rowHeight tall, and hands back
 * the y coordinate of the top and the middle of each one so a test can aim a
 * simulated cursor precisely.
 *
 * @param {HTMLElement[]} elements
 * @param {number} rowHeight
 * @return {Object[]} one { top, middle, bottom } per element
 */
export function stackVertically(elements, rowHeight = 40) {
    return elements.map((element, index) => {
        const top = index * rowHeight;
        giveLayout(element, { top, height: rowHeight });
        return { top, middle: top + rowHeight / 2, bottom: top + rowHeight };
    });
}

/**
 * Makes offsetParent report something non-null for any element that is not
 * hidden, which is the closest jsdom can get to "this element is on screen".
 *
 * Modal filters its focusable elements on offsetParent !== null, so without this
 * every modal in jsdom believes it contains nothing focusable at all.
 */
export function enableOffsetParent() {
    Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', {
        configurable: true,
        get() {
            for (let node = this; node !== null; node = node.parentElement) {
                if (node.classList?.contains('hidden')) return null;
                if (node.hasAttribute?.('hidden')) return null;
            }
            return this.parentElement;
        }
    });
}

/**
 * A stand in for the DataTransfer object a real drag event carries. jsdom does
 * not implement one, and ListView writes to three of its properties.
 *
 * @return {Object}
 */
export function makeDataTransfer() {
    const data = new Map();
    return {
        effectAllowed: 'none',
        dropEffect: 'none',
        setData(format, value) { data.set(format, String(value)); },
        getData(format) { return data.get(format) ?? ''; },
        setDragImage() { /* nothing to draw in jsdom */ }
    };
}

/**
 * Builds and dispatches one drag event, since jsdom has no DragEvent class.
 *
 * @param {HTMLElement} target what the event happened on
 * @param {string} type dragstart, dragover, drop or dragend
 * @param {Object} options clientY and the shared dataTransfer
 * @return {Event} the event that was dispatched, so a test can read
 * defaultPrevented off of it
 */
export function fireDragEvent(target, type, { clientY = 0, dataTransfer } = {}) {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    event.clientY = clientY;
    event.dataTransfer = dataTransfer;
    target.dispatchEvent(event);
    return event;
}

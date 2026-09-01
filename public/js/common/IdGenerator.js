/**
 * IdGenerator.js
 *
 * Every list and every list item needs an id that is unique, that survives being
 * written to local storage and read back weeks later, and that will not collide
 * with an id generated in another browser tab.
 */
export class IdGenerator {
    /**
     * @param {string} prefix a short tag so that ids stay readable while debugging
     * @return {string} a brand new unique id
     */
    static next(prefix = 'id') {
        if (globalThis.crypto?.randomUUID) {
            return `${prefix}-${globalThis.crypto.randomUUID()}`;
        }
        // fallback for the rare browser without crypto.randomUUID
        const random = Math.random().toString(36).slice(2, 10);
        return `${prefix}-${Date.now().toString(36)}-${random}`;
    }
}

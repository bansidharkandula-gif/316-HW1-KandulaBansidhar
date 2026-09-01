/**
 * Modal.js
 *
 * The base class for all three of our modals: the item editor, the warning modal
 * that guards anything destructive, and the informative modal.
 *
 * A modal is not just a box that appears on top of things. Making one behave
 * properly means handling several details at once, and they are handled here,
 * once, rather than three times over:
 *
 *   - a shared backdrop that dims and blocks the screen underneath
 *   - a stack, so that a modal may legitimately open on top of another modal, as
 *     happens when the item editor complains about an empty description
 *   - Escape cancels the topmost modal
 *   - focus moves into the modal when it opens and returns to wherever it came
 *     from when it closes
 *   - Tab is trapped inside the modal, since being able to tab to the buttons of
 *     the screen behind a modal defeats the entire point of one
 *
 * Modal extends Subject, so a modal announces what the user chose and lets the
 * controller decide what that means.
 */
import { Subject } from '../../common/Subject.js';

export class Modal extends Subject {
    /** every modal currently open, bottom of the stack first */
    static #openModals = [];
    static #globalHandlersInstalled = false;

    /** the selector for everything a user can legitimately land on with Tab */
    static #FOCUSABLE =
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    #element;
    #elementToRefocus;

    /**
     * @param {string} elementId the id of this modal's element in index.html
     */
    constructor(elementId) {
        super();
        this.#element = document.getElementById(elementId);
        if (this.#element === null) {
            throw new Error(`Modal cannot find an element with the id ${elementId}`);
        }
        this.#elementToRefocus = null;
        Modal.#installGlobalHandlers();
    }

    isOpen() {
        return Modal.#openModals.includes(this);
    }

    /**
     * Puts this modal on screen. Subclasses do not call this directly from the
     * outside, they offer a method that says what the modal is being opened for,
     * i.e. openForNewItem, and call this at the end of it.
     */
    show() {
        if (this.isOpen()) {
            this.focusFirstControl();
            return;
        }

        this.#elementToRefocus = document.activeElement;
        Modal.#openModals.push(this);

        // stack each modal above the one it opened on top of
        this.#element.style.zIndex = String(1000 + (Modal.#openModals.length - 1) * 10);
        this.#element.classList.remove('hidden');
        Modal.#getBackdrop().classList.remove('hidden');
        document.body.classList.add('modal-is-open');

        this.focusFirstControl();
    }

    /**
     * Takes this modal back off the screen and hands focus back to wherever it
     * was before the modal opened.
     */
    hide() {
        const position = Modal.#openModals.indexOf(this);
        if (position < 0) return;

        Modal.#openModals.splice(position, 1);
        this.#element.classList.add('hidden');

        if (Modal.#openModals.length === 0) {
            Modal.#getBackdrop().classList.add('hidden');
            document.body.classList.remove('modal-is-open');
        }

        const refocusTarget = this.#elementToRefocus;
        this.#elementToRefocus = null;
        if (refocusTarget && typeof refocusTarget.focus === 'function'
            && document.contains(refocusTarget)) {
            refocusTarget.focus();
        }
    }

    /**
     * What Escape means for this modal. The default is simply to close, and every
     * subclass overrides it to announce that the user backed out.
     */
    requestCancel() {
        this.hide();
    }

    /**
     * What clicking the backdrop means. Deliberately not "close": a modal exists
     * to insist on an answer, and quietly throwing away a half finished edit
     * because the user clicked slightly outside the box is unkind. Instead the
     * modal gives a small shake to point out that it is waiting.
     */
    onBackdropPressed() {
        this.#shake();
    }

    /**
     * Moves focus to the first thing in the modal the user can interact with.
     * Subclasses override this when something other than the first control is the
     * obvious place to start, i.e. the description field of the item editor.
     */
    focusFirstControl() {
        this.#getFocusableElements()[0]?.focus();
    }

    /**
     * Keeps Tab and Shift+Tab inside this modal by wrapping around at both ends.
     *
     * @param {KeyboardEvent} domEvent
     */
    handleTabKey(domEvent) {
        const focusable = this.#getFocusableElements();
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (domEvent.shiftKey && (active === first || !this.#element.contains(active))) {
            domEvent.preventDefault();
            last.focus();
        } else if (!domEvent.shiftKey && (active === last || !this.#element.contains(active))) {
            domEvent.preventDefault();
            first.focus();
        }
    }

    // -------------------------------------------------------------------------
    // statics
    // -------------------------------------------------------------------------

    /**
     * @return {boolean} true if any modal at all is on screen. The keyboard
     * shortcuts in AppController check this so that Ctrl+Z does not undo a list
     * edit while the user is busy typing into a modal.
     */
    static isAnyOpen() {
        return Modal.#openModals.length > 0;
    }

    /**
     * @return {Modal|null} the modal on top of the stack, which is the only one
     * the keyboard should be talking to
     */
    static topMost() {
        return Modal.#openModals.at(-1) ?? null;
    }

    static #getBackdrop() {
        const backdrop = document.getElementById('modal-backdrop');
        if (backdrop === null) {
            throw new Error('index.html is missing the element with the id modal-backdrop');
        }
        return backdrop;
    }

    /**
     * Installs the keyboard and backdrop handling that every modal shares. Runs
     * at most once no matter how many modals get built.
     */
    static #installGlobalHandlers() {
        if (Modal.#globalHandlersInstalled) return;
        Modal.#globalHandlersInstalled = true;

        document.addEventListener('keydown', (domEvent) => {
            const top = Modal.topMost();
            if (top === null) return;

            if (domEvent.key === 'Escape') {
                domEvent.preventDefault();
                top.requestCancel();
            } else if (domEvent.key === 'Tab') {
                top.handleTabKey(domEvent);
            }
        });

        Modal.#getBackdrop().addEventListener('click', () => {
            Modal.topMost()?.onBackdropPressed();
        });
    }

    // -------------------------------------------------------------------------
    // private helpers
    // -------------------------------------------------------------------------

    #getFocusableElements() {
        return [...this.#element.querySelectorAll(Modal.#FOCUSABLE)]
            .filter((element) => element.offsetParent !== null);
    }

    #shake() {
        this.#element.classList.remove('modal-shake');
        // reading offsetWidth forces the browser to apply the removal before the
        // class goes back on, which is what lets the animation run again
        void this.#element.offsetWidth;
        this.#element.classList.add('modal-shake');
        this.#element.addEventListener(
            'animationend',
            () => this.#element.classList.remove('modal-shake'),
            { once: true });
    }
}

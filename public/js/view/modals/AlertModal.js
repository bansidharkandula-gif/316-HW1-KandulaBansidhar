/**
 * AlertModal.js
 *
 * The informative modal, for the times the application simply has to tell the
 * user something: an item was saved without a description, local storage is full,
 * the saved data could not be read.
 *
 * This exists instead of the browser's own alert() for two reasons. The built in
 * one freezes the entire page while it is up, and it looks like the browser
 * talking rather than like our application talking.
 */
import { Modal } from './Modal.js';
import { EventTypes } from '../../common/EventTypes.js';

export class AlertModal extends Modal {
    #title;
    #message;
    #okButton;

    constructor() {
        super('alert-modal');

        this.#title = document.getElementById('alert-modal-title');
        this.#message = document.getElementById('alert-modal-message');
        this.#okButton = document.getElementById('alert-ok-button');

        this.#okButton.addEventListener('click', () => this.requestCancel());
    }

    /**
     * @param {Object} options
     * @param {string} options.title the heading
     * @param {string} options.message what the user needs to know
     */
    inform({ title = 'Notice', message = '' }) {
        this.#title.textContent = title;
        this.#message.textContent = message;
        this.show();
    }

    focusFirstControl() {
        this.#okButton.focus();
    }

    /**
     * There is only one way out of an informative modal, so Escape and OK do the
     * same thing.
     */
    requestCancel() {
        this.hide();
        this.notifyObservers(EventTypes.ALERT_DISMISSED);
    }
}

/**
 * ConfirmModal.js
 *
 * The warning modal. Nothing in this application is destroyed without it: not a
 * list, not an item.
 *
 * The interesting part of this class is the context object. The modal has no idea
 * what it is asking about, it simply carries whatever the controller handed it
 * back out again in the answer. That is what lets one modal guard every
 * destructive action in the program rather than needing one modal per question.
 */
import { Modal } from './Modal.js';
import { EventTypes } from '../../common/EventTypes.js';

export class ConfirmModal extends Modal {
    #title;
    #message;
    #acceptButton;
    #declineButton;
    #context;

    constructor() {
        super('confirm-modal');

        this.#title = document.getElementById('confirm-modal-title');
        this.#message = document.getElementById('confirm-modal-message');
        this.#acceptButton = document.getElementById('confirm-accept-button');
        this.#declineButton = document.getElementById('confirm-decline-button');
        this.#context = {};

        this.#acceptButton.addEventListener('click', () => this.#accept());
        this.#declineButton.addEventListener('click', () => this.requestCancel());
    }

    /**
     * Asks the user a yes or no question.
     *
     * @param {Object} options
     * @param {string} options.title the heading, i.e. Delete This List?
     * @param {string} options.message the question itself
     * @param {string} options.acceptLabel what the dangerous button should say
     * @param {Object} options.context anything the controller needs handed back
     * along with the answer, i.e. { action: "delete-list", listId: "..." }
     */
    ask({ title, message, acceptLabel = 'Delete', context = {} }) {
        this.#title.textContent = title;
        this.#message.textContent = message;
        this.#acceptButton.textContent = acceptLabel;
        this.#context = context;
        this.show();
    }

    /**
     * Focus starts on Cancel, not on the destructive button. Someone hammering
     * the Enter key should not be able to destroy anything by accident.
     */
    focusFirstControl() {
        this.#declineButton.focus();
    }

    /**
     * Escape means no, exactly like the Cancel button.
     */
    requestCancel() {
        const context = this.#context;
        this.hide();
        this.notifyObservers(EventTypes.CONFIRM_DECLINED, { context });
    }

    #accept() {
        const context = this.#context;
        this.hide();
        this.notifyObservers(EventTypes.CONFIRM_ACCEPTED, { context });
    }
}

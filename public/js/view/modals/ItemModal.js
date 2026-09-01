/**
 * ItemModal.js
 *
 * The modal that pops up on top of a list for viewing and editing one item. It
 * carries a labelled control for each of an item's fields, Next for walking the
 * list without closing the box, and OK and Cancel.
 *
 * This modal changes nothing. It reads an item's values in, hands the values the
 * user typed back out as an ITEM_MODAL_COMMIT event, and lets the controller
 * decide whether that becomes an edit transaction or nothing at all because the
 * user changed their mind.
 *
 * Next commits first and then moves, which is what makes it useful: a user can
 * open the first item, fix a typo, press Next, fix the next one, and every one of
 * those fixes lands on the undo stack as its own transaction.
 */
import { Modal } from './Modal.js';
import { EventTypes } from '../../common/EventTypes.js';
import { DateUtil } from '../../common/DateUtil.js';

export class ItemModal extends Modal {
    #heading;
    #form;
    #descriptionInput;
    #dateEnteredInput;
    #nextButton;
    #cancelButton;
    #okButton;

    // which item the modal is currently being used for
    #index;
    #itemCount;

    constructor() {
        super('item-modal');

        this.#heading = document.getElementById('item-modal-heading');
        this.#form = document.getElementById('item-modal-form');
        this.#descriptionInput = document.getElementById('item-description-input');
        this.#dateEnteredInput = document.getElementById('item-date-entered-input');
        this.#nextButton = document.getElementById('item-next-button');
        this.#cancelButton = document.getElementById('item-cancel-button');
        this.#okButton = document.getElementById('item-ok-button');

        this.#index = -1;
        this.#itemCount = 0;

        this.#wireEventHandlers();
    }

    // -------------------------------------------------------------------------
    // opening
    // -------------------------------------------------------------------------

    /**
     * Opens the modal on one existing item.
     *
     * @param {WolfieList} list the list that item belongs to
     * @param {number} index which item
     */
    openForItem(list, index) {
        const item = list?.getItemAt(index);
        if (!item) return;

        this.#index = index;
        this.#itemCount = list.size();

        this.#heading.textContent = `Item ${index + 1} of ${list.size()}`;
        this.#okButton.textContent = 'OK';
        this.#loadValues(item.getValues());
        this.#updateNavigationButtons();
        this.show();
    }

    /**
     * The description is the field the user actually came here to type in, so
     * that is where focus belongs, not on whatever control happens to come first.
     */
    focusFirstControl() {
        this.#descriptionInput.focus();
        this.#descriptionInput.select();
    }

    /**
     * Escape means cancel, exactly like the Cancel button.
     */
    requestCancel() {
        this.notifyObservers(EventTypes.ITEM_MODAL_CANCELLED, {});
        this.hide();
    }

    // -------------------------------------------------------------------------
    // wiring
    // -------------------------------------------------------------------------

    #wireEventHandlers() {
        this.#okButton.addEventListener('click', () => this.#commit('close'));
        this.#cancelButton.addEventListener('click', () => this.requestCancel());
        this.#nextButton.addEventListener('click', () => this.#commit('next'));

        // pressing Enter anywhere in the form is the same as pressing OK.
        // preventDefault also stops the browser from submitting the form itself.
        this.#form.addEventListener('keydown', (domEvent) => {
            if (domEvent.key !== 'Enter') return;
            domEvent.preventDefault();
            this.#commit('close');
        });
        this.#form.addEventListener('submit', (domEvent) => domEvent.preventDefault());
    }

    // -------------------------------------------------------------------------
    // reading and writing the controls
    // -------------------------------------------------------------------------

    /**
     * @param {Object} values description, dateEntered
     */
    #loadValues(values) {
        this.#descriptionInput.value = values.description ?? '';
        this.#dateEnteredInput.value = values.dateEntered ?? DateUtil.today();
    }

    /**
     * @return {Object} whatever the user has typed, cleaned up
     */
    #collectValues() {
        return {
            description: this.#descriptionInput.value.trim(),
            dateEntered: this.#dateEnteredInput.value || DateUtil.today()
        };
    }

    /**
     * Next is meaningless on the last item.
     */
    #updateNavigationButtons() {
        this.#nextButton.disabled = this.#index >= this.#itemCount - 1;
    }

    /**
     * Validates, then announces what the user wants done.
     *
     * @param {string} then what to do afterwards, one of close, next
     */
    #commit(then) {
        const values = this.#collectValues();

        if (values.description === '') {
            this.notifyObservers(EventTypes.ITEM_MODAL_INVALID, {
                title: 'A Description Is Required',
                message: 'Every item needs a description.'
            });
            return;
        }

        this.notifyObservers(EventTypes.ITEM_MODAL_COMMIT, {
            index: this.#index,
            values,
            then
        });
    }
}

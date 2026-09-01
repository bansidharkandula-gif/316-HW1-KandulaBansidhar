/**
 * ListCardPrototype.js
 *
 * Stamps out the cards that fill the home screen, one per list the user owns.
 * Each card carries the list's name in bold on the left, a count underneath, and
 * a delete button on the right.
 *
 * Every card is stamped with data-list-id. That is what lets the HomeView listen
 * for clicks in one single place, on the container, and still work out which list
 * was clicked. See HomeView for why that matters.
 *
 * This class is finished, and it is the worked example for the one you have to
 * write: ItemCardPrototype does the same job for the cards inside an open list.
 */
import { CardPrototype } from './CardPrototype.js';

export class ListCardPrototype extends CardPrototype {
    /** the id of this card's <template> in index.html */
    static TEMPLATE_ID = 'list-card-template';

    /**
     * Note firstElementChild rather than firstChild: indenting the markup nicely
     * leaves a text node in front of the card. Called once, so a missing template
     * would fail immediately and obviously.
     *
     * @return {HTMLElement} a blank home screen card, cloned out of index.html
     */
    buildPrototypeElement() {
        const template = document.getElementById(ListCardPrototype.TEMPLATE_ID);
        return template.content.firstElementChild.cloneNode(true);
    }

    /**
     * Pours one list's data into a fresh copy of the blank card.
     *
     * Note that the template carries no text at all — it is the shape of a card
     * and nothing else. Everything a user reads on a card arrives here.
     *
     * @param {HTMLElement} element a fresh clone of the blank card
     * @param {WolfieList} list the list this card stands for
     * @param {number} index where that list sits on the home screen
     */
    initializeClone(element, list, index) {
        // stamped onto the element itself rather than into its text: HomeView
        // listens on the container, so a card that did not carry its list's id
        // could never be traced back to a list
        element.dataset.listId = list.id;
        element.dataset.index = String(index);
        element.setAttribute('aria-label', `Open the list named ${list.name}`);

        CardPrototype.requirePart(element, '.list-card-title').textContent = list.name;
        CardPrototype.requirePart(element, '.list-card-subtitle').textContent =
            (list.size() === 0) ? 'No items yet' : `${list.size()} items`;

        const deleteButton = CardPrototype.requirePart(element, '[data-action="delete-list"]');
        deleteButton.title = `Delete ${list.name}`;
        deleteButton.setAttribute('aria-label', `Delete the list named ${list.name}`);
    }
}

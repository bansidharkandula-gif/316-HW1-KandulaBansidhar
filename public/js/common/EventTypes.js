/**
 * EventTypes.js
 *
 * Every event our Subjects can send, in one place. Using constants rather than
 * bare strings means a typo becomes an immediate undefined instead of an event
 * that silently never fires, which is one of the nastier bugs to track down.
 *
 * Read the names as sentences. A view never says "delete this list", it says
 * "the user has requested that this list be deleted". Deciding what to actually
 * do about that request is the controller's job, not the view's.
 */
export class EventTypes {
    // ----- sent by the HomeView -----
    static CREATE_LIST_REQUESTED = 'CREATE_LIST_REQUESTED';
    static OPEN_LIST_REQUESTED = 'OPEN_LIST_REQUESTED';
    static DELETE_LIST_REQUESTED = 'DELETE_LIST_REQUESTED';

    // ----- sent by the ListView -----
    static UNDO_REQUESTED = 'UNDO_REQUESTED';
    static REDO_REQUESTED = 'REDO_REQUESTED';
    static CLOSE_LIST_REQUESTED = 'CLOSE_LIST_REQUESTED';
    static RENAME_LIST_REQUESTED = 'RENAME_LIST_REQUESTED';
    static EDIT_ITEM_REQUESTED = 'EDIT_ITEM_REQUESTED';
    static DUPLICATE_ITEM_REQUESTED = 'DUPLICATE_ITEM_REQUESTED';
    static MOVE_ITEM_REQUESTED = 'MOVE_ITEM_REQUESTED';

    // ----- sent by the ItemModal -----
    static ITEM_MODAL_COMMIT = 'ITEM_MODAL_COMMIT';
    static ITEM_MODAL_CANCELLED = 'ITEM_MODAL_CANCELLED';
    static ITEM_MODAL_INVALID = 'ITEM_MODAL_INVALID';

    // ----- sent by the ConfirmModal, which is our warning modal -----
    static CONFIRM_ACCEPTED = 'CONFIRM_ACCEPTED';
    static CONFIRM_DECLINED = 'CONFIRM_DECLINED';

    // ----- sent by the AlertModal, which is our informative modal -----
    static ALERT_DISMISSED = 'ALERT_DISMISSED';

    // ----- sent by the model -----
    static LISTS_CHANGED = 'LISTS_CHANGED';
    static CURRENT_LIST_CHANGED = 'CURRENT_LIST_CHANGED';
    static TRANSACTION_STACK_CHANGED = 'TRANSACTION_STACK_CHANGED';
    static STORAGE_FAILED = 'STORAGE_FAILED';
    static STARTER_LISTS_FAILED = 'STARTER_LISTS_FAILED';
}

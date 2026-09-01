/**
 * model.js
 *
 * Builds a model with a list already open, which is the starting position every
 * transaction test needs.
 *
 * Everything comes back from one function and out of one module graph. That is
 * not tidiness, it is correctness: WolfieList's constructor asks whether each
 * item it is given `instanceof ListItem`, and a ListItem built from a second,
 * separately imported copy of the module would fail that check. The list would
 * quietly rebuild it into a different object, and every test that checks an item
 * keeps its identity across undo and redo would fail for a reason that has
 * nothing to do with the code under test.
 */
import { vi } from 'vitest';
import { seedStorage, makeListsJSON } from './fixtures.js';
import { RecordingObserver } from './observers.js';

/**
 * @param {Object} options
 * @param {Object[]} options.lists the lists to seed local storage with
 * @param {string|null} options.open the id of the list to open, or null
 * @return {Promise<Object>} the model, an observer already subscribed to it, and
 * every class the transaction tests need
 */
/**
 * Imports a transaction that may not have been written yet.
 *
 * A transaction class you have still to write is a missing file, and a missing
 * file in a static import takes the whole test FILE down with it: every test in
 * it reports as "0 test" and you lose the report on the classes you have already
 * finished. Failing softly here means only the tests that actually use that
 * transaction fail, which is the report you want.
 *
 * @param {string} specifier
 * @return {Promise<Object>} the module, or an empty object if there is no file
 */
async function optional(specifier) {
    try {
        return await import(/* @vite-ignore */ specifier);
    } catch {
        return {};
    }
}

export async function openModel({ lists = makeListsJSON(), open = 'list-a' } = {}) {
    window.localStorage.clear();
    seedStorage(lists);

    vi.resetModules();

    const [
        modelModule, listItemModule, wolfieListModule,
        addModule, deleteModule, duplicateModule, editModule, moveModule, renameModule
    ] = await Promise.all([
        import('../../public/js/model/WolfieListsModel.js'),
        import('../../public/js/model/ListItem.js'),
        import('../../public/js/model/WolfieList.js'),
        optional('../../public/js/transactions/AddItem_Transaction.js'),
        optional('../../public/js/transactions/DeleteItem_Transaction.js'),
        optional('../../public/js/transactions/DuplicateItem_Transaction.js'),
        optional('../../public/js/transactions/EditItem_Transaction.js'),
        optional('../../public/js/transactions/MoveItem_Transaction.js'),
        optional('../../public/js/transactions/RenameList_Transaction.js')
    ]);

    const model = new modelModule.WolfieListsModel();
    const observer = new RecordingObserver();
    model.subscribe(observer);

    await model.load();
    if (open !== null) model.openList(open);
    observer.clear();

    return {
        model,
        observer,
        ListItem: listItemModule.ListItem,
        WolfieList: wolfieListModule.WolfieList,
        AddItem_Transaction: addModule.AddItem_Transaction,
        DeleteItem_Transaction: deleteModule.DeleteItem_Transaction,
        DuplicateItem_Transaction: duplicateModule.DuplicateItem_Transaction,
        EditItem_Transaction: editModule.EditItem_Transaction,
        MoveItem_Transaction: moveModule.MoveItem_Transaction,
        RenameList_Transaction: renameModule.RenameList_Transaction
    };
}

/**
 * @param {WolfieListsModel} model
 * @return {string[]} the descriptions of the open list, which is how these tests
 * read an ordering at a glance
 */
export function descriptionsOf(model) {
    return model.getCurrentList().items.map((item) => item.description);
}

/**
 * @param {WolfieListsModel} model
 * @return {string[]} the ids of the open list's items, which is how these tests
 * check that undo and redo restore the very same objects rather than lookalikes
 */
export function idsOf(model) {
    return model.getCurrentList().items.map((item) => item.id);
}

/**
 * app.js
 *
 * Builds a running copy of Wolfie Lists inside jsdom, so that a test can click
 * things and then look at what happened.
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * Several classes in this application deliberately keep state that outlives any
 * one object: DataStorageManager is a Singleton, and Modal keeps a static stack
 * of whichever modals are open plus a latch saying whether it has installed its
 * document-wide key handler yet. That is exactly right for an application, which
 * only ever starts once. It is a menace in a test file, where the second test
 * would inherit the first test's Singleton and the first test's key handler,
 * still bound to a document element that has since been thrown away.
 *
 * vi.resetModules() is the cure. It empties Vitest's module registry, so the very
 * next dynamic import re-executes every module from scratch: a new Singleton, an
 * empty modal stack, a fresh latch. Which is why every application class used by
 * a test comes back from the functions below rather than from an import at the
 * top of the test file. A statically imported class would be a leftover from the
 * previous graph and would not be the same class the freshly built application is
 * using, so instanceof would quietly start returning false.
 *
 * The one safe exception is a module of nothing but string constants, i.e.
 * EventTypes. 'UNDO_REQUESTED' is equal to 'UNDO_REQUESTED' no matter which copy
 * of the module it came from, so test files import that one normally.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { vi } from 'vitest';

/**
 * Where index.html lives, worked out from the directory Vitest was started in
 * rather than from import.meta.url.
 *
 * That is not the obvious choice, so it is worth explaining. Under the jsdom
 * environment Vitest gives every module an import.meta.url based on the jsdom
 * window's location, which is an http:// url, and node:url refuses to turn one of
 * those into a file path. Vitest always runs with the project root as the working
 * directory, so resolving from there works under both environments.
 */
const INDEX_HTML_PATH = path.resolve(process.cwd(), 'public', 'index.html');

/** read once, since it never changes while a test run is in progress */
let cachedBodyHtml = null;

// ---------------------------------------------------------------------------
// keeping the document clean between tests
//
// Two classes install a handler on the document itself rather than on an element
// inside it: Modal, for Escape and Tab, and AppController, for Ctrl+Z and Ctrl+Y.
// Each installs its handler once, guarded by a static latch.
//
// That guard is defeated by the very thing that makes these tests independent.
// vi.resetModules() gives the next test a brand new Modal class with its latch
// back at false, so it installs a second handler, while the first is still
// attached to the same document, still holding the previous test's modal stack.
// Replacing document.body.innerHTML does not help: these handlers are on the
// document, which is never replaced.
//
// Left alone, the handlers pile up all run, and a keystroke in the twentieth test
// is delivered to twenty listeners, nineteen of which belong to dead objects. The
// symptom is bizarre and hard to trace, i.e. an event arriving already
// defaultPrevented by a modal that closed ten tests ago.
//
// So we record every document-level handler as it is added and take them all off
// again before each test. Patching addEventListener is a heavy handed thing to do
// and it is done here, in one place, rather than in any test.
// ---------------------------------------------------------------------------

const documentListeners = [];
let addEventListenerIsPatched = false;

function recordDocumentListeners() {
    if (addEventListenerIsPatched) return;
    addEventListenerIsPatched = true;

    const originalAddEventListener = document.addEventListener.bind(document);
    document.addEventListener = (type, handler, options) => {
        documentListeners.push([type, handler, options]);
        originalAddEventListener(type, handler, options);
    };
}

/**
 * Takes every handler installed on the document back off again.
 */
export function removeDocumentListeners() {
    for (const [type, handler, options] of documentListeners) {
        document.removeEventListener(type, handler, options);
    }
    documentListeners.length = 0;
}

/**
 * Pulls the body out of the real public/index.html and puts it into the jsdom
 * document.
 *
 * Using the real file rather than a hand written snippet is the whole point. If
 * somebody renames #add-item-button in index.html, the ListView tests fail
 * immediately, which is a far better outcome than tests that keep passing against
 * markup the application no longer has.
 */
export function mountIndexHtml() {
    recordDocumentListeners();
    removeDocumentListeners();

    if (cachedBodyHtml === null) {
        const html = readFileSync(INDEX_HTML_PATH, 'utf8');
        const match = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
        if (match === null) {
            throw new Error(`Could not find a <body> in ${INDEX_HTML_PATH}`);
        }
        // main.js starts the whole application the moment it runs, and these
        // tests want to build it themselves, one piece at a time. Assigning to
        // innerHTML would not execute the tag anyway, but removing it says so.
        cachedBodyHtml = match[1].replace(/<script[\s\S]*?<\/script>/gi, '');
    }

    document.body.innerHTML = cachedBodyHtml;
    document.body.className = '';
}

/**
 * Re-imports every application class from a clean module registry.
 *
 * @return {Promise<Object>} the classes, all of them from the same fresh graph
 */
export async function importApp() {
    vi.resetModules();

    const [
        modelModule, homeViewModule, listViewModule,
        itemModalModule, confirmModalModule, alertModalModule, modalModule,
        controllerModule, wolfieListModule, listItemModule, storageModule
    ] = await Promise.all([
        import('../../public/js/model/WolfieListsModel.js'),
        import('../../public/js/view/HomeView.js'),
        import('../../public/js/view/ListView.js'),
        import('../../public/js/view/modals/ItemModal.js'),
        import('../../public/js/view/modals/ConfirmModal.js'),
        import('../../public/js/view/modals/AlertModal.js'),
        import('../../public/js/view/modals/Modal.js'),
        import('../../public/js/controller/AppController.js'),
        import('../../public/js/model/WolfieList.js'),
        import('../../public/js/model/ListItem.js'),
        import('../../public/js/data/DataStorageManager.js')
    ]);

    return {
        WolfieListsModel: modelModule.WolfieListsModel,
        HomeView: homeViewModule.HomeView,
        ListView: listViewModule.ListView,
        ItemModal: itemModalModule.ItemModal,
        ConfirmModal: confirmModalModule.ConfirmModal,
        AlertModal: alertModalModule.AlertModal,
        Modal: modalModule.Modal,
        AppController: controllerModule.AppController,
        WolfieList: wolfieListModule.WolfieList,
        ListItem: listItemModule.ListItem,
        DataStorageManager: storageModule.DataStorageManager,
        StorageError: storageModule.StorageError
    };
}

/**
 * Builds the whole object graph exactly as main.js does and starts it.
 *
 * Keeping this in step with main.js by hand is a small cost worth paying: a test
 * that imported main.js could not choose when the application starts, could not
 * seed local storage first, and could not get hold of the individual pieces
 * afterwards.
 *
 * @param {Object} options
 * @param {boolean} options.start whether to await controller.start(), which is
 * what loads the lists and puts the home screen up. Pass false when the test
 * wants to subscribe to something before loading happens.
 * @return {Promise<Object>} every piece of the running application
 */
export async function bootApplication({ start = true } = {}) {
    mountIndexHtml();

    const classes = await importApp();

    const model = new classes.WolfieListsModel();
    const homeView = new classes.HomeView(model);
    const listView = new classes.ListView(model);
    const itemModal = new classes.ItemModal();
    const confirmModal = new classes.ConfirmModal();
    const alertModal = new classes.AlertModal();
    const controller = new classes.AppController(
        model, homeView, listView, itemModal, confirmModal, alertModal);

    if (start) await controller.start();

    return { ...classes, model, homeView, listView, itemModal, confirmModal, alertModal, controller };
}

/**
 * Builds the model and the two views, and deliberately leaves the controller out.
 *
 * This is the right harness for testing a view, because it isolates the half of
 * the Observer pattern under test. With no controller subscribed, clicking a
 * delete button announces DELETE_LIST_REQUESTED and then nothing else happens: no
 * modal opens, nothing is deleted. That is precisely the behavior we want to
 * assert, and it is only visible when the view is on its own.
 *
 * Seed local storage before calling this, i.e. with seedStorage() from
 * tests/helpers/fixtures.js, since the model loads as part of the setup.
 *
 * @return {Promise<Object>} the model, the two views, and the classes
 */
export async function bootViews() {
    mountIndexHtml();

    const classes = await importApp();

    const model = new classes.WolfieListsModel();
    const homeView = new classes.HomeView(model);
    const listView = new classes.ListView(model);

    // the views observe the model, exactly as main.js arranges
    model.subscribe(homeView);
    model.subscribe(listView);

    await model.load();

    return { ...classes, model, homeView, listView };
}

/**
 * Stands in for the network while the model fetches its starter lists.
 *
 * DataStorageManager resolves the file against import.meta.url, which under Node
 * is a file:// url, and Node's fetch refuses to open those. So a test that wants
 * to watch a brand new user's first ever visit has to supply the answer itself.
 *
 * @param {Object|null} json what the file should appear to contain, or null to
 * make the request fail with a 404
 */
export function stubStarterListsFetch(json) {
    const response = (json === null)
        ? { ok: false, status: 404, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => json };

    const fetchStub = vi.fn(async () => response);
    vi.stubGlobal('fetch', fetchStub);
    return fetchStub;
}

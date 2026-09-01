/**
 * main.js
 *
 * Where the application starts. This file has exactly one job, which is to build
 * the objects and hand each one whatever it needs, and then get out of the way.
 * There is no application logic here at all, and there should not be.
 *
 * Read it as a picture of how the program fits together:
 *
 *     WolfieListsModel ......... the lists, the open list, the undo stack
 *          |                     (a Subject, watched by both views)
 *     HomeView, ListView ....... draw the model, report what the user did
 *     three Modals ............. ask and tell, report what the user chose
 *          |
 *     AppController ............ hears all of the above and decides what happens
 *
 * The model is built first because everything else needs it, and the controller
 * is built last because it needs everything else. Notice that no view ever
 * receives another view, and the model receives nothing at all. Those absences
 * are the whole design.
 */
import { WolfieListsModel } from './model/WolfieListsModel.js';
import { HomeView } from './view/HomeView.js';
import { ListView } from './view/ListView.js';
import { ItemModal } from './view/modals/ItemModal.js';
import { ConfirmModal } from './view/modals/ConfirmModal.js';
import { AlertModal } from './view/modals/AlertModal.js';
import { AppController } from './controller/AppController.js';

const model = new WolfieListsModel();

const homeView = new HomeView(model);
const listView = new ListView(model);

const itemModal = new ItemModal();
const confirmModal = new ConfirmModal();
const alertModal = new AlertModal();

const controller = new AppController(
    model, homeView, listView, itemModal, confirmModal, alertModal);

// starting is asynchronous because a first ever visit fetches the example lists.
// Top level await is legal inside a module, which is one more reason everything
// here is loaded with type="module".
await controller.start();

// handy while developing: from the browser console you can poke at the running
// application, i.e. wolfie.model.getLists()
window.wolfie = { model, homeView, listView, itemModal, confirmModal, alertModal, controller };

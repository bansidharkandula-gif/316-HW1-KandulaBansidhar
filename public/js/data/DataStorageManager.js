/**
 * DataStorageManager.js
 *
 * Everything to do with where lists come from and where they go. There are two
 * sources, and this one class owns both of them:
 *
 *   local storage      what the user saved on a previous visit
 *   starter_lists.json the example lists a brand new user is given
 *
 * They are kept together deliberately. Both answer the single question "where do
 * lists come from", and in a later assignment both are replaced by calls to the
 * same real server. Keeping them in one class means that replacement is one file
 * to rewrite rather than two, and the model never has to know which of the two a
 * list arrived from.
 *
 * SINGLETON DESIGN PATTERN
 * ------------------------
 * Every read from and every write to storage in this entire application goes
 * through this one object. There is exactly one of it, you get hold of it by
 * calling DataStorageManager.getInstance(), and the constructor refuses to run
 * any other way.
 *
 * Why insist on a single instance? Because local storage is a single shared
 * resource. If two different objects each kept their own copy of the lists and
 * each wrote whenever it felt like it, the last writer would silently erase the
 * other's work. Funnelling everything through one object also means that when we
 * replace local storage with a real server, there is exactly one file to rewrite.
 */
import { WolfieList } from '../model/WolfieList.js';

/**
 * Thrown when storage cannot be read or written. The application catches this
 * and shows the user an informative modal rather than dying silently.
 */
export class StorageError extends Error {
    constructor(message, cause = null) {
        super(message);
        this.name = 'StorageError';
        this.cause = cause;
    }
}

export class DataStorageManager {
    // the one and only instance, plus the latch that lets the constructor run
    static #instance = null;
    static #constructionIsAllowed = false;

    /** the key everything is stored under, versioned so a later assignment can
     *  recognize and migrate data written by this one */
    static STORAGE_KEY = 'cse316.wolfie-lists.v2';

    /** where we stash a payload we could not parse, so that a student's data is
     *  never simply thrown away when something goes wrong */
    static QUARANTINE_KEY = 'cse316.wolfie-lists.unreadable';

    /**
     * The example lists, resolved against this module's own location rather than
     * against the page, so the path stays correct no matter what url the
     * application is served at.
     */
    static STARTER_FILE_URL = new URL('../../data/starter_lists.json', import.meta.url);

    constructor() {
        if (!DataStorageManager.#constructionIsAllowed) {
            throw new Error(
                'DataStorageManager is a singleton, use DataStorageManager.getInstance() instead of new');
        }
        DataStorageManager.#constructionIsAllowed = false;
    }

    /**
     * The only way to get hold of this object. The first call builds it, every
     * call after that hands back the same one.
     *
     * @return {DataStorageManager}
     */
    static getInstance() {
        if (DataStorageManager.#instance === null) {
            DataStorageManager.#constructionIsAllowed = true;
            DataStorageManager.#instance = new DataStorageManager();
        }
        return DataStorageManager.#instance;
    }

    // -------------------------------------------------------------------------
    // local storage, i.e. what the user saved last time
    // -------------------------------------------------------------------------

    /**
     * Local storage is not always there. Browsers in certain privacy modes have
     * been known to define it and then throw the moment you touch it, so we test
     * it by actually using it.
     *
     * @return {boolean}
     */
    isAvailable() {
        try {
            const probe = '__wolfie_probe__';
            window.localStorage.setItem(probe, probe);
            window.localStorage.removeItem(probe);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Has this browser ever saved anything for Wolfie Lists?
     *
     * Note that this is a different question from "are there any lists". A user
     * who has deleted every list they had still has saved data, an empty
     * collection of lists, and that is a decision of theirs we must respect. Only
     * a browser that has never run this application at all gets the example lists.
     *
     * @return {boolean}
     */
    hasSavedData() {
        try {
            return window.localStorage.getItem(DataStorageManager.STORAGE_KEY) !== null;
        } catch {
            return false;
        }
    }

    /**
     * Reads every saved list back out of local storage.
     *
     * @return {WolfieList[]} the saved lists, or an empty array on a first run
     * @throws {StorageError} if something is there but cannot be understood
     */
    loadLists() {
        let raw;
        try {
            raw = window.localStorage.getItem(DataStorageManager.STORAGE_KEY);
        } catch (error) {
            throw new StorageError('This browser will not let us read local storage.', error);
        }

        // nothing saved yet is a perfectly normal first run, not an error
        if (raw === null || raw.trim() === '') return [];

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (error) {
            this.#quarantine(raw);
            throw new StorageError(
                'Your saved lists could not be read and have been set aside. Starting with an empty home screen.',
                error);
        }

        const rawLists = DataStorageManager.#listsWithin(parsed);
        if (rawLists === null) {
            this.#quarantine(raw);
            throw new StorageError(
                'Your saved data was not in the expected format and has been set aside. Starting with an empty home screen.');
        }

        // every list rebuilds itself, cleaning up anything malformed as it goes
        return rawLists.map((listJSON) => WolfieList.fromJSON(listJSON));
    }

    /**
     * Writes every list to local storage, replacing whatever was there.
     *
     * @param {WolfieList[]} lists
     * @throws {StorageError} if the write fails, i.e. the quota is full
     */
    saveLists(lists) {
        const payload = {
            version: 2,
            savedAt: new Date().toISOString(),
            lists: lists
        };
        try {
            window.localStorage.setItem(
                DataStorageManager.STORAGE_KEY, JSON.stringify(payload));
        } catch (error) {
            const isQuota = error?.name === 'QuotaExceededError'
                || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED';
            throw new StorageError(
                isQuota
                    ? 'There is no room left in local storage, so your most recent change could not be saved. Try deleting a list you no longer need.'
                    : 'Your most recent change could not be saved to local storage.',
                error);
        }
    }

    /**
     * Throws away everything this application has stored. Nothing in the user
     * interface calls this, it is here for you to use from the browser console
     * while testing:
     *
     *     DataStorageManager.getInstance().clear()
     */
    clear() {
        try {
            window.localStorage.removeItem(DataStorageManager.STORAGE_KEY);
            window.localStorage.removeItem(DataStorageManager.QUARANTINE_KEY);
        } catch (error) {
            throw new StorageError('Storage could not be cleared.', error);
        }
    }

    // -------------------------------------------------------------------------
    // the example lists, i.e. what a brand new user is given
    // -------------------------------------------------------------------------

    /**
     * Fetches the example lists that a brand new user is given the very first
     * time they open Wolfie Lists, so that the home screen has something on it to
     * click. This is the only method in the application that talks to the network.
     *
     * The starter file deliberately carries no ids. Every list and every item
     * that comes out of it is given a fresh one on the way in, which is what
     * stops two items from ever sharing an id if the file were somehow read twice.
     *
     * @return {Promise<WolfieList[]>} the example lists
     * @throws {Error} if the file cannot be fetched, or is not what we expect
     */
    async loadStarterLists() {
        const response = await fetch(DataStorageManager.STARTER_FILE_URL);
        if (!response.ok) {
            throw new Error(
                `The server answered ${response.status} for ${DataStorageManager.STARTER_FILE_URL.pathname}`);
        }

        const parsed = await response.json();

        const rawLists = DataStorageManager.#listsWithin(parsed);
        if (rawLists === null) {
            throw new Error('The example lists file does not contain a list of lists');
        }

        return rawLists.map((listJSON) => WolfieList.fromJSON(listJSON));
    }

    // -------------------------------------------------------------------------
    // shared by both sources
    // -------------------------------------------------------------------------

    /**
     * Both sources are allowed to be either a bare array of lists or an object
     * with a lists property, which is what keeps the saved payload and the
     * example file swappable. Now that one class reads both, they cannot drift.
     *
     * @param {*} parsed whatever came back from JSON.parse or response.json()
     * @return {Object[]|null} the array of lists, or null if there is not one
     */
    static #listsWithin(parsed) {
        const rawLists = Array.isArray(parsed) ? parsed : parsed?.lists;
        return Array.isArray(rawLists) ? rawLists : null;
    }

    /**
     * Moves a payload we could not understand out of the way, but does not delete
     * it, so it can still be recovered by hand from the browser's dev tools.
     */
    #quarantine(raw) {
        try {
            window.localStorage.setItem(DataStorageManager.QUARANTINE_KEY, raw);
            window.localStorage.removeItem(DataStorageManager.STORAGE_KEY);
        } catch {
            // if even this fails there is nothing more we can do, and the
            // StorageError our caller is about to throw already says so
        }
    }
}

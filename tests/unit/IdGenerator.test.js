/**
 * IdGenerator.test.js
 *
 * Testing something whose entire job is to be different every time takes a
 * little thought. We cannot assert what an id will be, so instead we assert the
 * properties every id must have: it starts with the right prefix, and no two are
 * ever the same.
 *
 * The interesting test is the last one. IdGenerator has a fallback path for
 * browsers without crypto.randomUUID, and a fallback that is never exercised is
 * a fallback nobody knows is broken. We reach it by taking crypto away.
 */
import { describe, it, expect, vi } from 'vitest';
import { IdGenerator } from '../../public/js/common/IdGenerator.js';

describe('IdGenerator.next', () => {
    it('stamps the id with the prefix it was given', () => {
        expect(IdGenerator.next('item')).toMatch(/^item-/);
        expect(IdGenerator.next('list')).toMatch(/^list-/);
    });

    it('uses a generic prefix when none is given', () => {
        expect(IdGenerator.next()).toMatch(/^id-/);
    });

    it('never produces the same id twice', () => {
        const ids = new Set();
        for (let i = 0; i < 1000; i++) {
            ids.add(IdGenerator.next('item'));
        }
        expect(ids.size).toBe(1000);
    });

    it('produces a string that survives a trip through JSON', () => {
        // ids are stored in local storage as part of an item, so an id has to be
        // a plain string, not an object that stringifies into something else
        const id = IdGenerator.next('item');
        expect(typeof id).toBe('string');
        expect(JSON.parse(JSON.stringify({ id })).id).toBe(id);
    });

    describe('on a browser with no crypto.randomUUID', () => {
        // Every current browser has crypto.randomUUID, which is exactly why this
        // path needs a test: nothing else will ever run it.
        it('still produces unique prefixed ids', () => {
            vi.stubGlobal('crypto', {});

            const ids = new Set();
            for (let i = 0; i < 200; i++) {
                ids.add(IdGenerator.next('item'));
            }

            expect(ids.size).toBe(200);
            for (const id of ids) {
                expect(id).toMatch(/^item-[a-z0-9]+-[a-z0-9]+$/);
            }
        });

        it('survives crypto being missing altogether', () => {
            vi.stubGlobal('crypto', undefined);
            expect(IdGenerator.next('list')).toMatch(/^list-/);
        });
    });
});

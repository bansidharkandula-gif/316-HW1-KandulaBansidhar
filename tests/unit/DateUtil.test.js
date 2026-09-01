/**
 * DateUtil.test.js
 *
 * DateUtil exists because of one specific bug, and the first block below is the
 * test that proves the bug is not there. Everything else in the class is small
 * enough that its tests are short.
 *
 * The time zone is pinned to America/New_York in vitest.config.js. Without that
 * the headline test would pass in London and fail in New York, which is a
 * thoroughly unpleasant thing to hand a class of two hundred students.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { DateUtil } from '../../public/js/common/DateUtil.js';

describe('DateUtil.toISODate', () => {
    // ------------------------------------------------------------------------
    // the bug this class exists to avoid
    // ------------------------------------------------------------------------
    it('uses the local calendar date, not the UTC one, late in the evening', () => {
        // 11:30pm on the fourth of September, in New York
        const lateEvening = new Date(2026, 8, 4, 23, 30, 0);

        // this is the tempting one-liner, and this is why it is wrong: New York
        // in September is four hours behind UTC, so by UTC it is already the
        // fifth. An item entered at 11:30pm would be stamped with tomorrow.
        expect(lateEvening.toISOString().slice(0, 10)).toBe('2026-09-05');

        // DateUtil builds the string out of the local fields instead
        expect(DateUtil.toISODate(lateEvening)).toBe('2026-09-04');
    });

    it('agrees with toISOString at midday, when the two cannot differ', () => {
        const midday = new Date(2026, 8, 4, 12, 0, 0);
        expect(DateUtil.toISODate(midday)).toBe('2026-09-04');
    });

    it('pads single digit months and days to two characters', () => {
        expect(DateUtil.toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
        expect(DateUtil.toISODate(new Date(2026, 10, 9))).toBe('2026-11-09');
    });

    it('handles the last day of a leap February', () => {
        expect(DateUtil.toISODate(new Date(2028, 1, 29))).toBe('2028-02-29');
    });
});

describe('DateUtil.today', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('reports the current local date', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 4, 9, 15, 0));
        expect(DateUtil.today()).toBe('2026-09-04');
    });

    it('still reports today, not tomorrow, just before local midnight', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 4, 23, 59, 59));
        expect(DateUtil.today()).toBe('2026-09-04');
    });
});

describe('DateUtil.isValid', () => {
    it('accepts a well formed date string', () => {
        expect(DateUtil.isValid('2026-09-04')).toBe(true);
    });

    it.each([
        ['a Date object', new Date()],
        ['null', null],
        ['undefined', undefined],
        ['a number', 20260904],
        ['the wrong separator', '2026/09/04'],
        ['a single digit month', '2026-9-04'],
        ['a two digit year', '26-09-04'],
        ['an empty string', ''],
        ['trailing text', '2026-09-04T00:00:00Z']
    ])('rejects %s', (_description, value) => {
        expect(DateUtil.isValid(value)).toBe(false);
    });

    // This test documents what the class actually does rather than what one
    // might assume it does. isValid checks the SHAPE of the string, not whether
    // that date exists on a calendar. Nothing in the application can produce a
    // month of 13, because the only two sources are an <input type="date"> and
    // DateUtil.toISODate, so shape is enough. Writing the test anyway means the
    // next person to read the class learns the limit without having to guess.
    it('checks the shape of the string, not whether the date is real', () => {
        expect(DateUtil.isValid('2026-13-45')).toBe(true);
    });
});

describe('DateUtil.format', () => {
    it('turns a stored date into the American display format', () => {
        expect(DateUtil.format('2026-09-04')).toBe('09/04/2026');
    });

    it('shows the placeholder when there is no date at all', () => {
        // an item nobody has given a target date has a null targetDate, and this
        // is the em dash the item card shows in that column
        expect(DateUtil.format(null)).toBe('—');
    });

    it('shows the placeholder for anything malformed', () => {
        expect(DateUtil.format('not a date')).toBe('—');
        expect(DateUtil.format(undefined)).toBe('—');
    });

    it('lets the caller choose their own placeholder', () => {
        expect(DateUtil.format(null, 'Not done')).toBe('Not done');
    });
});

describe('DateUtil.clean', () => {
    // clean is the gate everything crossing into the model goes through, so
    // that a hand edited local storage entry cannot put rubbish into an item
    it('passes a valid date straight through', () => {
        expect(DateUtil.clean('2026-09-04')).toBe('2026-09-04');
    });

    it.each([
        ['not a date'],
        [''],
        [null],
        [undefined],
        [12345]
    ])('turns %o into null', (value) => {
        expect(DateUtil.clean(value)).toBeNull();
    });
});

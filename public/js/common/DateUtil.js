/**
 * DateUtil.js
 *
 * Dates in this application are stored as plain YYYY-MM-DD strings rather than as
 * Date objects, for two reasons. First, that is exactly the format an
 * <input type="date"> speaks, so no conversion is needed at the boundary. Second,
 * it round trips through JSON.stringify perfectly, which matters a great deal
 * when everything we own lives in local storage.
 *
 * Beware of the classic bug this class exists to avoid: Date.toISOString()
 * converts to UTC first, so on the east coast anything after 8pm reports
 * tomorrow's date. We build the string out of the local fields instead.
 */
export class DateUtil {
    /**
     * @param {Date} date
     * @return {string} that date as YYYY-MM-DD in the user's own time zone
     */
    static toISODate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * @return {string} today, as YYYY-MM-DD, in local time
     */
    static today() {
        return DateUtil.toISODate(new Date());
    }

    /**
     * @param {string|null} isoDate a YYYY-MM-DD string, or null
     * @param {string} whenEmpty what to show when there is no date at all
     * @return {string} the date formatted for display, i.e. 08/20/2026
     */
    static format(isoDate, whenEmpty = '—') {
        if (!DateUtil.isValid(isoDate)) return whenEmpty;
        const [year, month, day] = isoDate.split('-');
        return `${month}/${day}/${year}`;
    }

    /**
     * @param {*} value
     * @return {boolean} true if this is a well formed YYYY-MM-DD string
     */
    static isValid(value) {
        return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
    }

    /**
     * Normalizes anything we might read out of local storage, or out of an input
     * control, into either a valid YYYY-MM-DD string or null.
     */
    static clean(value) {
        return DateUtil.isValid(value) ? value : null;
    }
}

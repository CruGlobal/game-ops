/**
 * US federal holidays, computed per year (no data to maintain).
 *
 * Returns the *observed* dates (the weekday offices are closed): a Saturday
 * holiday is observed the preceding Friday, a Sunday holiday the following
 * Monday. Used by the streak logic so a federal holiday does not break a streak,
 * the same way weekends don't.
 *
 * The 11 federal holidays: New Year's Day, MLK Jr. Day, Washington's Birthday,
 * Memorial Day, Juneteenth, Independence Day, Labor Day, Columbus Day,
 * Veterans Day, Thanksgiving, Christmas.
 */

const cache = new Map(); // year -> Set<'YYYY-MM-DD'>

function pad(n) { return n < 10 ? '0' + n : '' + n; }
function key(y, m0, d) { return y + '-' + pad(m0 + 1) + '-' + pad(d); }

// Day-of-month of the Nth given weekday (0=Sun..6=Sat) in a month.
function nthWeekday(year, month0, weekday, n) {
    const firstDow = new Date(Date.UTC(year, month0, 1)).getUTCDay();
    const offset = (weekday - firstDow + 7) % 7;
    return 1 + offset + (n - 1) * 7;
}

// Day-of-month of the last given weekday in a month.
function lastWeekday(year, month0, weekday) {
    const last = new Date(Date.UTC(year, month0 + 1, 0));
    const offset = (last.getUTCDay() - weekday + 7) % 7;
    return last.getUTCDate() - offset;
}

// Observed key for a fixed-date holiday: shift off the weekend.
function observed(year, month0, day) {
    const dt = new Date(Date.UTC(year, month0, day));
    const dow = dt.getUTCDay();
    if (dow === 6) dt.setUTCDate(day - 1);       // Saturday -> Friday
    else if (dow === 0) dt.setUTCDate(day + 1);  // Sunday -> Monday
    return key(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
}

function buildYear(year) {
    const s = new Set();
    s.add(observed(year, 0, 1));                       // New Year's Day
    s.add(key(year, 0, nthWeekday(year, 0, 1, 3)));    // MLK — 3rd Mon Jan
    s.add(key(year, 1, nthWeekday(year, 1, 1, 3)));    // Washington — 3rd Mon Feb
    s.add(key(year, 4, lastWeekday(year, 4, 1)));      // Memorial — last Mon May
    s.add(observed(year, 5, 19));                      // Juneteenth
    s.add(observed(year, 6, 4));                       // Independence Day
    s.add(key(year, 8, nthWeekday(year, 8, 1, 1)));    // Labor — 1st Mon Sep
    s.add(key(year, 9, nthWeekday(year, 9, 1, 2)));    // Columbus — 2nd Mon Oct
    s.add(observed(year, 10, 11));                     // Veterans Day
    s.add(key(year, 10, nthWeekday(year, 10, 4, 4)));  // Thanksgiving — 4th Thu Nov
    s.add(observed(year, 11, 25));                     // Christmas

    // When Jan 1 of the NEXT year falls on a Saturday, its observed holiday is Dec 31 of
    // THIS year. buildYear(year + 1) files that key under year + 1, but
    // isUSFederalHoliday looks the date up in the set for the date's own year — so a
    // Dec 31 observance was filed in one year's set and searched for in another's, and
    // never found. Seed it here as well.
    const nextNewYearObserved = observed(year + 1, 0, 1);
    if (nextNewYearObserved.startsWith(`${year}-`)) {
        s.add(nextNewYearObserved);
    }

    return s;
}

function holidaysFor(year) {
    if (!cache.has(year)) cache.set(year, buildYear(year));
    return cache.get(year);
}

/**
 * True if `date` is an observed US federal holiday. Compares calendar
 * Y-M-D (local components), so it's timezone-agnostic for a given calendar day.
 * @param {Date} date
 * @returns {boolean}
 */
export function isUSFederalHoliday(date) {
    const y = date.getFullYear();
    return holidaysFor(y).has(key(y, date.getMonth(), date.getDate()));
}

/** A non-working day = weekend or federal holiday. */
export function isNonWorkingDay(date) {
    const dow = date.getDay();
    return dow === 0 || dow === 6 || isUSFederalHoliday(date);
}

/**
 * Workdays in a normal week, and so the ceiling on a streak: a streak counts the workdays
 * contributed in the current week. A week holding a federal holiday holds fewer -- use
 * `countWorkingDays` for a specific window rather than assuming this number.
 *
 * It lives here, beside the working-day calendar itself, so the streak engine and the
 * reward configs read one definition instead of each keeping their own.
 */
export const FULL_WORKWEEK = 5;

/**
 * Local midnight on the Monday that starts `date`'s week. Saturday and Sunday
 * belong to the week they followed, not the one about to begin.
 *
 * This is the boundary a streak resets on, and it is deliberately the same
 * boundary the Monday challenge cron uses, so a streak tally and the
 * `Streak Builder` target it feeds always describe the same seven days.
 *
 * @param {Date} date
 * @returns {Date}
 */
export function startOfWorkWeek(date) {
    const monday = new Date(date);
    monday.setHours(0, 0, 0, 0);
    // getDay(): 0=Sun..6=Sat. Sunday is 6 days into its week, not 1 day before the next.
    const daysSinceMonday = (monday.getDay() + 6) % 7;
    monday.setDate(monday.getDate() - daysSinceMonday);
    return monday;
}

/**
 * Count the working days a challenge window spans: start inclusive, end
 * exclusive, compared by calendar day so the time of day never matters.
 *
 * This is the ceiling on a streak inside the window, since streaks only count
 * working days.
 *
 * @param {Date} startDate - inclusive
 * @param {Date} endDate - exclusive
 * @returns {Number} 0 if the window is empty or inverted
 */
export function countWorkingDays(startDate, endDate) {
    const current = new Date(startDate);
    current.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    let workingDays = 0;
    while (current < end) {
        if (!isNonWorkingDay(current)) workingDays++;
        current.setDate(current.getDate() + 1);
    }
    return workingDays;
}

/**
 * What to call a period in copy, read from its own label rather than the
 * configured system: the tertile system has run both kinds since Cru retired
 * tertiles (2027-T1, then 2027-Q2).
 *
 * Kept out of quarterlyService.js because billsService.js must not import it.
 * public/leaderboard-client.js repeats the regex for the winners banner.
 *
 * @param {String} label - e.g. "2027-T1" or "2027-Q2"
 * @returns {String} "Tertile" or "Quarter"
 */
export function periodNoun(label) {
    return /-T\d$/.test(label) ? 'Tertile' : 'Quarter';
}

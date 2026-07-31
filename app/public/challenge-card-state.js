/**
 * Decide everything a challenge card displays.
 *
 * Assigned to globalThis rather than exported: challenges.ejs loads this with a
 * plain <script src>, and the page serves a per-request CSP nonce that does not
 * propagate to statically imported ES modules. Jest imports the file for this
 * side effect and reads the function off globalThis.
 *
 * @param {Object} challenge - Challenge record (needs `target`)
 * @param {Array} participants - The challenge's participants
 * @param {String} username - The viewing user, or null when anonymous
 * @returns {Object} { hasJoined, progress, target, percent, completed, engaged, enrolled }
 */
globalThis.challengeCardState = function challengeCardState(challenge, participants, username) {
    const roster = participants || [];

    const mine = roster.find(
        p => p.username === username || p.contributor?.username === username
    );

    const target = challenge.target || 0;
    const progress = mine?.progress ?? 0;

    return {
        hasJoined: !!mine,
        progress,
        target,
        // Progress keeps accruing while the challenge is open, so it can exceed
        // the target. The label shows the true count; the bar stops at full.
        percent: target > 0 ? Math.min(progress / target * 100, 100) : 0,
        completed: !!mine?.completed,
        engaged: roster.filter(p => p.progress > 0).length,
        enrolled: roster.length
    };
};

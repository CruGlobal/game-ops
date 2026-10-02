import { FULL_WORKWEEK } from '../utils/holidays.js';

// A review is worth the same as a merged PR with no recognized label. One constant so
// the two cannot drift apart.
const DEFAULT_PR_POINTS = 40;

export const POINT_VALUES = {
    // Label-based PR points
    'bug': 50,
    'feature': 100,
    'enhancement': 75,
    'documentation': 30,
    'refactor': 60,
    'hotfix': 80,
    'default': DEFAULT_PR_POINTS, // PRs without recognized labels

    // Review points: flat, whatever the reviewed PR's labels, and no streak bonus
    'review': DEFAULT_PR_POINTS,

    // Streak bonus (multiplier). One tier, at a full workweek: a streak counts the
    // workdays contributed in the current week, so there is no longer any chain to pay
    // compounding points for. The old 30/90/365-day tiers topped out at double points
    // for never taking a day off.
    'streak-workweek': 1.1 // 10% bonus
};

// What a review paid before it rose to match an unlabeled PR, and the start of the
// period (2027-T1) it rose in. A review's value follows when it was submitted, not when
// it is credited, so a late credit (a backfill, or the 6-hour catch-up finding a missed
// webhook) or a Hall of Fame rebuild cannot put 40-point reviews into a period whose
// other reviews paid 15.
export const LEGACY_REVIEW_POINTS = 15;
export const REVIEW_POINTS_RAISED_AT = new Date('2026-10-01T00:00:00.000Z');

export const reviewPointsAt = (submittedAt) => {
    const at = submittedAt ? new Date(submittedAt) : new Date();
    return at < REVIEW_POINTS_RAISED_AT ? LEGACY_REVIEW_POINTS : POINT_VALUES.review;
};

// Re-exported rather than redeclared: the ceiling is one number, defined beside the
// working-day calendar in utils/holidays.js.
export { FULL_WORKWEEK };

export const POINT_REASONS = {
    PR_MERGED: 'PR Merged',
    REVIEW_COMPLETED: 'Review Completed',
    CHALLENGE_COMPLETED: 'Challenge Completed',
    STREAK_BONUS: 'Streak Bonus',
    ACHIEVEMENT_UNLOCKED: 'Achievement Unlocked'
};

// Label detection helper
export const detectPRType = (labels) => {
    if (!labels || labels.length === 0) return 'default';

    const labelNames = labels.map(l =>
        typeof l === 'string' ? l.toLowerCase() : l.name.toLowerCase()
    );

    // Priority order: hotfix > bug > feature > enhancement > refactor > documentation
    if (labelNames.some(l => l.includes('hotfix'))) return 'hotfix';
    if (labelNames.some(l => l.includes('bug') || l.includes('fix'))) return 'bug';
    if (labelNames.some(l => l.includes('feature'))) return 'feature';
    if (labelNames.some(l => l.includes('enhancement') || l.includes('improve'))) return 'enhancement';
    if (labelNames.some(l => l.includes('refactor'))) return 'refactor';
    if (labelNames.some(l => l.includes('doc') || l.includes('documentation'))) return 'documentation';

    return 'default';
};

export const calculatePRPoints = (labels, currentStreak = 0) => {
    const prType = detectPRType(labels);
    let basePoints = POINT_VALUES[prType];

    // Apply streak multiplier. A holiday week caps the streak at 4, so the bonus is not
    // reachable that week; the alternative, paying it at 4, would hand it out for a
    // four-day week in every other week of the year.
    const multiplier = currentStreak >= FULL_WORKWEEK ? POINT_VALUES['streak-workweek'] : 1.0;

    return Math.round(basePoints * multiplier);
};

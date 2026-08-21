export const POINT_VALUES = {
    // Label-based PR points
    'bug': 50,
    'feature': 100,
    'enhancement': 75,
    'documentation': 30,
    'refactor': 60,
    'hotfix': 80,
    'default': 40, // PRs without recognized labels

    // Review points
    'review': 15,

    // Streak bonus (multiplier). One tier, at a full workweek: a streak counts the
    // workdays contributed in the current week, so there is no longer any chain to pay
    // compounding points for. The old 30/90/365-day tiers topped out at double points
    // for never taking a day off.
    'streak-workweek': 1.1 // 10% bonus
};

/** Workdays in a normal week — the most a streak can reach. */
export const FULL_WORKWEEK = 5;

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

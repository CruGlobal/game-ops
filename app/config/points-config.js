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

    // Streak bonuses (multipliers)
    'streak-7': 1.1,   // 10% bonus
    'streak-30': 1.25, // 25% bonus
    'streak-90': 1.5,  // 50% bonus
    'streak-365': 2.0  // 100% bonus (double points)
};

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

    // Apply streak multiplier
    let multiplier = 1.0;
    if (currentStreak >= 365) multiplier = POINT_VALUES['streak-365'];
    else if (currentStreak >= 90) multiplier = POINT_VALUES['streak-90'];
    else if (currentStreak >= 30) multiplier = POINT_VALUES['streak-30'];
    else if (currentStreak >= 7) multiplier = POINT_VALUES['streak-7'];

    return Math.round(basePoints * multiplier);
};

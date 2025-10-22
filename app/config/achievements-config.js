export const ACHIEVEMENTS = {
    // PR Milestones (existing badges + new)
    'first-pr': {
        id: 'first-pr',
        name: 'First Steps',
        description: 'Merged your first PR',
        category: 'pr-milestone',
        threshold: 1,
        points: 50
    },
    'pr-10': {
        id: 'pr-10',
        name: 'Getting Started',
        description: 'Merged 10 PRs',
        category: 'pr-milestone',
        threshold: 10,
        points: 100
    },
    'pr-50': {
        id: 'pr-50',
        name: 'Contributor',
        description: 'Merged 50 PRs',
        category: 'pr-milestone',
        threshold: 50,
        points: 250
    },
    'pr-100': {
        id: 'pr-100',
        name: 'Dedicated',
        description: 'Merged 100 PRs',
        category: 'pr-milestone',
        threshold: 100,
        points: 500
    },
    'pr-500': {
        id: 'pr-500',
        name: 'Elite',
        description: 'Merged 500 PRs',
        category: 'pr-milestone',
        threshold: 500,
        points: 1000
    },
    'pr-1000': {
        id: 'pr-1000',
        name: 'Legend',
        description: 'Merged 1000 PRs',
        category: 'pr-milestone',
        threshold: 1000,
        points: 2000
    },

    // Streak Achievements
    'streak-7': {
        id: 'streak-7',
        name: 'Week Warrior',
        description: 'Maintain a 7-day contribution streak',
        category: 'streak',
        threshold: 7,
        points: 100
    },
    'streak-30': {
        id: 'streak-30',
        name: 'Monthly Master',
        description: 'Maintain a 30-day contribution streak',
        category: 'streak',
        threshold: 30,
        points: 300
    },
    'streak-90': {
        id: 'streak-90',
        name: 'Quarter Champion',
        description: 'Maintain a 90-day contribution streak',
        category: 'streak',
        threshold: 90,
        points: 750
    },
    'streak-365': {
        id: 'streak-365',
        name: 'Year-Long Hero',
        description: 'Maintain a 365-day contribution streak',
        category: 'streak',
        threshold: 365,
        points: 2000
    },

    // Review Achievements
    'reviews-10': {
        id: 'reviews-10',
        name: 'Helpful Reviewer',
        description: 'Complete 10 code reviews',
        category: 'review',
        threshold: 10,
        points: 75
    },
    'reviews-50': {
        id: 'reviews-50',
        name: 'Review Expert',
        description: 'Complete 50 code reviews',
        category: 'review',
        threshold: 50,
        points: 200
    },
    'reviews-100': {
        id: 'reviews-100',
        name: 'Review Master',
        description: 'Complete 100 code reviews',
        category: 'review',
        threshold: 100,
        points: 400
    },

    // Point Achievements
    'points-1000': {
        id: 'points-1000',
        name: 'Point Collector',
        description: 'Earn 1,000 total points',
        category: 'points',
        threshold: 1000,
        points: 100
    },
    'points-5000': {
        id: 'points-5000',
        name: 'Point Hoarder',
        description: 'Earn 5,000 total points',
        category: 'points',
        threshold: 5000,
        points: 300
    },
    'points-10000': {
        id: 'points-10000',
        name: 'Point Master',
        description: 'Earn 10,000 total points',
        category: 'points',
        threshold: 10000,
        points: 500
    },

    // Challenge Achievements
    'challenge-1': {
        id: 'challenge-1',
        name: 'Challenge Accepted',
        description: 'Complete your first challenge',
        category: 'challenge',
        threshold: 1,
        points: 100
    },
    'challenge-5': {
        id: 'challenge-5',
        name: 'Challenge Seeker',
        description: 'Complete 5 challenges',
        category: 'challenge',
        threshold: 5,
        points: 250
    },
    'challenge-10': {
        id: 'challenge-10',
        name: 'Challenge Champion',
        description: 'Complete 10 challenges',
        category: 'challenge',
        threshold: 10,
        points: 500
    }
};

export const checkAchievements = (contributor) => {
    const newAchievements = [];
    // Safeguard against undefined achievements arrays
    const earnedIds = new Set((contributor.achievements || []).map(a => a.achievementId));

    // Check PR milestones
    const prAchievements = ['first-pr', 'pr-10', 'pr-50', 'pr-100', 'pr-500', 'pr-1000'];
    for (const achId of prAchievements) {
        const ach = ACHIEVEMENTS[achId];
        if (!earnedIds.has(achId) && contributor.prCount >= ach.threshold) {
            newAchievements.push(ach);
        }
    }

    // Check streak achievements
    const streakAchievements = ['streak-7', 'streak-30', 'streak-90', 'streak-365'];
    for (const achId of streakAchievements) {
        const ach = ACHIEVEMENTS[achId];
        if (!earnedIds.has(achId) && contributor.currentStreak >= ach.threshold) {
            newAchievements.push(ach);
        }
    }

    // Check review achievements
    const reviewAchievements = ['reviews-10', 'reviews-50', 'reviews-100'];
    for (const achId of reviewAchievements) {
        const ach = ACHIEVEMENTS[achId];
        if (!earnedIds.has(achId) && contributor.reviewCount >= ach.threshold) {
            newAchievements.push(ach);
        }
    }

    // Check point achievements
    const pointAchievements = ['points-1000', 'points-5000', 'points-10000'];
    for (const achId of pointAchievements) {
        const ach = ACHIEVEMENTS[achId];
        if (!earnedIds.has(achId) && contributor.totalPoints >= ach.threshold) {
            newAchievements.push(ach);
        }
    }

    // Check challenge achievements
    const challengeCount = contributor.completedChallenges?.length || 0;
    const challengeAchievements = ['challenge-1', 'challenge-5', 'challenge-10'];
    for (const achId of challengeAchievements) {
        const ach = ACHIEVEMENTS[achId];
        if (!earnedIds.has(achId) && challengeCount >= ach.threshold) {
            newAchievements.push(ach);
        }
    }

    return newAchievements;
};

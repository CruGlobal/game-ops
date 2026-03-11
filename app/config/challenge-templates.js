const templates = [
    // Weekly templates (matching existing auto-generation patterns)
    {
        id: 'weekly-pr-easy',
        name: 'Weekly PR Sprint (Easy)',
        category: 'weekly',
        type: 'pr-merge',
        title: 'Weekly PR Sprint',
        description: 'Merge PRs this week to earn bonus points!',
        target: 3,
        reward: 150,
        difficulty: 'easy',
        durationDays: 7
    },
    {
        id: 'weekly-review-medium',
        name: 'Weekly Review Blitz (Medium)',
        category: 'weekly',
        type: 'review',
        title: 'Code Review Blitz',
        description: 'Complete code reviews this week. Quality reviews help the whole team!',
        target: 5,
        reward: 200,
        difficulty: 'medium',
        durationDays: 7
    },
    {
        id: 'weekly-streak-hard',
        name: 'Weekly Streak Challenge (Hard)',
        category: 'weekly',
        type: 'streak',
        title: 'Streak Challenge',
        description: 'Maintain a contribution streak for the entire week!',
        target: 5,
        reward: 300,
        difficulty: 'hard',
        durationDays: 7
    },
    {
        id: 'weekly-points-medium',
        name: 'Weekly Points Race (Medium)',
        category: 'weekly',
        type: 'points',
        title: 'Points Race',
        description: 'Earn as many points as possible through PRs, reviews, and more!',
        target: 100,
        reward: 250,
        difficulty: 'medium',
        durationDays: 7
    },

    // Additional templates
    {
        id: 'first-steps',
        name: 'First Steps (Easy)',
        category: 'onboarding',
        type: 'pr-merge',
        title: 'First Steps',
        description: 'Get started by merging your first PR. Every journey begins with a single step!',
        target: 1,
        reward: 100,
        difficulty: 'easy',
        durationDays: 14
    },
    {
        id: 'review-blitz',
        name: 'Review Blitz (Hard)',
        category: 'team',
        type: 'review',
        title: 'Review Blitz',
        description: 'Help clear the review backlog! Complete 10 reviews to earn big rewards.',
        target: 10,
        reward: 400,
        difficulty: 'hard',
        durationDays: 14
    },
    {
        id: 'monthly-marathon',
        name: 'Monthly Marathon (Hard)',
        category: 'monthly',
        type: 'pr-merge',
        title: 'Monthly Marathon',
        description: 'Merge 20 PRs over the course of a month. Consistent effort wins the race!',
        target: 20,
        reward: 500,
        difficulty: 'hard',
        durationDays: 30
    },
    {
        id: 'points-sprint',
        name: 'Points Sprint (Medium)',
        category: 'team',
        type: 'points',
        title: 'Points Sprint',
        description: 'Earn 200 points through any combination of PRs, reviews, and bonuses.',
        target: 200,
        reward: 300,
        difficulty: 'medium',
        durationDays: 14
    },
    {
        id: '30-day-streak',
        name: '30-Day Streak (Hard)',
        category: 'monthly',
        type: 'streak',
        title: '30-Day Streak Challenge',
        description: 'Maintain a 30-day contribution streak. The ultimate test of consistency!',
        target: 30,
        reward: 500,
        difficulty: 'hard',
        durationDays: 45
    }
];

export const getTemplates = () => templates;

export const getTemplateById = (id) => templates.find(t => t.id === id);

export const getTemplatesByCategory = (category) =>
    templates.filter(t => t.category === category);

export const getTemplateCategories = () =>
    [...new Set(templates.map(t => t.category))];

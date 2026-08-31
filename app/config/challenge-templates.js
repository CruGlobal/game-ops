// Templates for the admin "create from template" picker. Nothing here is what the
// Monday cron generates: `generateWeeklyChallenges` in services/challengeService.js
// carries its own list, and the two DISAGREE by more than titles --
//
//   type      here (picker)                  there (what actually ships)
//   pr-merge  Weekly PR Sprint   3 / 150 easy    Sprint Master    5 / 250 medium
//   review    Code Review Blitz  5 / 200 medium  Review Champion 10 / 200 medium
//   streak    Streak Challenge   5 / 300 hard    Streak Builder  <workdays in the
//                                                window> / 300 hard
//   points    Points Race      500 / 250 medium  Point Hunter   500 / 250 medium
//
// Editing a number here changes what an admin gets when they pick a template, and
// nothing about the weekly challenges everyone actually sees. Which list is canonical
// has never been decided -- that is why the points entry sat at target 100 against a
// shipped 500 until it was noticed.
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
        description: 'Contribute on all 5 workdays this week. Weekends and holidays never count!',
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
        description: 'Earn 500 points this week from merged PRs and reviews',
        target: 500,
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
    }
    // A 30-day streak template used to live here. A streak now counts the workdays in
    // the current week, so 30 is unreachable by construction — and asking for it meant
    // asking someone to take at most two days off in six weeks.
];

export const getTemplates = () => templates;


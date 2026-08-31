import { describe, it, expect } from '@jest/globals';
import { calculatePRPoints, POINT_VALUES, FULL_WORKWEEK } from '../../config/points-config.js';
import { ACHIEVEMENTS, checkAchievements } from '../../config/achievements-config.js';
import { getTemplates } from '../../config/challenge-templates.js';

// A streak counts the workdays contributed in the current week, so 5 is the highest
// value it can hold. These are the guards that keep any reward from being re-keyed above
// a five-day week later on.

describe('streak point multiplier', () => {
    it('pays the base rate below a full workweek', () => {
        expect(calculatePRPoints(['bug'], 4)).toBe(50);
    });

    it('pays a 10% bonus for a full workweek', () => {
        expect(calculatePRPoints(['bug'], FULL_WORKWEEK)).toBe(55);
    });

    it('pays no more than that, whatever the streak reads', () => {
        // 365 cannot be produced any more, but an unreconciled legacy row still can be
        // read, and it used to double every PR.
        expect(calculatePRPoints(['bug'], 30)).toBe(55);
        expect(calculatePRPoints(['bug'], 90)).toBe(55);
        expect(calculatePRPoints(['bug'], 365)).toBe(55);
    });

    it('offers exactly one streak multiplier', () => {
        const streakKeys = Object.keys(POINT_VALUES).filter(k => k.startsWith('streak-'));
        expect(streakKeys).toEqual(['streak-workweek']);
        expect(POINT_VALUES['streak-workweek']).toBeLessThanOrEqual(1.1);
    });
});

describe('streak achievements', () => {
    it('offers one streak goal, reachable inside a week', () => {
        const streakGoals = Object.values(ACHIEVEMENTS).filter(a => a.category === 'streak');

        expect(streakGoals).toHaveLength(1);
        expect(streakGoals[0].threshold).toBe(FULL_WORKWEEK);
    });

    it('awards it for a full workweek', () => {
        const earned = checkAchievements({
            currentStreak: FULL_WORKWEEK,
            prCount: 0,
            reviewCount: 0,
            totalPoints: 0,
            achievements: []
        });

        expect(earned.map(a => a.id)).toContain('streak-7');
    });

    it('awards nothing short of a full workweek', () => {
        const earned = checkAchievements({
            currentStreak: 4,
            prCount: 0,
            reviewCount: 0,
            totalPoints: 0,
            achievements: []
        });

        expect(earned.filter(a => a.category === 'streak')).toHaveLength(0);
    });

    it('never awards a retired chain achievement, even off a legacy streak', () => {
        const earned = checkAchievements({
            currentStreak: 365,
            prCount: 0,
            reviewCount: 0,
            totalPoints: 0,
            achievements: []
        });

        const streakIds = earned.filter(a => a.category === 'streak').map(a => a.id);
        expect(streakIds).toEqual(['streak-7']);
    });
});

describe('challenge templates', () => {
    it('has no streak challenge asking for more than a week of workdays', () => {
        const streakTemplates = getTemplates().filter(t => t.type === 'streak');

        expect(streakTemplates.length).toBeGreaterThan(0);
        for (const template of streakTemplates) {
            expect(template.target).toBeLessThanOrEqual(FULL_WORKWEEK);
        }
    });
});

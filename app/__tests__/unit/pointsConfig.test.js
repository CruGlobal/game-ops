import { describe, it, expect } from '@jest/globals';
import {
    POINT_VALUES,
    LEGACY_REVIEW_POINTS,
    REVIEW_POINTS_RAISED_AT,
    reviewPointsAt,
    detectPRType,
    calculatePRPoints
} from '../../config/points-config.js';

describe('points config', () => {
    describe('review points', () => {
        it('pays a review the same as a PR with no recognized label', () => {
            expect(POINT_VALUES.review).toBe(40);
            expect(POINT_VALUES.review).toBe(POINT_VALUES.default);
        });

        it('values a review by when it was submitted, not when it is credited', () => {
            const justBefore = new Date(REVIEW_POINTS_RAISED_AT.getTime() - 1);
            expect(reviewPointsAt(justBefore)).toBe(LEGACY_REVIEW_POINTS);
            expect(reviewPointsAt('2026-09-30T23:59:59Z')).toBe(15);
            expect(reviewPointsAt(REVIEW_POINTS_RAISED_AT)).toBe(40);
            expect(reviewPointsAt('2026-10-02T15:00:00Z')).toBe(40);
        });

        it('uses the current value when no submission time is known', () => {
            expect(reviewPointsAt(null)).toBe(40);
            expect(reviewPointsAt(undefined)).toBe(40);
        });
    });

    describe('detectPRType', () => {
        it('falls back to default when there are no labels', () => {
            expect(detectPRType(undefined)).toBe('default');
            expect(detectPRType([])).toBe('default');
            expect(detectPRType([{ name: 'dependencies' }])).toBe('default');
        });

        it('accepts label objects and plain strings, ignoring case', () => {
            expect(detectPRType([{ name: 'Feature' }])).toBe('feature');
            expect(detectPRType(['REFACTOR'])).toBe('refactor');
        });

        it('picks the highest-priority type when several labels match', () => {
            expect(detectPRType(['feature', 'hotfix'])).toBe('hotfix');
            expect(detectPRType(['feature', 'bug'])).toBe('bug');
            expect(detectPRType(['documentation', 'enhancement'])).toBe('enhancement');
        });
    });

    describe('calculatePRPoints', () => {
        it('pays each PR type its base points', () => {
            expect(calculatePRPoints([])).toBe(40);
            expect(calculatePRPoints(['bug'])).toBe(50);
            expect(calculatePRPoints(['feature'])).toBe(100);
            expect(calculatePRPoints(['enhancement'])).toBe(75);
            expect(calculatePRPoints(['refactor'])).toBe(60);
            expect(calculatePRPoints(['hotfix'])).toBe(80);
            expect(calculatePRPoints(['documentation'])).toBe(30);
        });
    });
});

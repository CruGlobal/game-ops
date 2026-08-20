import { describe, it, expect } from '@jest/globals';
import { isUSFederalHoliday, isNonWorkingDay } from '../../utils/holidays.js';

describe('observed holidays that land in the previous year', () => {
    it('treats Dec 31 as a holiday when Jan 1 falls on a Saturday', () => {
        // Jan 1 2028 is a Saturday, so the observed federal holiday is Fri Dec 31 2027.
        // buildYear(2028) files that key under 2028, but the lookup keys on the date's
        // own year — so it was filed in one set and searched for in another.
        expect(isUSFederalHoliday(new Date(2027, 11, 31))).toBe(true);
        expect(isNonWorkingDay(new Date(2027, 11, 31))).toBe(true);
    });

    it('does not treat an ordinary Dec 31 as a holiday', () => {
        expect(isUSFederalHoliday(new Date(2025, 11, 31))).toBe(false); // a Wednesday
    });

    it('still recognises New Year observed on the Monday after a Sunday Jan 1', () => {
        // Jan 1 2023 was a Sunday, so the observance moves to Mon Jan 2 2023.
        expect(isUSFederalHoliday(new Date(2023, 0, 2))).toBe(true);
    });

    it('recognises a normal weekday New Year', () => {
        expect(isUSFederalHoliday(new Date(2025, 0, 1))).toBe(true); // Wednesday
    });
});

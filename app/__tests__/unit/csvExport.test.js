import { jest, describe, it, expect } from '@jest/globals';

jest.unstable_mockModule('@octokit/rest', () => ({
    Octokit: jest.fn().mockImplementation(() => ({ rest: { users: { getByUsername: jest.fn() } } }))
}));

const { csvField } = await import('../../services/analyticsService.js');

describe('CSV field escaping', () => {
    it('doubles embedded quotes so the field cannot close early', () => {
        // An admin-created challenge title like: Ship "v2"
        // Unescaped this ended the field mid-value and shifted every later column.
        expect(csvField('Ship "v2"')).toBe('"Ship ""v2"""');
    });

    it('leaves ordinary values quoted and unchanged', () => {
        expect(csvField('cru-Luis-Rodriguez')).toBe('"cru-Luis-Rodriguez"');
    });

    it('keeps commas and newlines inside the quoted field', () => {
        expect(csvField('a,b')).toBe('"a,b"');
        expect(csvField('line1\nline2')).toBe('"line1\nline2"');
    });

    it('renders null and undefined as an empty field', () => {
        expect(csvField(null)).toBe('""');
        expect(csvField(undefined)).toBe('""');
    });
});

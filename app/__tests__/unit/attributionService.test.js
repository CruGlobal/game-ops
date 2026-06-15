import { describe, it, expect } from '@jest/globals';
import { isProxyBot, extractRealAuthorFromCommits } from '../../services/attributionService.js';

describe('attributionService', () => {
    describe('isProxyBot', () => {
        it('flags the configured proxy bots', () => {
            expect(isProxyBot('terrabloks[bot]')).toBe(true);
            expect(isProxyBot('cru-devops')).toBe(true);
        });

        it('does not flag humans or generic bots', () => {
            expect(isProxyBot('twinge')).toBe(false);
            expect(isProxyBot('dependabot[bot]')).toBe(false);
            expect(isProxyBot('github-actions[bot]')).toBe(false);
            expect(isProxyBot('')).toBe(false);
            expect(isProxyBot(undefined)).toBe(false);
        });
    });

    describe('extractRealAuthorFromCommits', () => {
        it('pulls the login from a TerraBloks Co-authored-by no-reply trailer', () => {
            // Shape mirrors PR CruGlobal/cru-terraform#10860.
            const commits = [
                {
                    author: { login: 'terrabloks[bot]' },
                    commit: {
                        author: { name: 'terrabloks[bot]', email: '274883630+terrabloks[bot]@users.noreply.github.com' },
                        message: 'Add `flightdeck (prod)` Okta oauth app\n\nCo-authored-by: Josh Starcher <23668+twinge@users.noreply.github.com>'
                    }
                },
                {
                    author: { login: 'terrabloks[bot]' },
                    commit: {
                        author: { name: 'terrabloks[bot]', email: '274883630+terrabloks[bot]@users.noreply.github.com' },
                        message: 'Apply pre-commit changes'
                    }
                }
            ];
            expect(extractRealAuthorFromCommits(commits)).toBe('twinge');
        });

        it('handles the older login-only no-reply form', () => {
            const commits = [{
                commit: { author: { email: 'bot@users.noreply.github.com' }, message: 'x\n\nCo-authored-by: A B <octocat@users.noreply.github.com>' }
            }];
            expect(extractRealAuthorFromCommits(commits)).toBe('octocat');
        });

        it('maps a plain co-author email to a login via resolved commit authors', () => {
            const commits = [
                {
                    author: { login: 'twinge' },
                    commit: { author: { email: 'josh.starcher@gmail.com' }, message: 'later real commit' }
                },
                {
                    author: { login: 'terrabloks[bot]' },
                    commit: { author: { email: 'bot@users.noreply.github.com' }, message: 'init\n\nCo-authored-by: Josh <josh.starcher@gmail.com>' }
                }
            ];
            expect(extractRealAuthorFromCommits(commits)).toBe('twinge');
        });

        it('ignores non-GitHub co-authors it cannot resolve (e.g. Claude)', () => {
            const commits = [{
                commit: { author: { email: 'x@users.noreply.github.com' }, message: 'fix\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>' }
            }];
            expect(extractRealAuthorFromCommits(commits)).toBeNull();
        });

        it('returns null when there is no co-author trailer', () => {
            const commits = [{ commit: { author: { email: 'a@b.com' }, message: 'plain commit' } }];
            expect(extractRealAuthorFromCommits(commits)).toBeNull();
        });

        it('returns null for empty input', () => {
            expect(extractRealAuthorFromCommits([])).toBeNull();
            expect(extractRealAuthorFromCommits()).toBeNull();
        });
    });
});

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

        it('prefers the GitHub-resolved casing over the lowercased no-reply local part', () => {
            // GitHub lowercases the no-reply local part, so parsing the login out of
            // it yields `cru-luis-rodriguez` for an account actually spelled
            // `cru-Luis-Rodriguez` — which used to fork the contributor into a
            // second row. When GitHub resolved the same email on a commit, that
            // login carries the real casing and must win.
            const commits = [
                {
                    author: { login: 'cru-Luis-Rodriguez' },
                    commit: {
                        author: { email: '6875635+cru-luis-rodriguez@users.noreply.github.com' },
                        message: 'follow-up commit by the human'
                    }
                },
                {
                    author: { login: 'terrabloks[bot]' },
                    commit: {
                        author: { email: '274883630+terrabloks[bot]@users.noreply.github.com' },
                        message: 'scaffold app\n\nCo-authored-by: Luis Rodriguez <6875635+cru-luis-rodriguez@users.noreply.github.com>'
                    }
                }
            ];
            expect(extractRealAuthorFromCommits(commits)).toBe('cru-Luis-Rodriguez');
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

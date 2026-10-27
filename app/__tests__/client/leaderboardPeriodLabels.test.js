/**
 * Period names on the leaderboard page after Cru retired tertiles.
 *
 * The tertile system closes 2027-T1 on Nov 30, 2026 and opens 2027-Q2 on Dec 1, so for
 * the week after the switch the winners banner shows a tertile while the page is on a
 * quarter. Each must be named by its own label.
 *
 * leaderboard-client.js is a browser script with no exports; like arcadeHarness.js, this
 * evaluates the real file against the jsdom window with the view's own markup.
 */

/* global window, document */
import { jest, describe, test, expect, afterEach } from '@jest/globals';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Fake only Date; the page's own awaits still need real timers.
const REAL_TIMERS = [
    'hrtime', 'nextTick', 'performance', 'queueMicrotask',
    'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback',
    'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'
];

function viewMarkup() {
    return readFileSync(join(APP, 'views', 'leaderboard.ejs'), 'utf8')
        .replace(/<%[\s\S]*?%>/g, '')
        .replace(/<script[\s\S]*?<\/script>/g, '');
}

async function mountLeaderboard(responses) {
    window.fetch = globalThis.fetch = (url) => {
        const path = String(url).split('?')[0];
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(responses[path] ?? { success: true, data: [] }) });
    };
    window.matchMedia = () => ({
        matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}
    });
    document.body.innerHTML = viewMarkup();

    new window.Function(readFileSync(join(APP, 'public', 'leaderboard-client.js'), 'utf8')).call(window);
    document.dispatchEvent(new window.Event('DOMContentLoaded'));
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

describe('leaderboard period names across the Dec 1, 2026 switch', () => {
    afterEach(() => {
        jest.useRealTimers();
        localStorage.clear();
    });

    test('the week after the switch: banner names the tertile, the page names the quarter', async () => {
        jest.useFakeTimers({ now: new Date('2026-12-02T15:00:00Z'), doNotFake: REAL_TIMERS });

        await mountLeaderboard({
            '/api/quarter-info': {
                success: true,
                currentQuarter: '2027-Q2',
                quarterStart: '2026-12-01T00:00:00.000Z',
                quarterEnd: '2027-02-28T23:59:59.999Z',
                systemType: 'tertile',
                periodLabel: 'Quarter'
            },
            '/api/leaderboard/hall-of-fame': {
                success: true,
                data: [{
                    quarter: '2027-T1',
                    category: 'general',
                    year: 2027,
                    quarterNumber: 1,
                    quarterStart: '2026-10-01T00:00:00.000Z',
                    quarterEnd: '2026-11-30T23:59:59.999Z',
                    archivedDate: '2026-12-01T00:05:00.000Z',
                    winner: { username: 'nov-champ', pointsThisQuarter: 200 },
                    top3: [],
                    totalParticipants: 1
                }]
            }
        });

        expect(document.getElementById('tab-quarterly').textContent).toBe('📅 This Quarter');
        expect(document.getElementById('current-quarter-title').textContent).toBe('Current Quarter: 2027-Q2');
        expect(document.querySelector('.winners-banner-title').textContent).toBe('👑 2027-T1 Tertile Champions');
    });
});

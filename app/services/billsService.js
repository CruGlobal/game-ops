// Bills Service - Cru Bills REST API integration
// Delivers "bill bucks" to the tertile/quarter podium winners produced by
// awardQuarterlyBills(). Follows the slackService.js resilience pattern: the
// boundary-flow entry point (sendTertileWinnerBills) NEVER throws — it logs
// warnings and records failures on BillGift rows instead, so a Bills outage or
// misconfiguration can never block archiving/announcing/resetting a period.
//
// IMPORTANT: this service must NOT import from quarterlyService.js. To stay
// independently callable/retryable it reads the quarterlyAward table directly.

import crypto from 'crypto';
import { Octokit } from '@octokit/rest';
import { prisma } from '../lib/prisma.js';
import logger from '../utils/logger.js';

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const DEFAULT_BILLS_API_URL = 'https://bills.ustech.app/api/v1';

/**
 * Resolve the Bills API base URL from env, tolerating a few shapes:
 *   - full path with or without trailing slash (…/api/v1, …/api/v1/)
 *   - a bare origin (https://bills.ustech.app) → /api/v1 is appended
 */
function billsApiBase() {
    let base = (process.env.BILLS_API_URL || DEFAULT_BILLS_API_URL).trim();
    base = base.replace(/\/+$/, ''); // strip trailing slash(es)
    if (!base.endsWith('/api/v1')) {
        base = `${base}/api/v1`;
    }
    return base;
}

/**
 * Build the Idempotency-Key for a gift.
 *
 * Format: game-ops:${quarter}:${username}:${shortHash}
 * where shortHash is the first 8 hex chars of sha256(`${toEmail}|${amount}`).
 *
 * Rationale: identical retries dedupe server-side (same key returns the cached
 * result), but a retry with a *corrected email* produces a different hash and
 * therefore a fresh key, so the API doesn't replay an earlier cached result.
 */
function buildIdempotencyKey(quarter, username, toEmail, amount) {
    const shortHash = crypto
        .createHash('sha256')
        .update(`${toEmail}|${amount}`)
        .digest('hex')
        .slice(0, 8);
    return `game-ops:${quarter}:${username}:${shortHash}`;
}

/**
 * Build the recipient-facing reason string.
 * Medal/ordinal derive from rank (1 → 🥇 1st, 2 → 🥈 2nd, 3 → 🥉 3rd).
 */
function buildReason(quarter, rank, periodLabel, points) {
    const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
    const ordinals = { 1: '1st', 2: '2nd', 3: '3rd' };
    const medal = medals[rank] || '';
    const ordinal = ordinals[rank] || `${rank}th`;
    const suffix = points != null ? ` (${points} points)` : '';
    return `GitHub Scoreboard ${quarter} — ${medal} ${ordinal} place ${periodLabel} winner${suffix}`;
}

/**
 * POST a single gift to the Bills API. Never throws — returns a result object.
 * @returns {Promise<{ok: boolean, billsGiftId?: string|null, error?: string}>}
 */
async function postGift({ quarter, username, toEmail, amount, reason }) {
    const url = `${billsApiBase()}/gifts`;
    const idempotencyKey = buildIdempotencyKey(quarter, username, toEmail, amount);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.BILLS_API_KEY}`,
                'Content-Type': 'application/json',
                'Idempotency-Key': idempotencyKey
            },
            body: JSON.stringify({
                toEmail,
                amount,
                reason,
                anonymous: false,
                private: false
            })
        });

        let payload = null;
        try {
            payload = await response.json();
        } catch {
            payload = null;
        }

        // Success is 201 with { gift: { id, ... } }. Treat anything else as failure.
        if (response.status === 201) {
            return { ok: true, billsGiftId: payload?.gift?.id ?? null };
        }

        const code = payload?.error?.code || `http_${response.status}`;
        const message = payload?.error?.message || 'Unexpected response from Bills API';
        return { ok: false, error: `${code}: ${message}` };
    } catch (error) {
        return { ok: false, error: error.message };
    }
}

/**
 * Resolve the recipient email for a contributor.
 *   1. If contributor.billsEmail is set (admin- or github-sourced), use it as-is.
 *   2. Else read the public GitHub profile email; trust it only if it ends with
 *      @cru.org (case-insensitive), persist it (source 'github'), and return it.
 *   3. Else (no email, non-cru.org email, or GitHub error) return null.
 *
 * @param {string} username
 * @returns {Promise<string|null>}
 */
export async function resolveBillsEmail(username) {
    const contributor = await prisma.contributor.findUnique({
        where: { username },
        select: { billsEmail: true }
    });

    if (contributor?.billsEmail) {
        return contributor.billsEmail;
    }

    try {
        const { data } = await octokit.rest.users.getByUsername({ username });
        const email = data?.email;

        if (email && email.toLowerCase().endsWith('@cru.org')) {
            await prisma.contributor.update({
                where: { username },
                data: { billsEmail: email, billsEmailSource: 'github' }
            });
            return email;
        }

        return null;
    } catch (error) {
        logger.warn('Failed to resolve Bills email from GitHub profile', {
            username,
            error: error.message
        });
        return null;
    }
}

/**
 * Resolve the email for a BillGift row, attempt the send, and record the
 * outcome on the row. Shared by the boundary flow and the admin retry.
 * Returns the updated row.
 */
async function deliverBillGift(row) {
    const email = await resolveBillsEmail(row.username);

    if (!email) {
        logger.warn('Bill gift has no trusted email; leaving pending_email', {
            quarter: row.quarter,
            username: row.username
        });
        return prisma.billGift.update({
            where: { id: row.id },
            data: { status: 'pending_email' }
        });
    }

    const result = await postGift({
        quarter: row.quarter,
        username: row.username,
        toEmail: email,
        amount: row.amount,
        reason: row.reason
    });

    if (result.ok) {
        logger.info('Bill gift sent', {
            quarter: row.quarter,
            username: row.username,
            billsGiftId: result.billsGiftId
        });
        return prisma.billGift.update({
            where: { id: row.id },
            data: {
                status: 'sent',
                billsGiftId: result.billsGiftId,
                email,
                error: null,
                attempts: { increment: 1 },
                sentAt: new Date()
            }
        });
    }

    logger.warn('Bill gift failed', {
        quarter: row.quarter,
        username: row.username,
        error: result.error
    });
    return prisma.billGift.update({
        where: { id: row.id },
        data: {
            status: 'failed',
            email,
            error: result.error,
            attempts: { increment: 1 }
        }
    });
}

/**
 * Boundary-flow hook. Sends bill bucks to the non-DevOps podium winners for a
 * period. NEVER throws.
 *
 * @param {string} quarterString - period being closed (e.g. "2026-T2")
 * @param {object|null} billResults - the return value of awardQuarterlyBills()
 * @returns {Promise<{sent: number, pendingEmail: number, failed: number}>}
 */
export async function sendTertileWinnerBills(quarterString, billResults = null) {
    const summary = { sent: 0, pendingEmail: 0, failed: 0 };
    const quarter = quarterString;

    try {
        const settings = await prisma.quarterSettings.findUnique({
            where: { id: 'quarter-config' }
        });

        if (!settings?.enableBillsGifts) {
            logger.debug('Bills gifts disabled, skipping', { quarter });
            return summary;
        }

        if (!process.env.BILLS_API_KEY) {
            logger.warn('Bills gifts enabled but BILLS_API_KEY not configured', { quarter });
            return summary;
        }

        // Prefer the freshly-computed awards; fall back to the stored idempotency
        // record so this function is independently callable/retryable (a re-run
        // of awardQuarterlyBills returns { alreadyAwarded: true } with empty arrays).
        let awards = Array.isArray(billResults?.nonDevOpsAwards) && billResults.nonDevOpsAwards.length > 0
            ? billResults.nonDevOpsAwards
            : null;

        if (!awards) {
            const stored = await prisma.quarterlyAward.findUnique({ where: { quarter } });
            const storedAwards = stored?.results?.nonDevOpsAwards;
            if (Array.isArray(storedAwards) && storedAwards.length > 0) {
                awards = storedAwards;
            }
        }

        if (!awards || awards.length === 0) {
            logger.info('No non-DevOps podium awards to gift', { quarter });
            return summary;
        }

        const periodLabel = settings.systemType === 'tertile' ? 'Tertile' : 'Quarter';

        for (const award of awards) {
            // One winner's failure must not stop the others.
            try {
                const { username, rank } = award;
                const amount = award.value;
                const reason = buildReason(quarter, rank, periodLabel, award.points);

                const existing = await prisma.billGift.findUnique({
                    where: { quarter_username: { quarter, username } }
                });

                if (existing?.status === 'sent') {
                    logger.debug('Bill gift already sent, skipping', { quarter, username });
                    summary.sent += 1;
                    continue;
                }

                let row = await prisma.billGift.upsert({
                    where: { quarter_username: { quarter, username } },
                    create: { quarter, username, rank, amount, reason, status: 'pending_email' },
                    update: { rank, amount, reason }
                });

                row = await deliverBillGift(row);

                if (row.status === 'sent') {
                    summary.sent += 1;
                } else if (row.status === 'pending_email') {
                    summary.pendingEmail += 1;
                } else {
                    summary.failed += 1;
                }
            } catch (winnerError) {
                summary.failed += 1;
                logger.warn('Failed to process bill gift for winner', {
                    quarter,
                    username: award?.username,
                    error: winnerError.message
                });
            }
        }

        logger.info('Bills gifts processed', { quarter, ...summary });
        return summary;
    } catch (error) {
        logger.warn('Failed to send tertile winner bills', {
            quarter,
            error: error.message
        });
        return summary;
    }
}

/**
 * Retry a single BillGift (admin action). Unlike the boundary hook this MAY
 * throw / surface errors so the admin gets feedback. Re-resolves the email so a
 * newly-set admin email is picked up, re-checks the toggle + key, sends, and
 * returns the updated row.
 *
 * @param {string} billGiftId
 * @returns {Promise<object>} the updated BillGift row
 */
export async function retryBillGift(billGiftId) {
    const row = await prisma.billGift.findUnique({ where: { id: billGiftId } });

    if (!row) {
        const err = new Error('Bill gift not found');
        err.code = 'not_found';
        throw err;
    }

    if (row.status === 'sent') {
        const err = new Error('Bill gift has already been sent');
        err.code = 'already_sent';
        throw err;
    }

    const settings = await prisma.quarterSettings.findUnique({
        where: { id: 'quarter-config' }
    });

    if (!settings?.enableBillsGifts) {
        const err = new Error('Bills gifts are disabled. Enable them in Quarter Configuration first.');
        err.code = 'disabled';
        throw err;
    }

    if (!process.env.BILLS_API_KEY) {
        const err = new Error('BILLS_API_KEY is not configured on the server.');
        err.code = 'no_key';
        throw err;
    }

    return deliverBillGift(row);
}

export default {
    resolveBillsEmail,
    sendTertileWinnerBills,
    retryBillGift
};

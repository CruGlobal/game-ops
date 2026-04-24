import { prisma } from '../lib/prisma.js';
import logger from '../utils/logger.js';

/**
 * Post quarterly winners announcement to Slack via Incoming Webhook.
 * Checks enableSlackNotifications in QuarterSettings; returns early if disabled.
 * Never throws — logs a warning on failure.
 *
 * @param {String} quarterString - e.g. "2025-Q1"
 * @param {Object} billResults - Result from awardQuarterlyBills()
 * @param {Object} quarterlyWinner - QuarterlyWinner record from archiveQuarterWinners()
 */
export async function postQuarterlyWinnersSlack(quarterString, billResults, quarterlyWinner) {
    try {
        const settings = await prisma.quarterSettings.findUnique({
            where: { id: 'quarter-config' }
        });

        if (!settings?.enableSlackNotifications) {
            logger.debug('Slack notifications disabled, skipping');
            return;
        }

        const webhookUrl = settings.slackWebhookUrl || process.env.SLACK_WEBHOOK_URL;

        if (!webhookUrl) {
            logger.warn('Slack notifications enabled but no webhook URL configured');
            return;
        }

        const blocks = buildSlackBlocks(quarterString, billResults, quarterlyWinner);

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ blocks }),
        });

        if (!response.ok) {
            const text = await response.text();
            logger.warn('Slack webhook returned non-OK status', {
                status: response.status,
                body: text,
                quarter: quarterString
            });
            return;
        }

        logger.info(`Posted quarterly winners to Slack for ${quarterString}`);
    } catch (error) {
        logger.warn('Failed to post quarterly winners to Slack', {
            quarter: quarterString,
            error: error.message
        });
    }
}

/**
 * Build Slack Block Kit blocks for the quarterly winners announcement.
 */
function buildSlackBlocks(quarterString, billResults, quarterlyWinner) {
    const winner = quarterlyWinner?.winner || {};
    const top3 = quarterlyWinner?.top3 || [];
    const totalParticipants = quarterlyWinner?.totalParticipants || 0;

    const blocks = [
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: `${quarterString} Quarterly Results`,
                emoji: true
            }
        },
        { type: 'divider' },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `:trophy: *Champion: ${winner.username || 'N/A'}*\n` +
                    `:star: *${winner.pointsThisQuarter || 0} points*\n` +
                    `PRs: ${winner.prsThisQuarter || 0} | Reviews: ${winner.reviewsThisQuarter || 0}\n` +
                    `Award: *1 Vonette* (5 Bills)`
            }
        },
    ];

    // Podium
    if (top3.length > 1) {
        const medals = [':first_place_medal:', ':second_place_medal:', ':third_place_medal:'];
        const podiumLines = top3.map((c, i) => {
            const medal = medals[i] || '';
            const award = i === 0 ? '1 Vonette' : '1 Bill';
            return `${medal} *#${c.rank || i + 1} ${c.username}* — ${c.pointsThisQuarter || 0} pts (${award})`;
        });

        blocks.push(
            { type: 'divider' },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*Podium*\n${podiumLines.join('\n')}`
                }
            }
        );
    }

    // DevOps participation
    if (billResults) {
        const devOpsAwarded = billResults.devOpsAwarded || [];
        if (devOpsAwarded.length > 0) {
            const devOpsLines = devOpsAwarded.map(
                d => `• ${d.username}: *1 Bill* (${d.contributions} contributions)`
            );

            blocks.push(
                { type: 'divider' },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `*DevOps Participation Bills*\n${devOpsLines.join('\n')}`
                    }
                }
            );
        }
    }

    // Footer
    blocks.push(
        { type: 'divider' },
        {
            type: 'context',
            elements: [
                {
                    type: 'mrkdwn',
                    text: `${totalParticipants} total contributors this quarter`
                }
            ]
        }
    );

    return blocks;
}

/**
 * Post a new-challenge announcement to Slack via Incoming Webhook.
 * Accepts one or more challenges; a multi-challenge array renders as a single
 * batched announcement (used by the weekly cron so Monday doesn't generate 3
 * separate pings).
 *
 * Checks enableSlackNotifications in QuarterSettings; returns early if disabled.
 * Never throws; logs a warning on failure.
 *
 * @param {Array<Object>} challenges - Challenge records from Prisma
 */
export async function postNewChallengesSlack(challenges) {
    const list = Array.isArray(challenges) ? challenges.filter(Boolean) : [];
    if (list.length === 0) return;

    try {
        const settings = await prisma.quarterSettings.findUnique({
            where: { id: 'quarter-config' }
        });

        if (!settings?.enableSlackNotifications) {
            logger.debug('Slack notifications disabled, skipping new-challenge post');
            return;
        }

        const webhookUrl = settings.slackWebhookUrl || process.env.SLACK_WEBHOOK_URL;

        if (!webhookUrl) {
            logger.warn('Slack notifications enabled but no webhook URL configured');
            return;
        }

        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        const challengesUrl = `${baseUrl.replace(/\/$/, '')}/challenges`;
        const blocks = buildGenericChallengeBlocks(list.length, challengesUrl);

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ blocks }),
        });

        if (!response.ok) {
            const text = await response.text();
            logger.warn('Slack webhook returned non-OK status for new challenge(s)', {
                status: response.status,
                body: text,
                count: list.length
            });
            return;
        }

        logger.info('Posted new challenge(s) to Slack', {
            count: list.length,
            ids: list.map(c => c.id)
        });
    } catch (error) {
        logger.warn('Failed to post new challenge(s) to Slack', {
            count: list.length,
            error: error.message
        });
    }
}

// Intentionally generic: we link to the challenges page rather than inlining
// titles/descriptions/rewards so recipients click through. This keeps traffic
// on the leaderboard (the details would otherwise make the post self-sufficient).
function buildGenericChallengeBlocks(count, challengesUrl) {
    const headerText = count === 1
        ? ':dart: A new challenge is live'
        : `:dart: ${count} new challenges are live`;
    const bodyText = count === 1
        ? 'A new challenge was just added. Everyone is auto-enrolled.'
        : `${count} new challenges were just added. Everyone is auto-enrolled.`;

    return [
        {
            type: 'header',
            text: { type: 'plain_text', text: headerText, emoji: true }
        },
        {
            type: 'section',
            text: { type: 'mrkdwn', text: `${bodyText} <${challengesUrl}|See what's new>.` }
        },
        {
            type: 'actions',
            elements: [
                {
                    type: 'button',
                    text: { type: 'plain_text', text: 'View challenges', emoji: true },
                    url: challengesUrl,
                    style: 'primary'
                }
            ]
        }
    ];
}

import logger from '../utils/logger.js';

/**
 * Tracks work that continues after a response has already been sent.
 *
 * Webhook handling answers GitHub 200 immediately and processes afterwards, so at any
 * moment there may be point awards and claim writes in flight that no client is
 * waiting on. GitHub will not redeliver a delivery it has already had a 200 for, so
 * killing the process mid-flight loses that work outright — recoverable only by the
 * catch-up cron, which is disabled by default.
 */
const pending = new Set();

/** Register a promise as in-flight work that shutdown should wait for. */
export const track = (promise) => {
    pending.add(promise);
    // Detach: settling is what matters for draining, not the outcome.
    promise.then(() => pending.delete(promise), () => pending.delete(promise));
    return promise;
};

export const pendingCount = () => pending.size;

/**
 * Wait for in-flight work to settle, up to a deadline.
 *
 * Bounded because the shutdown grace period is finite (ECS sends SIGKILL after
 * stopTimeout); it is better to finish most of the work and log the rest than to be
 * killed mid-write with no record.
 *
 * @returns {Promise<{drained: boolean, remaining: number}>}
 */
export const drain = async (timeoutMs = 8000) => {
    if (pending.size === 0) return { drained: true, remaining: 0 };

    logger.info('Draining in-flight work before shutdown', { pending: pending.size, timeoutMs });

    let timer;
    const timeout = new Promise(resolve => { timer = setTimeout(() => resolve('timeout'), timeoutMs); });
    const settled = Promise.allSettled([...pending]).then(() => 'settled');

    const outcome = await Promise.race([settled, timeout]);
    clearTimeout(timer);

    if (outcome === 'timeout') {
        logger.warn('Shutdown drain timed out with work still in flight', { remaining: pending.size });
        return { drained: false, remaining: pending.size };
    }
    return { drained: true, remaining: 0 };
};

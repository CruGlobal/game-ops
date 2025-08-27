document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('fetchButton').addEventListener('click', fetchActivity);
});

async function fetchActivity() {
    const prFrom = document.getElementById('pr_from').value;
    const prTo = document.getElementById('pr_to').value;
    const totalPRs = prTo - prFrom + 1;

    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';

    let completedPRs = 0;
    let allStats = new Map();
    let allBlocked = new Map();

    for (let i = prFrom; i <= prTo; i++) {
        try {
            const data = await fetchWithRetry(`/api/activity?prFrom=${i}&prTo=${i}`);
            data.stats.forEach(stat => updateStats(allStats, stat[0], stat.slice(1)));
            data.blocked.forEach(block => updateChange(allBlocked, block[0], block[1], block[2]));

            completedPRs++;
            const progress = (completedPRs / totalPRs) * 100;
            progressBar.style.width = `${progress}%`;

            // Wait for 1 second before the next fetch
            await sleep(1000);
        } catch (error) {
            console.error(`Error fetching activity data for PR ${i}:`, error);
        }
    }

    // Hide the progress bar after all data is fetched
    progressContainer.style.display = 'none';

    // Convert Maps back to arrays
    const statsArray = Array.from(allStats, ([user, counts]) => [user, ...counts]);
    const blockedArray = Array.from(allBlocked, ([user, details]) => [user, ...details]);

    // Display the results after the progress bar completes
    displayResults(statsArray, blockedArray);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function updateStats(stats, user, counts) {
    if (stats.has(user)) {
        const existingCounts = stats.get(user);
        for (let i = 0; i < counts.length; i++) {
            existingCounts[i] += counts[i];
        }
    } else {
        stats.set(user, counts);
    }
}

function updateChange(blocked, user, userRaised, count) {
    const key = `${user}-${userRaised}`;
    if (blocked.has(key)) {
        blocked.get(key)[2] += count;
    } else {
        blocked.set(key, [user, userRaised, count]);
    }
}

async function fetchWithRetry(url, retries = 5, backoff = 3000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                if (response.status === 429) {
                    throw new Error('Too Many Requests');
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            if (i < retries - 1) {
                console.warn(`Retrying fetch for ${url} in ${backoff}ms...`);
                await new Promise(resolve => setTimeout(resolve, backoff));
                backoff *= 2; // Exponential backoff
            } else {
                throw error;
            }
        }
    }
}

function displayResults(stats, blocked) {
    const resultsDiv = document.getElementById('activity-results');
    resultsDiv.innerHTML = `
        <h2>Stats</h2>
        <pre>
Name                 PRs   Approved  Commented     Change  Dismissed
----                 ---   --------  ---------     ------  ---------
${stats.map(stat => `${stat[0].padEnd(20)} ${stat[5].toString().padEnd(3)} ${stat[1].toString().padEnd(10)} ${stat[2].toString().padEnd(10)} ${stat[3].toString().padEnd(10)} ${stat[4].toString().padEnd(10)}`).join('\n')}
        </pre>
        <h2>Blocked</h2>
        <pre>
Blocked by   Raised by       Count
----------   ---------       -----
${blocked.map(block => `${block[0].padEnd(12)} ${block[1].padEnd(12)} ${block[2].toString().padEnd(5)}`).join('\n')}
        </pre>
    `;
}
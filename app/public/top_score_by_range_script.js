document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('fetchButton').addEventListener('click', fetchTopScores);
});

async function fetchTopScores() {
    const range = document.getElementById('range').value;
    const page = 1; // Default page value
    const limit = 10; // Default limit value

    // Fetch top contributors
    const contributorsResponse = await fetch(`/api/top-contributors-date-range?range=${range}&page=${page}&limit=${limit}`);
    const contributorsData = await contributorsResponse.json();

    // Fetch top reviewers
    const reviewersResponse = await fetch(`/api/top-reviewers-date-range?range=${range}&page=${page}&limit=${limit}`);
    const reviewersData = await reviewersResponse.json();

    displayResults(contributorsData, reviewersData);
}

function displayResults(contributorsData, reviewersData) {
    const resultsDiv = document.getElementById('top-scores-results');
    resultsDiv.innerHTML = `
        <h2>Top Contributors</h2>
        <pre>
Name                 Total PRs
----                 ---------
${contributorsData.contributors.map(contributor => `${contributor.username.padEnd(20)} ${contributor.totalPrCount.toString().padEnd(10)}`).join('\n')}
        </pre>
        <h2>Top Reviewers</h2>
        <pre>
Name                 Total Reviews
----                 -------------
${reviewersData.reviewers.map(reviewer => `${reviewer.username.padEnd(20)} ${reviewer.totalReviewCount.toString().padEnd(10)}`).join('\n')}
        </pre>
    `;
}
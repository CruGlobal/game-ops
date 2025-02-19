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

//function displayResults(contributorsData, reviewersData) {
//    const resultsDiv = document.getElementById('top-scores-results');
//    resultsDiv.innerHTML = `
//        <h2>Top Contributors</h2>
//        <pre>
//Name                 Total PRs
//----                 ---------
//${contributorsData.contributors.map(contributor => `${contributor.username.padEnd(20)} ${contributor.totalPrCount.toString().padEnd(10)}`).join('\n')}
//        </pre>
//        <h2>Top Reviewers</h2>
//        <pre>
//Name                 Total Reviews
//----                 -------------
//${reviewersData.reviewers.map(reviewer => `${reviewer.username.padEnd(20)} ${reviewer.totalReviewCount.toString().padEnd(10)}`).join('\n')}
//        </pre>
//    `;
//}

function displayResults(contributorsData, reviewersData) {
    const contributorsDiv = document.getElementById('top-scores-results-contributors');
    const reviewersDiv = document.getElementById('top-scores-results-reviewers');

    contributorsDiv.innerHTML = `
        <div class="card">
            <h2>Top Contributors</h2>
            <div class="list-header">
                <div class="profile-column">Contributor</div>
                <div class="pr-count-column">Pull Requests</div>
            </div>
            <ul class="list">
                ${contributorsData.contributors.map(contributor => `
                    <li class="list-item">
                        <div class="profile-column">
                            <div class="profile">
                                <img src="${contributor.avatarUrl}" alt="${contributor.username}" width="50" height="50" class="profile-picture">
                                <span>${contributor.username}</span>
                            </div>
                        </div>
                        <div class="pr-count-column">${contributor.totalPrCount}</div>
                    </li>
                `).join('')}
            </ul>
        </div>
    `;

    reviewersDiv.innerHTML = `
        <div class="card">
            <h2>Top Reviewers</h2>
            <div class="list-header">
                <div class="profile-column">Reviewer</div>
                <div class="review-count-column">Reviews</div>
            </div>
            <ul class="list">
                ${reviewersData.reviewers.map(reviewer => `
                    <li class="list-item">
                        <div class="profile-column">
                            <div class="profile">
                                <img src="${reviewer.avatarUrl}" alt="${reviewer.username}" width="50" height="50" class="profile-picture">
                                <span>${reviewer.username}</span>
                            </div>
                        </div>
                        <div class="review-count-column">${reviewer.totalReviewCount}</div>
                    </li>
                `).join('')}
            </ul>
        </div>
    `;
}
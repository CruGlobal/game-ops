document.addEventListener('DOMContentLoaded', async () => {
    const topContributorsList = document.getElementById('top-contributors');
    const topReviewersList = document.getElementById('top-reviewers');

    const fetchTopContributors = async () => {
        const response = await fetch('/api/top-contributors');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    };

    const fetchTopReviewers = async () => {
        const response = await fetch('/api/top-reviewers');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    };

    const createContributorListItem = (contributor) => {
        const listItem = document.createElement('li');
        listItem.innerHTML = `
            <div class="profile">
                <img src="${contributor.avatarUrl}" alt="${contributor.username}" width="50" height="50" class="profile-picture">
                <span>${contributor.username}</span>
            </div>
            <div class="pr-count">${contributor.prCount || 0}</div>
            <div class="badges">${(contributor.badges || []).map(badge => `<img src="/images/badges/${badge.badge.replace(/ /g, '_').toLowerCase()}.png" alt="${badge.badge}" class="badge">`).join('')}</div>
        `;
        return listItem;
    };

    const createReviewerListItem = (reviewer) => {
        const listItem = document.createElement('li');
        listItem.innerHTML = `
            <div class="profile">
                <img src="${reviewer.avatarUrl}" alt="${reviewer.username}" width="50" height="50" class="profile-picture">
                <span>${reviewer.username}</span>
            </div>
            <div class="review-count">${reviewer.reviewCount || 0}</div>
            <div class="badges">${(reviewer.badges || []).map(badge => `<img src="/images/badges/${badge.badge.replace(/ /g, '_').toLowerCase()}.png" alt="${badge.badge}" class="badge">`).join('')}</div>
        `;
        return listItem;
    };

    try {
        const [topContributors, topReviewers] = await Promise.all([fetchTopContributors(), fetchTopReviewers()]);

        topContributors.forEach(contributor => {
            topContributorsList.appendChild(createContributorListItem(contributor));
        });

        topReviewers.forEach(reviewer => {
            topReviewersList.appendChild(createReviewerListItem(reviewer));
        });
    } catch (error) {
        console.error('Error fetching contributors or reviewers:', error);
    }
});
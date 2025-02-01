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
        listItem.className = 'list-item';
        listItem.innerHTML = `
            <div class="profile-column">
                <div class="profile">
                    <img src="${contributor.avatarUrl}" alt="${contributor.username}" width="50" height="50" class="profile-picture">
                    <span>${contributor.username}</span>
                </div>
            </div>
            <div class="pr-count-column">${contributor.prCount || 0}</div>
            <div class="total-bills-column">${contributor.totalBillsAwarded || 0}</div>
            <div class="badges-column">${(contributor.badges || []).map(badge => /pr|prs/i.test(badge.badge) ? `<img src="/images/badges/${badge.badge.replace(/ /g, '_').toLowerCase()}.png" alt="${badge.badge}" class="badge">` : '').join('')}</div>
        `;
        return listItem;
    };

    const createReviewerListItem = (reviewer) => {
        const listItem = document.createElement('li');
        listItem.className = 'list-item';
        listItem.innerHTML = `
            <div class="profile-column">
                <div class="profile">
                    <img src="${reviewer.avatarUrl}" alt="${reviewer.username}" width="50" height="50" class="profile-picture">
                    <span>${reviewer.username}</span>
                </div>
            </div>
            <div class="review-count-column">${reviewer.reviewCount || 0}</div>
            <div class="total-bills-column">${reviewer.totalBillsAwarded || 0}</div>
            <div class="badges-column">${(reviewer.badges || []).map(badge => /review|reviews/i.test(badge.badge) ? `<img src="/images/badges/${badge.badge.replace(/ /g, '_').toLowerCase()}.png" alt="${badge.badge}" class="badge">` : '').join('')}</div>
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

    // Tab switching logic
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            button.classList.add('active');
            document.getElementById(button.dataset.tab).classList.add('active');
        });
    });

    // Show the default tab
    document.querySelector('.tab-button[data-tab="contributors"]').click();
});
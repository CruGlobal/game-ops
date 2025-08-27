document.addEventListener('DOMContentLoaded', async () => {
    const topContributorsList = document.getElementById('top-contributors');
    const topReviewersList = document.getElementById('top-reviewers');
    const filterButtons = document.querySelectorAll('.filter-button');
    let currentTab = 'contributors';
    let currentRange = 'all';
    const limit = 10;

    const fetchData = async (url) => {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.error(`API error! status: ${response.status}`);
                return { error: `API request failed with status ${response.status}` };
            }
            return response.json();
        } catch (error) {
            console.error('Error fetching data:', error);
            throw error;
        }
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
            <div class="badges-column">${(contributor.badges || []).map(badge => `<img src="/images/badges/${badge.badge.replace(/ /g, '_').toLowerCase()}.png" alt="${badge.badge}" class="badge">`).join('')}</div>
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
            <div class="badges-column">${(reviewer.badges || []).map(badge => `<img src="/images/badges/${badge.badge.replace(/ /g, '_').toLowerCase()}.png" alt="${badge.badge}" class="badge">`).join('')}</div>
        `;
        return listItem;
    };

    const isValidContributor = (contributor) => {
        return contributor && typeof contributor.username === 'string' &&
            typeof contributor.prCount === 'number' &&
            typeof contributor.avatarUrl === 'string' &&
            Array.isArray(contributor.badges) &&
            typeof contributor.totalBillsAwarded === 'number';
    };

    const isValidReviewer = (reviewer) => {
        return reviewer && typeof reviewer.username === 'string' &&
            typeof reviewer.reviewCount === 'number' &&
            typeof reviewer.avatarUrl === 'string' &&
            Array.isArray(reviewer.badges) &&
            typeof reviewer.totalBillsAwarded === 'number';
    };

    async function loadContributors(range, page, limit) {
        //const url = range === 'all' ? `/api/top-contributors` : `/api/top-contributors-date-range?range=${range}&page=${page}&limit=${limit}`;
        const url = "/api/top-contributors";
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            const data = result.contributors || [];
            if (!Array.isArray(data)) {
                throw new Error('Data is not an array');
            }
            // Process the data array
            console.log(data);
        } catch (error) {
            console.error('Error loading contributors:', error);
        }
    };

    async function loadReviewers(range, page, limit) {
        const url = range === 'all' ? `/api/top-reviewers` : `/api/top-reviewers-date-range?range=${range}&page=${page}&limit=${limit}`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            const data = result.reviewers || [];
            if (!Array.isArray(data)) {
                throw new Error('Data is not an array');
            }
            // Process the data array
            console.log(data);
        } catch (error) {
            console.error('Error loading reviewers:', error);
        }
    };

    filterButtons.forEach(button => {
        button.addEventListener('click', async () => {
            currentRange = button.dataset.range;
            if (currentTab === 'contributors') {
                await loadContributors(currentRange);
            } else {
                await loadReviewers(currentRange);
            }
        });
    });

    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', async () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            button.classList.add('active');
            const tabContent = document.getElementById(button.dataset.tab);
            if (tabContent) {
                tabContent.classList.add('active');
            }
            currentTab = button.dataset.tab;

            if (currentTab === 'contributors') {
                await loadContributors(currentRange);
            } else {
                await loadReviewers(currentRange);
            }
        });
    });

    document.querySelector('.tab-button[data-tab="contributors"]').click();
});
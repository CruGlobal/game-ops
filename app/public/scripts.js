/**
 * Escape a value for safe interpolation into HTML — including inside
 * double-quoted attributes. Escapes & < > " ' so untrusted strings such as
 * avatarUrl/username cannot break out and inject markup.
 */
function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', async () => {
    // Hamburger menu logic
    const hamburgerButton = document.querySelector('.hamburger-button');
    const hamburgerContent = document.querySelector('.hamburger-content');

    hamburgerButton.addEventListener('click', () => {
        hamburgerContent.classList.toggle('active');
        if (hamburgerContent.classList.contains('active')) {
            hamburgerContent.style.display = 'block';
        } else {
            hamburgerContent.style.display = 'none';
        }
    });

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

    // Show the default tab (contributors tab)
    const topContributorsList = document.getElementById('top-contributors');
    const topReviewersList = document.getElementById('top-reviewers');
    const contributorsTabContent = document.getElementById('contributors'); // Get the contributors tab content div


    const fetchData = async (url) => {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    };

    const createContributorListItem = (contributor) => {
        const listItem = document.createElement('li');
        listItem.className = 'list-item';
        listItem.setAttribute('data-username', contributor.username);
        listItem.innerHTML = `
            <div class="profile-column">
                <div class="profile">
                    <img src="${escapeHtml(contributor.avatarUrl)}" alt="${escapeHtml(contributor.username)}" width="50" height="50" class="profile-picture">
                    <span>${escapeHtml(contributor.username)}</span>
                </div>
            </div>
            <div class="pr-count-column pr-count">${contributor.prCount || 0}</div>
            <div class="total-bills-column">${contributor.totalBillsAwarded || 0}</div>
            <div class="badges-column">${(contributor.badges || []).map(badge => /pr|prs/i.test(badge.badge) ? `<img src="/images/badges/${escapeHtml(String(badge.badge).replace(/ /g, '_').toLowerCase())}.png" alt="${escapeHtml(badge.badge)}" class="badge">` : '').join('')}</div>
        `;
        return listItem;
    };

    const createReviewerListItem = (reviewer) => {
        const listItem = document.createElement('li');
        listItem.className = 'list-item';
        listItem.setAttribute('data-username', reviewer.username);
        listItem.innerHTML = `
            <div class="profile-column">
                <div class="profile">
                    <img src="${escapeHtml(reviewer.avatarUrl)}" alt="${escapeHtml(reviewer.username)}" width="50" height="50" class="profile-picture">
                    <span>${escapeHtml(reviewer.username)}</span>
                </div>
            </div>
            <div class="review-count-column review-count">${reviewer.reviewCount || 0}</div>
            <div class="total-bills-column">${reviewer.totalBillsAwarded || 0}</div>
            <div class="badges-column">${(reviewer.badges || []).map(badge => /review|reviews/i.test(badge.badge) ? `<img src="/images/badges/${escapeHtml(String(badge.badge).replace(/ /g, '_').toLowerCase())}.png" alt="${escapeHtml(badge.badge)}" class="badge">` : '').join('')}</div>
        `;
        return listItem;
    };

    // Only fetch and populate if the elements exist on this page
    if (topContributorsList && topReviewersList) {
        try {
            const [topContributors, topReviewers] = await Promise.all([
                fetchData('/api/top-contributors'),
                fetchData('/api/top-reviewers')
            ]);

            topContributors.forEach(contributor => {
                topContributorsList.appendChild(createContributorListItem(contributor));
            });

            topReviewers.forEach(reviewer => {
                topReviewersList.appendChild(createReviewerListItem(reviewer));
            });

            // Explicitly set the 'active' class on the contributors tab content
            if (contributorsTabContent) {
                contributorsTabContent.classList.add('active');
            }
        } catch (error) {
            console.error('Error fetching contributors or reviewers:', error);
        }
    }
});
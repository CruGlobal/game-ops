// Enhanced Leaderboard Client-Side JavaScript

let allContributors = [];
let allReviewers = [];
let allTimeLeaderboard = [];
let quarterlyLeaderboard = [];
let hallOfFame = [];
let currentQuarterInfo = null;
let currentTab = 'all-time';
let currentSort = 'prCount';
let searchTerm = '';
let userDevOpsStatus = { isDevOps: false, showDevOpsMembers: true, isAuthenticated: false };

document.addEventListener('DOMContentLoaded', async () => {
    await checkDevOpsStatus();
    initializeEventListeners();
    await loadLeaderboardData();
    checkAndShowWinnersBanner();
});

/**
 * Check if current user is in DevOps team
 */
async function checkDevOpsStatus() {
    try {
        const response = await fetch('/api/user/devops-status');
        const data = await response.json();

        if (data.success) {
            userDevOpsStatus = {
                isDevOps: data.isDevOps || false,
                showDevOpsMembers: data.showDevOpsMembers !== undefined ? data.showDevOpsMembers : true,
                isAuthenticated: data.isAuthenticated || false
            };

            // Show toggle if user is DevOps member
            if (userDevOpsStatus.isDevOps) {
                const container = document.getElementById('devops-filter-container');
                const toggle = document.getElementById('show-devops-toggle');
                if (container && toggle) {
                    container.style.display = 'block';
                    toggle.checked = userDevOpsStatus.showDevOpsMembers;
                }
            }
        }
    } catch (error) {
        console.error('Error checking DevOps status:', error);
    }
}

function initializeEventListeners() {
    // Hamburger menu
    const hamburgerButton = document.querySelector('.hamburger-button');
    const hamburgerContent = document.querySelector('.hamburger-content');

    if (hamburgerButton && hamburgerContent) {
        hamburgerButton.addEventListener('click', () => {
            const isActive = hamburgerContent.classList.toggle('active');
            hamburgerContent.style.display = isActive ? 'block' : 'none';
            hamburgerButton.setAttribute('aria-expanded', isActive);
        });
    }

    // DevOps filter toggle
    const devopsToggle = document.getElementById('show-devops-toggle');
    if (devopsToggle) {
        devopsToggle.addEventListener('change', async (e) => {
            userDevOpsStatus.showDevOpsMembers = e.target.checked;
            await saveDevOpsPreference(e.target.checked);
            await loadLeaderboardData(); // Reload all data with new filter
        });
    }

    // Tab switching
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            switchTab(button.dataset.tab);
        });

        // Keyboard navigation for tabs
        button.addEventListener('keydown', (e) => {
            handleTabKeyNavigation(e, button);
        });
    });

    // Search
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchTerm = e.target.value.toLowerCase();
            renderCurrentTab();
        });
    }

    // Sort dropdown
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            currentSort = e.target.value;
            renderCurrentTab();
        });
    }
}

/**
 * Handle keyboard navigation for tabs (Arrow keys)
 */
function handleTabKeyNavigation(e, currentButton) {
    const tabButtons = Array.from(document.querySelectorAll('.tab-button'));
    const currentIndex = tabButtons.indexOf(currentButton);
    let newIndex = currentIndex;

    switch (e.key) {
        case 'ArrowLeft':
            e.preventDefault();
            newIndex = currentIndex > 0 ? currentIndex - 1 : tabButtons.length - 1;
            break;
        case 'ArrowRight':
            e.preventDefault();
            newIndex = currentIndex < tabButtons.length - 1 ? currentIndex + 1 : 0;
            break;
        case 'Home':
            e.preventDefault();
            newIndex = 0;
            break;
        case 'End':
            e.preventDefault();
            newIndex = tabButtons.length - 1;
            break;
        default:
            return;
    }

    tabButtons[newIndex].focus();
    switchTab(tabButtons[newIndex].dataset.tab);
}

function switchTab(tabName) {
    currentTab = tabName;

    // Update tab buttons and ARIA attributes
    document.querySelectorAll('.tab-button').forEach(btn => {
        const isActive = btn.dataset.tab === tabName;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive);
    });

    // Update tab content and hidden attributes
    document.querySelectorAll('.tab-content').forEach(content => {
        const isActive = content.id === tabName;
        content.classList.toggle('active', isActive);
        if (isActive) {
            content.removeAttribute('hidden');
        } else {
            content.setAttribute('hidden', '');
        }
    });

    renderCurrentTab();

    // Announce tab change to screen readers
    announceToScreenReader(`Switched to ${tabName} tab`);
}

/**
 * Announce message to screen readers using ARIA live region
 */
function announceToScreenReader(message) {
    const liveRegion = document.getElementById('sr-live-region') || createLiveRegion();
    liveRegion.textContent = message;

    // Clear after announcement
    setTimeout(() => {
        liveRegion.textContent = '';
    }, 1000);
}

/**
 * Create a screen reader live region if it doesn't exist
 */
function createLiveRegion() {
    const liveRegion = document.createElement('div');
    liveRegion.id = 'sr-live-region';
    liveRegion.className = 'sr-only';
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    document.body.appendChild(liveRegion);
    return liveRegion;
}

async function loadLeaderboardData() {
    try {
        showLoading();

        const [contributorsData, reviewersData, allTimeData, quarterlyData, hallOfFameData, quarterInfoData] = await Promise.all([
            fetchData('/api/top-contributors'),
            fetchData('/api/top-reviewers'),
            fetchData('/api/leaderboard/all-time'),
            fetchData('/api/leaderboard/quarterly'),
            fetchData('/api/leaderboard/hall-of-fame'),
            fetchData('/api/quarter-info')
        ]);

        allContributors = contributorsData;
        allReviewers = reviewersData;
        // Server returns { success, data: [...] } for all-time
        allTimeLeaderboard = allTimeData?.data || allTimeData || [];
        // Server returns { success, data: [...] } for quarterly (array of contributors)
        // Older client expected data.leaderboard; support both just in case
        quarterlyLeaderboard = Array.isArray(quarterlyData?.data)
            ? quarterlyData.data
            : (quarterlyData?.leaderboard || quarterlyData || []);
        hallOfFame = hallOfFameData?.data || [];

        // Update quarter info display
        if (quarterInfoData && quarterInfoData.success) {
            // API returns top-level fields: currentQuarter, quarterStart, quarterEnd
            currentQuarterInfo = {
                currentQuarter: quarterInfoData.currentQuarter,
                quarterDates: {
                    start: quarterInfoData.quarterStart,
                    end: quarterInfoData.quarterEnd
                }
            };
            updateQuarterInfoDisplay();
        }

        renderCurrentTab();
    } catch (error) {
        console.error('Error loading leaderboard data:', error);
        showError('Failed to load leaderboard data');
    }
}

function updateQuarterInfoDisplay() {
    if (!currentQuarterInfo) return;

    const titleEl = document.getElementById('current-quarter-title');
    const datesEl = document.getElementById('current-quarter-dates');

    if (titleEl) {
        titleEl.textContent = `Current Quarter: ${currentQuarterInfo.currentQuarter}`;
    }

    if (datesEl) {
        const startDate = new Date(currentQuarterInfo.quarterDates.start).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        const endDate = new Date(currentQuarterInfo.quarterDates.end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        datesEl.textContent = `${startDate} - ${endDate}`;
    }
}

/**
 * Show a winners banner if the most recent Hall of Fame entry was archived within the last 7 days.
 * Respects localStorage dismissal keyed by quarter.
 */
function checkAndShowWinnersBanner() {
    if (!hallOfFame || hallOfFame.length === 0) return;

    // Sort descending by year then quarterNumber to get most recent
    const sorted = [...hallOfFame].sort((a, b) => {
        if (b.year !== a.year) return b.year - a.year;
        return b.quarterNumber - a.quarterNumber;
    });

    const recent = sorted[0];
    if (!recent || !recent.archivedDate) return;

    const archivedDate = new Date(recent.archivedDate);
    const daysSinceArchived = (Date.now() - archivedDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceArchived > 7) return;

    // Check if user dismissed this banner
    const dismissKey = `dismissed-banner-${recent.quarter}`;
    if (localStorage.getItem(dismissKey)) return;

    const banner = document.getElementById('winners-banner');
    const content = document.getElementById('winners-banner-content');
    if (!banner || !content) return;

    const winner = recent.winner || {};
    const top3 = recent.top3 || [];
    const medals = ['🥇', '🥈', '🥉'];

    let podiumHTML = '';
    if (top3.length > 0) {
        podiumHTML = `<div class="winners-banner-podium">
            ${top3.slice(0, 3).map((c, i) => `
                <div class="winners-banner-podium-item">
                    ${medals[i] || ''}
                    <img src="${c.avatarUrl || '/images/default-avatar.png'}" alt="${c.username}">
                    ${c.username} — ${c.pointsThisQuarter || 0} pts
                </div>
            `).join('')}
        </div>`;
    }

    content.innerHTML = `
        <div class="winners-banner-title">👑 ${recent.quarter} Quarter Champions</div>
        <div class="winners-banner-champion">
            <img src="${winner.avatarUrl || '/images/default-avatar.png'}" alt="${winner.username}">
            <div class="winners-banner-champion-info">
                <div class="winners-banner-champion-name">${winner.username || 'N/A'}</div>
                <div class="winners-banner-champion-stats">${winner.pointsThisQuarter || 0} pts | ${winner.prsThisQuarter || 0} PRs | ${winner.reviewsThisQuarter || 0} Reviews</div>
            </div>
        </div>
        ${podiumHTML}
    `;

    banner.style.display = 'block';

    // Dismiss handler
    const dismissBtn = banner.querySelector('.winners-banner-dismiss');
    if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
            banner.style.display = 'none';
            localStorage.setItem(dismissKey, 'true');
        });
    }
}

async function fetchData(url) {
    const response = await fetch(url, {
        credentials: 'include' // Include cookies for session management
    });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
}

/**
 * Save user's DevOps filter preference
 */
async function saveDevOpsPreference(showDevOpsMembers) {
    try {
        const response = await fetch('/api/user/preferences/show-devops', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ showDevOpsMembers })
        });

        const data = await response.json();
        if (!data.success) {
            console.error('Failed to save preference:', data.message);
        }
    } catch (error) {
        console.error('Error saving DevOps preference:', error);
    }
}

function renderCurrentTab() {
    switch (currentTab) {
        case 'all-time':
            renderAllTimeLeaderboard();
            break;
        case 'quarterly':
            renderQuarterlyLeaderboard();
            break;
        case 'hall-of-fame':
            renderHallOfFame();
            break;
        case 'contributors':
            renderTopContributors();
            break;
        case 'reviewers':
            renderTopReviewers();
            break;
        case 'points':
            renderTopPoints();
            break;
        case 'streaks':
            renderTopStreaks();
            break;
    }
}

function renderAllLeaders() {
    // Merge and deduplicate contributors and reviewers
    const allUsers = [...allContributors];

    // Add any reviewers not already in the list
    allReviewers.forEach(reviewer => {
        if (!allUsers.find(u => u.username === reviewer.username)) {
            allUsers.push(reviewer);
        }
    });

    const filteredUsers = filterUsers(allUsers);
    const sortedUsers = sortUsers(filteredUsers, currentSort);

    renderLeaderboard('all-leaders-grid', sortedUsers, 'all');
}

function renderTopContributors() {
    const filteredContributors = filterUsers(allContributors);
    const sortedContributors = sortUsers(filteredContributors, 'prCount');

    renderLeaderboard('contributors-grid', sortedContributors, 'contributors');
}

function renderTopReviewers() {
    const filteredReviewers = filterUsers(allReviewers);
    const sortedReviewers = sortUsers(filteredReviewers, 'reviewCount');

    renderLeaderboard('reviewers-grid', sortedReviewers, 'reviewers');
}

function renderTopPoints() {
    const allUsers = [...allContributors, ...allReviewers].reduce((acc, user) => {
        if (!acc.find(u => u.username === user.username)) {
            acc.push(user);
        }
        return acc;
    }, []);

    const filteredUsers = filterUsers(allUsers);
    const sortedUsers = sortUsers(filteredUsers, 'totalPoints');

    renderLeaderboard('points-grid', sortedUsers, 'points');
}

function renderTopStreaks() {
    const allUsers = [...allContributors, ...allReviewers].reduce((acc, user) => {
        if (!acc.find(u => u.username === user.username)) {
            acc.push(user);
        }
        return acc;
    }, []);

    const filteredUsers = filterUsers(allUsers);
    const sortedUsers = sortUsers(filteredUsers, 'currentStreak');

    renderLeaderboard('streaks-grid', sortedUsers, 'streaks');
}

function renderAllTimeLeaderboard() {
    const filteredUsers = filterUsers(allTimeLeaderboard);
    const sortedUsers = sortUsers(filteredUsers, currentSort);

    renderLeaderboard('all-time-grid', sortedUsers, 'all-time');
}

function renderQuarterlyLeaderboard() {
    const filteredUsers = filterUsers(quarterlyLeaderboard);
    // Controller flattens pointsThisQuarter to top-level; sort by that for correctness
    const sortedUsers = sortUsers(filteredUsers, 'pointsThisQuarter');

    renderQuarterlyGrid('quarterly-grid', sortedUsers);
}

function renderQuarterlyGrid(gridId, users) {
    const grid = document.getElementById(gridId);
    if (!grid) return;

    grid.innerHTML = '';

    if (users.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📅</div>
                <div class="empty-state-text">No contributors this quarter yet</div>
            </div>
        `;
        return;
    }

    users.forEach((user, index) => {
        const card = createQuarterlyCard(user, index + 1);
        grid.appendChild(card);
    });
}

function createQuarterlyCard(user, rank) {
    const card = document.createElement('div');
    card.className = 'leaderboard-card';
    card.setAttribute('data-username', user.username);
    card.setAttribute('data-rank', rank);
    card.style.cursor = 'pointer';

    // Make card clickable to navigate to profile
    card.addEventListener('click', () => {
        window.location.href = `/profile/${user.username}`;
    });

    // Rank display: medal + number for top 3, just number for others
    const rankBadgeClass = rank <= 3 ? `rank-badge rank-${rank}` : 'rank-badge';
    const medalEmoji = rank === 1 ? '🥇 ' : rank === 2 ? '🥈 ' : rank === 3 ? '🥉 ' : '';
    const rankDisplay = `${medalEmoji}#${rank}`;

    const quarterStats = user.quarterlyStats || {};
    const prsThisQuarter = (typeof user.prsThisQuarter === 'number') ? user.prsThisQuarter : (quarterStats.prsThisQuarter || 0);
    const reviewsThisQuarter = (typeof user.reviewsThisQuarter === 'number') ? user.reviewsThisQuarter : (quarterStats.reviewsThisQuarter || 0);
    const pointsThisQuarter = (typeof user.pointsThisQuarter === 'number') ? user.pointsThisQuarter : (quarterStats.pointsThisQuarter || 0);

    card.innerHTML = `
        <div class="${rankBadgeClass}" data-rank-display>${rankDisplay}</div>

        <div class="contributor-info">
            <div class="contributor-header">
                <img src="${user.avatarUrl}" alt="${user.username}" class="contributor-avatar">
                <div class="contributor-name">${user.username}</div>
            </div>
            <div class="stats-row">
                <div class="stat-item">
                    <span class="stat-icon">📝</span>
                    <div>
                        <div class="stat-label">PRs</div>
                        <div class="stat-value" data-stat="prsThisQuarter">${prsThisQuarter}</div>
                    </div>
                </div>
                <div class="stat-item">
                    <span class="stat-icon">👀</span>
                    <div>
                        <div class="stat-label">Reviews</div>
                        <div class="stat-value" data-stat="reviewsThisQuarter">${reviewsThisQuarter}</div>
                    </div>
                </div>
                <div class="stat-item">
                    <span class="stat-icon">⭐</span>
                    <div>
                        <div class="stat-label">Points</div>
                        <div class="stat-value" data-stat="pointsThisQuarter">${pointsThisQuarter}</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="badges-section">
            <div class="quarter-badge">📅 This Quarter</div>
        </div>
    `;

    return card;
}

function renderHallOfFame() {
    const container = document.getElementById('hall-of-fame-container');
    if (!container) return;

    container.innerHTML = '';

    if (hallOfFame.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🏆</div>
                <div class="empty-state-text">No quarterly winners yet</div>
            </div>
        `;
        return;
    }

    hallOfFame.forEach((winner, index) => {
        const winnerCard = createHallOfFameCard(winner, index + 1);
        container.appendChild(winnerCard);
    });
}

function createHallOfFameCard(winner, index) {
    const card = document.createElement('div');
    card.className = 'hall-of-fame-card';

    const winnerData = winner.winner || {};
    const top3 = winner.top3 || [];

    // Get rank emojis for top 3
    const getRankDisplay = (rank) => {
        if (rank === 1) return '<span class="rank-badge rank-1">🥇</span>';
        if (rank === 2) return '<span class="rank-badge rank-2">🥈</span>';
        if (rank === 3) return '<span class="rank-badge rank-3">🥉</span>';
        return `<span class="rank-badge">${rank}</span>`;
    };

    card.innerHTML = `
        <div class="hall-card-header">
            <div class="quarter-badge">${winner.quarter}</div>
            <div class="quarter-date">${new Date(winner.quarterStart).toLocaleDateString()} - ${new Date(winner.quarterEnd).toLocaleDateString()}</div>
        </div>

        <div class="hall-champion">
            <div class="champion-crown">👑</div>
            <img src="${winnerData.avatarUrl || '/images/default-avatar.png'}"
                 alt="${winnerData.username}'s avatar"
                 class="champion-avatar">
            <div class="champion-name">${winnerData.username}</div>
            <div class="champion-stats">
                <div class="stat-pill">
                    <span class="stat-icon">⭐</span>
                    <span class="stat-value">${winnerData.pointsThisQuarter || 0}</span>
                </div>
                <div class="stat-pill">
                    <span class="stat-icon">📝</span>
                    <span class="stat-value">${winnerData.prsThisQuarter || 0}</span>
                </div>
                <div class="stat-pill">
                    <span class="stat-icon">👀</span>
                    <span class="stat-value">${winnerData.reviewsThisQuarter || 0}</span>
                </div>
            </div>
        </div>

        ${top3.length > 1 ? `
            <div class="hall-podium">
                <div class="podium-title">Top 3</div>
                ${top3.slice(0, 3).map(contributor => `
                    <div class="podium-item">
                        ${getRankDisplay(contributor.rank || 0)}
                        <img src="${contributor.avatarUrl || '/images/default-avatar.png'}"
                             alt="${contributor.username || 'Unknown'}"
                             class="podium-avatar">
                        <div class="podium-info">
                            <div class="podium-name">${contributor.username || 'Unknown'}</div>
                            <div class="podium-points">${contributor.pointsThisQuarter || 0} pts</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        ` : ''}

        <div class="hall-footer">
            <span class="participants-count">👥 ${winner.totalParticipants || 0} contributors</span>
        </div>
    `;

    return card;
}

function filterUsers(users) {
    if (!searchTerm) return users;

    return users.filter(user =>
        user.username.toLowerCase().includes(searchTerm)
    );
}

function sortUsers(users, sortBy) {
    return [...users].sort((a, b) => {
        const aVal = a[sortBy] || 0;
        const bVal = b[sortBy] || 0;
        return bVal - aVal;
    });
}

function renderLeaderboard(gridId, users, type) {
    const grid = document.getElementById(gridId);
    if (!grid) return;

    grid.innerHTML = '';

    if (users.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔍</div>
                <div class="empty-state-text">No contributors found</div>
            </div>
        `;
        return;
    }

    users.forEach((user, index) => {
        const card = createLeaderboardCard(user, index + 1, type);
        grid.appendChild(card);
    });
}

function createLeaderboardCard(user, rank, type) {
    const card = document.createElement('div');
    card.className = 'leaderboard-card';
    card.setAttribute('data-username', user.username);
    card.setAttribute('data-rank', rank);
    card.style.cursor = 'pointer';

    // Make card clickable to navigate to profile
    card.addEventListener('click', () => {
        window.location.href = `/profile/${user.username}`;
    });

    // Rank display: medal + number for top 3, just number for others
    const rankBadgeClass = rank <= 3 ? `rank-badge rank-${rank}` : 'rank-badge';
    const medalEmoji = rank === 1 ? '🥇 ' : rank === 2 ? '🥈 ' : rank === 3 ? '🥉 ' : '';
    const rankDisplay = `${medalEmoji}#${rank}`;

    // Stats based on type
    const statsHTML = generateStatsHTML(user, type);

    // Badges
    const badgesHTML = generateBadgesHTML(user);

    card.innerHTML = `
        <div class="${rankBadgeClass}" data-rank-display>${rankDisplay}</div>

        <div class="contributor-info">
            <div class="contributor-header">
                <img src="${user.avatarUrl}" alt="${user.username}" class="contributor-avatar">
                <div class="contributor-name">${user.username}</div>
            </div>
            <div class="stats-row">
                ${statsHTML}
            </div>
        </div>

        <div class="badges-section">
            ${type === 'all-time' ? '<div class="alltime-badge">🌟 All-Time</div>' : ''}
            ${badgesHTML}
        </div>
    `;

    return card;
}

function generateStatsHTML(user, type) {
    const stats = [];

    // Always show PRs and Reviews for 'all-time' tab
    if (type === 'all-time' || type === 'contributors') {
        stats.push(`
            <div class="stat-item">
                <span class="stat-icon">📝</span>
                <div>
                    <div class="stat-label">PRs</div>
                    <div class="stat-value" data-stat="prCount">${user.prCount || 0}</div>
                </div>
            </div>
        `);
    }

    if (type === 'all-time' || type === 'reviewers') {
        stats.push(`
            <div class="stat-item">
                <span class="stat-icon">👀</span>
                <div>
                    <div class="stat-label">Reviews</div>
                    <div class="stat-value" data-stat="reviewCount">${user.reviewCount || 0}</div>
                </div>
            </div>
        `);
    }

    if (type === 'all-time' || type === 'points') {
        stats.push(`
            <div class="stat-item">
                <span class="stat-icon">⭐</span>
                <div>
                    <div class="stat-label">Points</div>
                    <div class="stat-value" data-stat="totalPoints">${user.totalPoints || 0}</div>
                </div>
            </div>
        `);
    }

    if (type === 'all-time' || type === 'streaks') {
        stats.push(`
            <div class="stat-item">
                <span class="stat-icon">🔥</span>
                <div>
                    <div class="stat-label">Streak</div>
                    <div class="stat-value" data-stat="currentStreak">${user.currentStreak || 0} days</div>
                </div>
            </div>
        `);
    }

    // Bills awarded
    if (user.totalBillsAwarded) {
        stats.push(`
            <div class="stat-item">
                <span class="stat-icon">💵</span>
                <div>
                    <div class="stat-label">Bills</div>
                    <div class="stat-value" data-stat="totalBillsAwarded">${user.totalBillsAwarded}</div>
                </div>
            </div>
        `);
    }

    return stats.join('');
}

function generateBadgesHTML(user) {
    const elements = [];

    // Points badge
    if (user.totalPoints && user.totalPoints > 0) {
        elements.push(`
            <div class="points-badge">
                ⭐ ${user.totalPoints} points
            </div>
        `);
    }

    // Current streak
    if (user.currentStreak && user.currentStreak > 0) {
        const isActive = user.currentStreak > 0;
        elements.push(`
            <div class="streak-indicator ${isActive ? 'active' : ''}">
                🔥 ${user.currentStreak} day streak
            </div>
        `);
    }

    // Streak badges
    if (user.streakBadges) {
        const streakBadgesList = [];
        if (user.streakBadges.sevenDay) streakBadgesList.push('Week Warrior 🗓️');
        if (user.streakBadges.thirtyDay) streakBadgesList.push('Monthly Master 📅');
        if (user.streakBadges.ninetyDay) streakBadgesList.push('Quarter Champion 🏅');
        if (user.streakBadges.yearLong) streakBadgesList.push('Year-Long Hero 🎖️');

        if (streakBadgesList.length > 0) {
            elements.push(`
                <div class="badges-grid">
                    ${streakBadgesList.map(badge => `<span title="${badge}">${badge.split(' ')[1]}</span>`).join('')}
                </div>
            `);
        }
    }

    // PR/Review badges
    const streakBadgeImages = {
        'Week Warrior': '/images/badges/50_prs_badge.png',
        'Monthly Master': '/images/badges/100_prs_badge.png',
        'Quarter Champion': '/images/badges/500_prs_badge.png',
        'Year-Long Hero': '/images/badges/1000_prs_badge.png'
    };
    if (user.badges && user.badges.length > 0) {
        const badgeImages = user.badges
            .slice(0, 5) // Limit to 5 badges for display
            .map(badge => {
                const badgeName = typeof badge === 'string' ? badge : badge.badge;
                const src = streakBadgeImages[badgeName] || `/images/badges/${badgeName.replace(/ /g, '_').toLowerCase()}.png`;
                return `<img src="${src}" alt="${badgeName}" class="badge-item" title="${badgeName}">`;
            })
            .join('');

        if (badgeImages) {
            elements.push(`
                <div class="badges-grid">
                    ${badgeImages}
                </div>
            `);
        }
    }

    return elements.join('');
}

function showLoading() {
    const grids = ['all-time-grid', 'quarterly-grid', 'contributors-grid', 'reviewers-grid', 'points-grid', 'streaks-grid'];
    grids.forEach(gridId => {
        const grid = document.getElementById(gridId);
        if (grid) {
            grid.innerHTML = `
                <div class="loading-spinner">
                    <div class="spinner"></div>
                </div>
            `;
        }
    });
}

function showError(message) {
    const grids = ['all-time-grid', 'quarterly-grid', 'contributors-grid', 'reviewers-grid', 'points-grid', 'streaks-grid'];
    grids.forEach(gridId => {
        const grid = document.getElementById(gridId);
        if (grid) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">⚠️</div>
                    <div class="empty-state-text">${message}</div>
                </div>
            `;
        }
    });
}

// Socket.IO real-time updates - use the shared socket from socket-client.js
(function initLeaderboardSocket() {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function getSocket() {
        return window.realtimeSocket;
    }

    // Trailing debounce: resets on each event, waits for 2s of quiet before refreshing.
    // This ensures we capture the final state after rapid-fire updates.
    let refreshTimer = null;
    let pendingUsernames = new Set();
    let isAnimating = false; // Lock to prevent concurrent animations

    function debouncedSmartRefresh(username) {
        if (username) pendingUsernames.add(username);
        window.leaderboardPending = true;

        // Reset timer on every event — fires 2s after the LAST event
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(async () => {
            refreshTimer = null;
            const usernamesToHighlight = new Set(pendingUsernames);
            pendingUsernames.clear();

            // If an animation is already running, defer until it finishes
            if (isAnimating) {
                debouncedSmartRefresh();
                return;
            }

            await smartRefresh(usernamesToHighlight);
        }, 2000);
    }

    /**
     * Smart refresh: fetch fresh data, diff against current DOM, update only changed values.
     * Falls back to full re-render only if the grid structure changed (new/removed users, rank reorder).
     */
    async function smartRefresh(changedUsernames) {
        isAnimating = true;
        window.leaderboardAnimating = true;
        try {
            // Helper: merge contributors + reviewers (deduped) for points/streaks tabs
            function mergeAllUsers(contributors, reviewers) {
                return [...contributors, ...reviewers].reduce((acc, user) => {
                    if (!acc.find(u => u.username === user.username)) acc.push(user);
                    return acc;
                }, []);
            }

            // Snapshot the old data for comparison
            const oldAllTime = [...allTimeLeaderboard];
            const oldQuarterly = [...quarterlyLeaderboard];
            const oldContributors = [...allContributors];
            const oldReviewers = [...allReviewers];
            const oldAllUsers = mergeAllUsers(oldContributors, oldReviewers);

            // Fetch fresh data (same as loadLeaderboardData but without showLoading)
            const [contributorsData, reviewersData, allTimeData, quarterlyData, hallOfFameData, quarterInfoData] = await Promise.all([
                fetchData('/api/top-contributors'),
                fetchData('/api/top-reviewers'),
                fetchData('/api/leaderboard/all-time'),
                fetchData('/api/leaderboard/quarterly'),
                fetchData('/api/leaderboard/hall-of-fame'),
                fetchData('/api/quarter-info')
            ]);

            allContributors = contributorsData;
            allReviewers = reviewersData;
            allTimeLeaderboard = allTimeData?.data || allTimeData || [];
            quarterlyLeaderboard = Array.isArray(quarterlyData?.data)
                ? quarterlyData.data
                : (quarterlyData?.leaderboard || quarterlyData || []);
            hallOfFame = hallOfFameData?.data || [];

            if (quarterInfoData && quarterInfoData.success) {
                currentQuarterInfo = {
                    currentQuarter: quarterInfoData.currentQuarter,
                    quarterDates: { start: quarterInfoData.quarterStart, end: quarterInfoData.quarterEnd }
                };
                updateQuarterInfoDisplay();
            }

            const newAllUsers = mergeAllUsers(allContributors, allReviewers);

            // Determine which grids need a full re-render vs. in-place update
            const gridConfigs = [
                { gridId: 'all-time-grid', oldData: oldAllTime, newData: allTimeLeaderboard, sortKey: currentSort, type: 'all-time' },
                { gridId: 'quarterly-grid', oldData: oldQuarterly, newData: quarterlyLeaderboard, sortKey: 'pointsThisQuarter', type: 'quarterly' },
                { gridId: 'contributors-grid', oldData: oldContributors, newData: allContributors, sortKey: 'prCount', type: 'contributors' },
                { gridId: 'reviewers-grid', oldData: oldReviewers, newData: allReviewers, sortKey: 'reviewCount', type: 'reviewers' },
                { gridId: 'points-grid', oldData: oldAllUsers, newData: newAllUsers, sortKey: 'totalPoints', type: 'points' },
                { gridId: 'streaks-grid', oldData: oldAllUsers, newData: newAllUsers, sortKey: 'currentStreak', type: 'streaks' },
            ];

            // Collect grid analysis before animating
            const gridUpdates = [];

            for (const config of gridConfigs) {
                const grid = document.getElementById(config.gridId);
                if (!grid || grid.closest('[hidden]')) continue; // skip hidden tabs

                const oldSorted = sortUsers(filterUsers(config.oldData), config.sortKey);
                const newSorted = sortUsers(filterUsers(config.newData), config.sortKey);

                const oldOrder = oldSorted.map(u => u.username);
                const newOrder = newSorted.map(u => u.username);
                const orderChanged = oldOrder.length !== newOrder.length || oldOrder.some((u, i) => u !== newOrder[i]);

                gridUpdates.push({ grid, newSorted, type: config.type, orderChanged });
            }

            // Find the first changed card to scroll to
            const firstChangedCard = findFirstChangedCard(gridUpdates, changedUsernames);

            // Phase 1: Slow scroll to the card's current position
            if (firstChangedCard) {
                await smoothScrollTo(firstChangedCard, 4500);
                await wait(400); // Pause so user can see the card
            }

            // Capture old ranks from DOM BEFORE Phase 2 updates them
            const preUpdateRanks = new Map();
            for (const { grid } of gridUpdates) {
                grid.querySelectorAll('[data-username]').forEach(card => {
                    const username = card.getAttribute('data-username');
                    const rank = parseInt(card.getAttribute('data-rank'), 10);
                    if (!preUpdateRanks.has(username)) preUpdateRanks.set(username, rank);
                });
            }

            // Phase 2: Update stats in-place (number change animation)
            for (const { grid, newSorted } of gridUpdates) {
                updateStatsInPlace(grid, newSorted, changedUsernames);
            }

            // Phase 3: After stats animate, shuffle cards to new rank positions
            const pendingRerenders = gridUpdates.filter(g => g.orderChanged);
            if (pendingRerenders.length > 0) {
                await wait(1000); // Let stat animation finish

                for (const { grid, newSorted, type } of pendingRerenders) {
                    smoothRerender(grid, newSorted, type, changedUsernames, preUpdateRanks);
                }

                // Phase 4: Follow the card as it slides up during FLIP
                const movingCard = findFirstChangedCard(gridUpdates, changedUsernames);
                if (movingCard) {
                    await followCardDuringFlip(movingCard, 4300);

                    // Phase 5: Blue highlight at destination
                    movingCard.classList.add('live-update-highlight');
                    movingCard.classList.add('card-pop');
                    await wait(2000); // Let user see the highlight
                    movingCard.classList.remove('card-pop');

                    // Phase 6: Slow scroll to the very top of the page
                    await scrollToTop(4500);
                    await wait(500);
                    movingCard.classList.remove('live-update-highlight');
                }
            }

            // Hall of fame: always full render (rarely changes, static data)
            // Only re-render if tab is visible
            const hofContainer = document.getElementById('hall-of-fame-container');
            if (hofContainer && !hofContainer.closest('[hidden]')) {
                renderHallOfFame();
            }

        } catch (error) {
            console.error('Smart refresh failed, falling back to full reload:', error);
            await loadLeaderboardData();
        } finally {
            isAnimating = false;
            window.leaderboardAnimating = false;
            window.leaderboardPending = false;
        }
    }

    /**
     * Update stat values in-place on existing cards — zero flicker.
     */
    function updateStatsInPlace(grid, newData, changedUsernames) {
        for (let i = 0; i < newData.length; i++) {
            const user = newData[i];
            const newRank = i + 1;
            const card = grid.querySelector(`[data-username="${user.username}"]`);
            if (!card) continue;

            let hasChanges = false;

            // Update rank number if it changed (with micro-animation)
            const rankEl = card.querySelector('[data-rank-display]');
            const oldRank = parseInt(card.getAttribute('data-rank'));
            if (rankEl && oldRank !== newRank) {
                animateRankChange(rankEl, oldRank, newRank);
                card.setAttribute('data-rank', newRank);
                rankEl.className = newRank <= 3 ? `rank-badge rank-${newRank}` : 'rank-badge';
            }

            // Update each stat value that has a data-stat attribute
            const statFields = {
                prCount: user.prCount || 0,
                reviewCount: user.reviewCount || 0,
                totalPoints: user.totalPoints || 0,
                currentStreak: user.currentStreak || 0,
                totalBillsAwarded: user.totalBillsAwarded || 0,
                prsThisQuarter: user.prsThisQuarter || (user.quarterlyStats?.prsThisQuarter) || 0,
                reviewsThisQuarter: user.reviewsThisQuarter || (user.quarterlyStats?.reviewsThisQuarter) || 0,
                pointsThisQuarter: user.pointsThisQuarter || (user.quarterlyStats?.pointsThisQuarter) || 0,
            };

            for (const [stat, newValue] of Object.entries(statFields)) {
                const el = card.querySelector(`[data-stat="${stat}"]`);
                if (!el) continue;

                const displayValue = stat === 'currentStreak' ? `${newValue} days` : String(newValue);
                const currentText = el.textContent.trim();

                if (currentText !== displayValue) {
                    animateStatChange(el, currentText, displayValue);
                    hasChanges = true;
                }
            }

            // Highlight the card if it changed
            if (hasChanges || changedUsernames.has(user.username)) {
                playCardUpdateAnimation(card);
            }
        }
    }

    /**
     * Find the first changed username's card in the visible grids.
     */
    function findFirstChangedCard(gridUpdates, changedUsernames) {
        for (const { grid } of gridUpdates) {
            for (const username of changedUsernames) {
                const card = grid.querySelector(`[data-username="${username}"]`);
                if (card) return card;
            }
        }
        return null;
    }

    /**
     * Promise-based wait helper.
     */
    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Custom smooth scroll with controllable duration using easing.
     * Returns a promise that resolves when the scroll completes.
     * Skips scrolling if the card is already in view.
     */
    function smoothScrollTo(card, duration = 2500) {
        return new Promise(resolve => {
            const rect = card.getBoundingClientRect();
            const inView = rect.top >= 80 && rect.bottom <= window.innerHeight - 40;
            if (inView) { resolve(); return; }

            if (prefersReducedMotion) {
                card.scrollIntoView({ block: 'center' });
                resolve();
                return;
            }

            const startY = window.scrollY;
            const targetY = startY + rect.top - (window.innerHeight / 2) + (rect.height / 2);
            const distance = targetY - startY;
            const startTime = performance.now();

            // Gentle ease — slow start, slow finish, very smooth middle
            function easeInOutCubic(t) {
                return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
            }

            function step(currentTime) {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = easeInOutCubic(progress);

                window.scrollTo(0, startY + distance * eased);

                if (progress < 1) {
                    requestAnimationFrame(step);
                } else {
                    resolve();
                }
            }

            requestAnimationFrame(step);
        });
    }

    /**
     * Smooth scroll to the very top of the page with controllable duration.
     */
    function scrollToTop(duration = 4000) {
        return new Promise(resolve => {
            const startY = window.scrollY;
            if (startY < 10) { resolve(); return; }

            if (prefersReducedMotion) {
                window.scrollTo(0, 0);
                resolve();
                return;
            }

            const startTime = performance.now();

            function easeInOutCubic(t) {
                return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
            }

            function step(currentTime) {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = easeInOutCubic(progress);

                window.scrollTo(0, startY * (1 - eased));

                if (progress < 1) {
                    requestAnimationFrame(step);
                } else {
                    resolve();
                }
            }

            requestAnimationFrame(step);
        });
    }

    /**
     * Follow a card with the viewport as it slides during a FLIP animation.
     * Continuously centers the card in the viewport until the transition ends.
     */
    function followCardDuringFlip(card, duration) {
        return new Promise(resolve => {
            if (prefersReducedMotion) {
                card.scrollIntoView({ block: 'center' });
                resolve();
                return;
            }

            const startTime = performance.now();
            const viewportCenter = window.innerHeight / 2;

            function track(now) {
                const elapsed = now - startTime;
                if (elapsed >= duration) {
                    const finalRect = card.getBoundingClientRect();
                    const finalOffset = finalRect.top + finalRect.height / 2 - viewportCenter;
                    if (Math.abs(finalOffset) > 5) {
                        window.scrollBy(0, finalOffset);
                    }
                    resolve();
                    return;
                }

                const rect = card.getBoundingClientRect();
                const cardCenter = rect.top + rect.height / 2;
                const offset = cardCenter - viewportCenter;

                // Time-based damping: ~8% per frame at 60fps, framerate-independent
                const dt = 1 / 60;
                const damping = 1 - Math.pow(0.005, dt);

                if (Math.abs(offset) > 20) {
                    window.scrollBy(0, offset * damping);
                }

                requestAnimationFrame(track);
            }

            requestAnimationFrame(track);
        });
    }

    /**
     * Animate a stat value changing from old to new.
     */
    function animateStatChange(el, oldText, newText) {
        if (prefersReducedMotion) {
            el.textContent = newText;
            return;
        }

        const oldNum = parseInt(oldText.replace(/[^\d]/g, ''), 10);
        const newNum = parseInt(newText.replace(/[^\d]/g, ''), 10);
        const suffix = newText.replace(/[\d,]+/, ''); // e.g., " days"

        if (isNaN(oldNum) || isNaN(newNum) || oldNum === newNum) {
            el.textContent = newText;
            el.classList.add('stat-changed');
            setTimeout(() => el.classList.remove('stat-changed'), 1500);
            return;
        }

        const duration = 1200;
        const startTime = performance.now();
        const delta = newNum - oldNum;

        el.style.transition = 'transform 0.3s ease-out';
        el.style.transform = 'scale(1.15)';

        function step(now) {
            const progress = Math.min((now - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
            const current = Math.round(oldNum + delta * eased);
            el.textContent = `${current}${suffix}`;

            if (progress < 1) {
                requestAnimationFrame(step);
            } else {
                el.textContent = newText;
                el.style.transform = '';
                el.classList.add('stat-changed');
                setTimeout(() => {
                    el.classList.remove('stat-changed');
                    el.style.transition = '';
                }, 1500);
            }
        }

        requestAnimationFrame(step);
        setTimeout(() => { el.style.transform = 'scale(1.0)'; }, 300);
    }

    /**
     * Play a fun attention-grabbing animation on an updated card.
     */
    function playCardUpdateAnimation(card) {
        card.classList.add('live-update-highlight');
        card.classList.add('card-pop');
        setTimeout(() => {
            card.classList.remove('card-pop');
        }, 600);
        setTimeout(() => {
            card.classList.remove('live-update-highlight');
        }, 2500);
    }

    /**
     * FLIP animation: cards physically slide to their new rank positions.
     * (First, Last, Invert, Play)
     */
    function smoothRerender(grid, newData, type, changedUsernames, oldRanks) {
        const existingCards = grid.querySelectorAll('[data-username]');

        // FIRST: record current positions of all cards
        const firstPositions = new Map();
        existingCards.forEach(card => {
            const username = card.getAttribute('data-username');
            const rect = card.getBoundingClientRect();
            firstPositions.set(username, { top: rect.top, left: rect.left });
        });
        // oldRanks is passed in from smartRefresh (captured before Phase 2 updates data-rank)

        // Rebuild the grid with new order — hide during rebuild to prevent flash
        grid.style.visibility = 'hidden';
        grid.innerHTML = '';
        if (newData.length === 0) {
            grid.style.visibility = '';
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔍</div>
                    <div class="empty-state-text">No contributors found</div>
                </div>
            `;
            return;
        }

        if (type === 'quarterly') {
            newData.forEach((user, index) => grid.appendChild(createQuarterlyCard(user, index + 1)));
        } else {
            newData.forEach((user, index) => grid.appendChild(createLeaderboardCard(user, index + 1, type)));
        }

        // Force layout calculation while hidden, then reveal
        grid.getBoundingClientRect();
        grid.style.visibility = '';

        // LAST: record new positions
        const newCards = grid.querySelectorAll('[data-username]');

        if (prefersReducedMotion) {
            // Skip animation entirely for reduced-motion preference
            return;
        }

        // INVERT + PLAY: animate each card from old position to new
        const flipPromises = [];
        let staggerIndex = 0;
        newCards.forEach(card => {
            const username = card.getAttribute('data-username');
            const oldPos = firstPositions.get(username);
            if (!oldPos) return; // new card, no old position

            const newRect = card.getBoundingClientRect();
            const deltaY = oldPos.top - newRect.top;
            const deltaX = oldPos.left - newRect.left;

            if (Math.abs(deltaY) < 2 && Math.abs(deltaX) < 2) return; // didn't move

            card.style.zIndex = changedUsernames.has(username) ? '10' : '1';
            card.style.willChange = 'transform';

            // Add elevation for cards that move significantly
            if (Math.abs(deltaY) > 50) {
                card.style.boxShadow = '0 12px 40px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.1)';
            }

            const animation = card.animate([
                { transform: `translate(${deltaX}px, ${deltaY}px)` },
                { transform: 'none' }
            ], {
                duration: 4000,
                easing: 'cubic-bezier(0.4, 0.0, 0.2, 1.0)',
                fill: 'both',
                delay: staggerIndex * 100
            });

            flipPromises.push(animation.finished.then(() => {
                card.style.willChange = '';
                card.style.zIndex = '';
                card.style.boxShadow = '';
            }));

            staggerIndex++;
        });

        if (!prefersReducedMotion) {
            // Dim non-moving cards and highlight hero
            newCards.forEach(card => {
                const username = card.getAttribute('data-username');
                const oldPos = firstPositions.get(username);
                if (!oldPos) return;

                const newRect = card.getBoundingClientRect();
                const deltaY = oldPos.top - newRect.top;
                const moved = Math.abs(deltaY) > 2;

                if (moved && changedUsernames.has(username)) {
                    card.classList.add('flip-hero');
                } else if (!moved) {
                    card.classList.add('flip-dimmed');
                }
            });

            // Remove dim/hero after FLIP completes (3.2s base + stagger buffer)
            const cleanupDelay = 4000 + (staggerIndex * 100) + 200;
            setTimeout(() => {
                grid.querySelectorAll('.flip-dimmed').forEach(c => c.classList.remove('flip-dimmed'));
                grid.querySelectorAll('.flip-hero').forEach(c => c.classList.remove('flip-hero'));
            }, cleanupDelay);

            // Confetti for big rank jumps (10+ positions)
            newCards.forEach(card => {
                const username = card.getAttribute('data-username');
                if (!changedUsernames.has(username)) return;

                const newRank = parseInt(card.getAttribute('data-rank'), 10);
                const oldRank = oldRanks.get(username);
                if (oldRank === undefined || isNaN(oldRank)) return;

                const rankJump = oldRank - newRank;
                if (rankJump >= 10 && window.confetti) {
                    const arrivalDelay = Math.min(4000 + (staggerIndex * 100), 5000);
                    setTimeout(() => {
                        const rect = card.getBoundingClientRect();
                        window.confetti.burst({
                            x: rect.left + rect.width / 2,
                            y: rect.top + rect.height / 2,
                            count: Math.min(30 + rankJump * 2, 80),
                            spread: 360
                        });
                    }, arrivalDelay);
                }
            });
        }

        // Return promise that resolves when all FLIP animations complete
        return flipPromises.length > 0 ? Promise.all(flipPromises) : Promise.resolve();
    }

    /**
     * Animate a rank badge number transitioning from old to new with a slide effect.
     */
    function animateRankChange(rankBadge, oldRank, newRank) {
        if (prefersReducedMotion || oldRank === newRank) return;

        const oldText = rankBadge.textContent;
        const medal = newRank === 1 ? '🥇 ' : newRank === 2 ? '🥈 ' : newRank === 3 ? '🥉 ' : '';
        const newText = `${medal}#${newRank}`;

        const { width, height } = rankBadge.getBoundingClientRect();
        rankBadge.style.width = width + 'px';
        rankBadge.style.height = height + 'px';

        rankBadge.innerHTML = '';
        rankBadge.classList.add('rank-transitioning');

        const oldSpan = document.createElement('span');
        oldSpan.className = 'rank-old';
        oldSpan.textContent = oldText;

        const newSpan = document.createElement('span');
        newSpan.className = 'rank-new';
        newSpan.textContent = newText;

        rankBadge.appendChild(oldSpan);
        rankBadge.appendChild(newSpan);

        const direction = newRank < oldRank ? -1 : 1;

        oldSpan.animate([
            { transform: 'translateY(0)', opacity: 1 },
            { transform: `translateY(${direction * -100}%)`, opacity: 0 }
        ], { duration: 600, easing: 'cubic-bezier(0.16, 0.7, 0.3, 1)', fill: 'forwards' });

        const enterAnim = newSpan.animate([
            { transform: `translateY(${direction * 100}%)`, opacity: 0 },
            { transform: 'translateY(0)', opacity: 1 }
        ], { duration: 600, easing: 'cubic-bezier(0.16, 0.7, 0.3, 1)', fill: 'forwards' });

        enterAnim.finished.then(() => {
            rankBadge.classList.remove('rank-transitioning');
            rankBadge.textContent = newText;
            rankBadge.style.width = '';
            rankBadge.style.height = '';

            if (Math.abs(newRank - oldRank) >= 5) {
                rankBadge.animate([
                    { transform: 'scale(1)' },
                    { transform: 'scale(1.3)' },
                    { transform: 'scale(1)' }
                ], { duration: 400, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
            }
        });
    }

    function setupListeners() {
        const socket = getSocket();
        if (!socket) {
            setTimeout(setupListeners, 200);
            return;
        }

        socket.on('leaderboard-update', (data) => debouncedSmartRefresh(data?.username));
        socket.on('badge-awarded', (data) => debouncedSmartRefresh(data?.username));
        socket.on('pr-update', (data) => debouncedSmartRefresh(data?.username));
        socket.on('review-update', (data) => debouncedSmartRefresh(data?.username));
        socket.on('streak-update', (data) => debouncedSmartRefresh(data?.username));
        socket.on('points-awarded', (data) => debouncedSmartRefresh(data?.username));

        // Full refresh on reconnect to pick up any missed events
        socket.on('connect', () => {
            if (allTimeLeaderboard.length > 0) loadLeaderboardData();
        });
    }

    setupListeners();
})();

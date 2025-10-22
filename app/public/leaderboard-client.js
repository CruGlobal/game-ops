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

document.addEventListener('DOMContentLoaded', async () => {
    initializeEventListeners();
    await loadLeaderboardData();
});

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

async function fetchData(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
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
    card.style.cursor = 'pointer';

    // Make card clickable to navigate to profile
    card.addEventListener('click', () => {
        window.location.href = `/profile/${user.username}`;
    });

    // Rank badge
    const rankBadgeClass = rank <= 3 ? `rank-badge rank-${rank}` : 'rank-badge';
    const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;

    const quarterStats = user.quarterlyStats || {};
    const prsThisQuarter = (typeof user.prsThisQuarter === 'number') ? user.prsThisQuarter : (quarterStats.prsThisQuarter || 0);
    const reviewsThisQuarter = (typeof user.reviewsThisQuarter === 'number') ? user.reviewsThisQuarter : (quarterStats.reviewsThisQuarter || 0);
    const pointsThisQuarter = (typeof user.pointsThisQuarter === 'number') ? user.pointsThisQuarter : (quarterStats.pointsThisQuarter || 0);

    card.innerHTML = `
        <div class="${rankBadgeClass}">${rankEmoji}</div>

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
                        <div class="stat-value">${prsThisQuarter}</div>
                    </div>
                </div>
                <div class="stat-item">
                    <span class="stat-icon">👀</span>
                    <div>
                        <div class="stat-label">Reviews</div>
                        <div class="stat-value">${reviewsThisQuarter}</div>
                    </div>
                </div>
                <div class="stat-item">
                    <span class="stat-icon">⭐</span>
                    <div>
                        <div class="stat-label">Points</div>
                        <div class="stat-value">${pointsThisQuarter}</div>
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
    card.style.cursor = 'pointer';

    // Make card clickable to navigate to profile
    card.addEventListener('click', () => {
        window.location.href = `/profile/${user.username}`;
    });

    // Rank badge
    const rankBadgeClass = rank <= 3 ? `rank-badge rank-${rank}` : 'rank-badge';
    const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;

    // Stats based on type
    const statsHTML = generateStatsHTML(user, type);

    // Badges
    const badgesHTML = generateBadgesHTML(user);

    card.innerHTML = `
        <div class="${rankBadgeClass}">${rankEmoji}</div>

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
                    <div class="stat-value">${user.prCount || 0}</div>
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
                    <div class="stat-value">${user.reviewCount || 0}</div>
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
                    <div class="stat-value">${user.totalPoints || 0}</div>
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
                    <div class="stat-value">${user.currentStreak || 0} days</div>
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
                    <div class="stat-value">${user.totalBillsAwarded}</div>
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
    if (user.badges && user.badges.length > 0) {
        const badgeImages = user.badges
            .slice(0, 5) // Limit to 5 badges for display
            .map(badge => {
                const badgeName = typeof badge === 'string' ? badge : badge.badge;
                const imageName = badgeName.replace(/ /g, '_').toLowerCase();
                return `<img src="/images/badges/${imageName}.png" alt="${badgeName}" class="badge-item" title="${badgeName}">`;
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

// Socket.IO real-time updates
if (typeof io !== 'undefined') {
    const socket = io();

    socket.on('leaderboard-update', async () => {
        console.log('Leaderboard update received, refreshing data...');
        await loadLeaderboardData();
    });

    socket.on('badge-awarded', async (data) => {
        console.log('Badge awarded:', data);
        // Optionally show toast notification
        await loadLeaderboardData();
    });

    socket.on('pr-update', async (data) => {
        console.log('PR update:', data);
        await loadLeaderboardData();
    });
}

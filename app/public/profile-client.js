/* Profile Page Client-Side Logic */

// Extract username from URL
const pathParts = window.location.pathname.split('/');
const username = pathParts[pathParts.length - 1];

let contributorData = null;
let activityChart = null;

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    // Add back button event listener
    const backButton = document.getElementById('backButton');
    if (backButton) {
        backButton.addEventListener('click', () => {
            window.location.href = '/leaderboard';
        });
    }

    await loadProfileData();
    initializeSocketIO();
});

/**
 * Load contributor profile data from API
 */
async function loadProfileData() {
    try {
        // Fetch contributor data
        const response = await fetch(`/api/contributors/${username}`);

        if (!response.ok) {
            if (response.status === 404) {
                window.location.href = `/error?code=404&message=Contributor Not Found`;
                return;
            }
            throw new Error('Failed to fetch contributor data');
        }

        contributorData = await response.json();

        // Populate profile
        populateProfileHeader();
        populateStatsGrid();
        populateBadgeShowcase();
        await renderActivityChart();
        await loadChallenges();

    } catch (error) {
        console.error('Error loading profile data:', error);
        showError('Failed to load profile data. Please try again later.');
    }
}

/**
 * Populate profile header section
 */
function populateProfileHeader() {
    const avatarImg = document.getElementById('profileAvatar');
    const usernameH1 = document.getElementById('profileUsername');
    const rankDiv = document.getElementById('profileRank');

    avatarImg.src = contributorData.avatarUrl || '/default-avatar.png';
    avatarImg.alt = `${contributorData.username}'s avatar`;
    usernameH1.textContent = contributorData.username;

    // Calculate rank (requires fetching all contributors)
    fetch('/api/top-contributors')
        .then(res => {
            if (!res.ok) throw new Error('Failed to fetch contributors');
            return res.json();
        })
        .then(allContributors => {
            const sortedByPRs = allContributors.sort((a, b) => b.prCount - a.prCount);
            const rank = sortedByPRs.findIndex(c => c.username === contributorData.username) + 1;

            if (rank === 1) {
                rankDiv.innerHTML = '<span class="rank-badge rank-1">🥇 #1 - Top Contributor</span>';
            } else if (rank === 2) {
                rankDiv.innerHTML = '<span class="rank-badge rank-2">🥈 #2 - Runner Up</span>';
            } else if (rank === 3) {
                rankDiv.innerHTML = '<span class="rank-badge rank-3">🥉 #3 - Bronze Medalist</span>';
            } else {
                rankDiv.innerHTML = `<span class="rank-badge rank-other">Rank #${rank}</span>`;
            }
        })
        .catch(err => {
            console.error('Error calculating rank:', err);
            rankDiv.innerHTML = '<span class="rank-badge rank-other">Contributor</span>';
        });
}

/**
 * Populate stats grid
 */
function populateStatsGrid() {
    document.getElementById('statPRs').textContent = contributorData.prCount || 0;
    document.getElementById('statReviews').textContent = contributorData.reviewCount || 0;
    document.getElementById('statPoints').textContent = contributorData.totalPoints || 0;
    document.getElementById('statStreak').textContent = `${contributorData.currentStreak || 0} days`;
    document.getElementById('statLongestStreak').textContent = `Longest: ${contributorData.longestStreak || 0} days`;
    document.getElementById('statBills').textContent = contributorData.totalBillsAwarded || 0;
    document.getElementById('statBadges').textContent = contributorData.badges?.length || 0;
}

/**
 * Populate badge showcase
 */
function populateBadgeShowcase() {
    const badgeShowcase = document.getElementById('badgeShowcase');

    if (!contributorData.badges || contributorData.badges.length === 0) {
        badgeShowcase.innerHTML = '<div class="empty-state">No badges earned yet. Keep contributing to unlock badges!</div>';
        return;
    }

    // Badge metadata mapping (images are in /images/badges/)
    // Keys match actual badge names from database
    const badgeMetadata = {
        '1st PR badge': { name: '1st PR Badge', image: '/images/badges/1st_pr_badge.png' },
        '1st Review badge': { name: '1st Review Badge', image: '/images/badges/1st_review_badge.png' },
        '10 PR badge': { name: '10 PR Badge', image: '/images/badges/10_prs_badge.png' },
        '10 Reviews badge': { name: '10 Reviews Badge', image: '/images/badges/10_reviews_badge.png' },
        '50 PR badge': { name: '50 PR Badge', image: '/images/badges/50_prs_badge.png' },
        '50 Reviews badge': { name: '50 Reviews Badge', image: '/images/badges/50_reviews_badge.png' },
        '100 PR badge': { name: '100 PR Badge', image: '/images/badges/100_prs_badge.png' },
        '100 Reviews badge': { name: '100 Reviews Badge', image: '/images/badges/100_reviews_badge.png' },
        '500 PR badge': { name: '500 PR Badge', image: '/images/badges/500_prs_badge.png' },
        '500 Reviews badge': { name: '500 Reviews Badge', image: '/images/badges/500_reviews_badge.png' },
        '1000 PR badge': { name: '1000 PR Badge', image: '/images/badges/1000_prs_badge.png' },
        '1000 Reviews badge': { name: '1000 Reviews Badge', image: '/images/badges/1000_reviews_badge.png' },
        // Streak badges (may not be in database yet, using placeholder images)
        'Week Warrior': { name: 'Week Warrior', image: '/images/badges/50_prs_badge.png' },
        'Monthly Master': { name: 'Monthly Master', image: '/images/badges/100_prs_badge.png' },
        'Quarter Champion': { name: 'Quarter Champion', image: '/images/badges/500_prs_badge.png' },
        'Year-Long Hero': { name: 'Year-Long Hero', image: '/images/badges/1000_prs_badge.png' }
    };

    badgeShowcase.innerHTML = '';

    contributorData.badges.forEach(badgeData => {
        // Handle both string format and object format { badge: 'name', date: 'ISO' }
        const badgeId = typeof badgeData === 'string' ? badgeData : badgeData.badge;
        const badgeDate = typeof badgeData === 'object' && badgeData.date ? new Date(badgeData.date) : null;

        const metadata = badgeMetadata[badgeId] || { name: badgeId, image: '/images/badges/1st_pr_badge.png' };

        const badgeItem = document.createElement('div');
        badgeItem.className = 'badge-item';

        const badgeImg = document.createElement('img');
        badgeImg.src = metadata.image;
        badgeImg.alt = metadata.name;
        badgeImg.onerror = function() {
            this.src = '/images/badges/1st_pr_badge.png';
        };

        const badgeName = document.createElement('div');
        badgeName.className = 'badge-name';
        badgeName.textContent = metadata.name;

        badgeItem.appendChild(badgeImg);
        badgeItem.appendChild(badgeName);

        // Add date if available
        if (badgeDate) {
            const dateElement = document.createElement('div');
            dateElement.className = 'badge-date';
            dateElement.textContent = `Earned: ${badgeDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
            badgeItem.appendChild(dateElement);
        }

        badgeShowcase.appendChild(badgeItem);
    });
}

/**
 * Render activity chart using Chart.js
 */
async function renderActivityChart() {
    const ctx = document.getElementById('activityChart');
    if (!ctx) return;

    try {
        // Fetch time-series data for last 30 days
        const response = await fetch(`/api/analytics/contributor/${username}?days=30`);
        if (!response.ok) throw new Error('Failed to fetch activity data');

        const apiData = await response.json();

        // API returns: { username, period, contributions: [], reviews: [], pointsHistory: [] }
        // Create aggregated daily data
        const dailyData = {};

        // Aggregate contributions
        if (apiData.contributions && Array.isArray(apiData.contributions)) {
            apiData.contributions.forEach(c => {
                const date = new Date(c.date).toDateString();
                if (!dailyData[date]) dailyData[date] = { date, prCount: 0, reviewCount: 0, points: 0 };
                dailyData[date].prCount += 1;
            });
        }

        // Aggregate reviews
        if (apiData.reviews && Array.isArray(apiData.reviews)) {
            apiData.reviews.forEach(r => {
                const date = new Date(r.date).toDateString();
                if (!dailyData[date]) dailyData[date] = { date, prCount: 0, reviewCount: 0, points: 0 };
                dailyData[date].reviewCount += 1;
            });
        }

        // Aggregate points
        if (apiData.pointsHistory && Array.isArray(apiData.pointsHistory)) {
            apiData.pointsHistory.forEach(p => {
                const date = new Date(p.timestamp).toDateString();
                if (!dailyData[date]) dailyData[date] = { date, prCount: 0, reviewCount: 0, points: 0 };
                dailyData[date].points += p.points || 0;
            });
        }

        // Convert to sorted array
        const data = Object.values(dailyData).sort((a, b) => new Date(a.date) - new Date(b.date));

        // If no data, show empty chart
        if (data.length === 0) {
            ctx.parentElement.innerHTML = '<div class="empty-state">No activity data available for the last 30 days</div>';
            return;
        }

        // Prepare chart data
        const labels = data.map(d => {
            const date = new Date(d.date);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });

        const prData = data.map(d => d.prCount || 0);
        const reviewData = data.map(d => d.reviewCount || 0);
        const pointsData = data.map(d => d.points || 0);

        // Destroy existing chart if exists
        if (activityChart) {
            activityChart.destroy();
        }

        // Create new chart
        activityChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Pull Requests',
                        data: prData,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Reviews',
                        data: reviewData,
                        borderColor: '#8b5cf6',
                        backgroundColor: 'rgba(139, 92, 246, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Points',
                        data: pointsData,
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        tension: 0.4,
                        fill: true,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim()
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        borderColor: '#666',
                        borderWidth: 1
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(128, 128, 128, 0.1)'
                        },
                        ticks: {
                            color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim()
                        }
                    },
                    y: {
                        type: 'linear',
                        position: 'left',
                        grid: {
                            color: 'rgba(128, 128, 128, 0.1)'
                        },
                        ticks: {
                            color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim()
                        },
                        title: {
                            display: true,
                            text: 'PRs / Reviews',
                            color: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim()
                        }
                    },
                    y1: {
                        type: 'linear',
                        position: 'right',
                        grid: {
                            drawOnChartArea: false
                        },
                        ticks: {
                            color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim()
                        },
                        title: {
                            display: true,
                            text: 'Points',
                            color: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim()
                        }
                    }
                }
            }
        });

    } catch (error) {
        console.error('Error rendering activity chart:', error);
        ctx.parentElement.innerHTML = '<div class="empty-state">Unable to load activity chart</div>';
    }
}

/**
 * Load user's challenges
 */
async function loadChallenges() {
    try {
        const response = await fetch(`/api/challenges/user/${username}`);
        if (!response.ok) throw new Error('Failed to fetch challenges');

        const { activeChallenges, completedChallenges } = await response.json();

        // Render active challenges
        if (activeChallenges && activeChallenges.length > 0) {
            renderActiveChallenges(activeChallenges);
        }

        // Render completed challenges
        if (completedChallenges && completedChallenges.length > 0) {
            renderCompletedChallenges(completedChallenges);
        }

    } catch (error) {
        console.error('Error loading challenges:', error);
    }
}

/**
 * Render active challenges
 */
function renderActiveChallenges(challenges) {
    const section = document.getElementById('activeChallengesSection');
    const container = document.getElementById('activeChallengesContainer');

    section.style.display = 'block';
    container.innerHTML = '';

    challenges.forEach(challenge => {
        const card = createChallengeCard(challenge, false);
        container.appendChild(card);
    });
}

/**
 * Render completed challenges
 */
function renderCompletedChallenges(challenges) {
    const section = document.getElementById('completedChallengesSection');
    const container = document.getElementById('completedChallengesContainer');

    section.style.display = 'block';
    container.innerHTML = '';

    challenges.forEach(challenge => {
        const card = createChallengeCard(challenge, true);
        container.appendChild(card);
    });
}

/**
 * Create challenge card element
 */
function createChallengeCard(challenge, isCompleted) {
    const card = document.createElement('div');
    card.className = isCompleted ? 'challenge-card completed-challenge-card' : 'challenge-card';

    const difficultyClass = `difficulty-${challenge.difficulty || 'medium'}`;
    const progress = challenge.progress || 0;
    const target = challenge.target || 100;
    const percentComplete = Math.min((progress / target) * 100, 100).toFixed(1);

    card.innerHTML = `
        <div class="challenge-header">
            <div>
                <h3 class="challenge-title">${challenge.title}</h3>
                <span class="challenge-badge ${difficultyClass}">${challenge.difficulty || 'medium'}</span>
                ${isCompleted ? '<span class="challenge-badge status-completed">Completed</span>' : ''}
            </div>
        </div>
        <p class="challenge-description">${challenge.description}</p>
        ${!isCompleted ? `
            <div class="challenge-progress">
                <div class="progress-label">
                    <span>Progress</span>
                    <span>${progress} / ${target} (${percentComplete}%)</span>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar" style="width: ${percentComplete}%"></div>
                </div>
            </div>
        ` : ''}
        <div class="challenge-reward">
            <span>🏆 Reward:</span>
            <strong>${challenge.reward} points</strong>
        </div>
    `;

    return card;
}

/**
 * Initialize Socket.IO for real-time updates
 */
function initializeSocketIO() {
    if (typeof io === 'undefined') {
        console.warn('Socket.IO not available');
        return;
    }

    const socket = io();

    socket.on('connect', () => {
        console.log('Connected to WebSocket');
    });

    // Listen for PR updates for this user
    socket.on('pr-update', (data) => {
        if (data.username === username) {
            console.log('PR update received for current user:', data);
            loadProfileData(); // Reload entire profile
        }
    });

    // Listen for badge awards
    socket.on('badge-awarded', (data) => {
        if (data.username === username) {
            console.log('Badge awarded to current user:', data);
            showToast(`🏅 Badge Earned: ${data.badge}`, 'achievement');
            loadProfileData();
        }
    });

    // Listen for streak updates
    socket.on('streak-update', (data) => {
        if (data.username === username) {
            console.log('Streak updated for current user:', data);
            document.getElementById('statStreak').textContent = `${data.currentStreak} days`;
            if (data.longestStreak) {
                document.getElementById('statLongestStreak').textContent = `Longest: ${data.longestStreak} days`;
            }
        }
    });

    // Listen for challenge progress
    socket.on('challenge-progress', (data) => {
        if (data.username === username) {
            console.log('Challenge progress updated:', data);
            loadChallenges(); // Reload challenges
        }
    });

    // Listen for challenge completion
    socket.on('challenge-completed', (data) => {
        if (data.username === username) {
            console.log('Challenge completed:', data);
            showToast(`🎯 Challenge Completed: ${data.challengeName}! +${data.reward} points`, 'achievement');
            loadChallenges();
        }
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from WebSocket');
    });
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    // Check if toast function exists from scripts.js
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
    } else {
        console.log(`Toast (${type}): ${message}`);
    }
}

/**
 * Show error message
 */
function showError(message) {
    showToast(message, 'error');
}

/**
 * Update chart theme when theme changes
 */
if (typeof window.themeChangeCallbacks === 'undefined') {
    window.themeChangeCallbacks = [];
}

window.themeChangeCallbacks.push(() => {
    if (activityChart) {
        renderActivityChart();
    }
});

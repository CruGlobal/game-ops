/**
 * Challenges Page Client-Side JavaScript
 * Handles challenge display, join functionality, and real-time updates
 */

// Store current username (from authenticated session)
let currentUsername = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Handle back button
    const backButton = document.getElementById('backButton');
    if (backButton) {
        backButton.addEventListener('click', () => {
            window.location.href = '/leaderboard';
        });
    }

    // Get username from authenticated session (set by server in EJS template)
    if (window.__currentUser && window.__currentUser.username) {
        currentUsername = window.__currentUser.username;
    }

    // Load challenges
    loadActiveChallenges();

    if (currentUsername) {
        loadMyChallenges(currentUsername);
    }

    // Set up WebSocket listeners for real-time updates
    setupWebSocketListeners();

    // Set up event delegation for join challenge buttons (one-time setup)
    const grid = document.getElementById('challenges-grid');
    grid.addEventListener('click', (event) => {
        if (event.target.classList.contains('challenge-btn') && event.target.dataset.challengeId) {
            const challengeId = event.target.dataset.challengeId;
            joinChallenge(challengeId);
        }
    });
});

/**
 * Load and display active challenges
 */
async function loadActiveChallenges() {
    try {
        const response = await fetch('/api/challenges/active');
        if (!response.ok) {
            throw new Error(`Failed to load challenges (HTTP ${response.status})`);
        }
        const data = await response.json();

        if (data.challenges && data.challenges.length > 0) {
            renderChallenges(data.challenges);
        } else {
            document.getElementById('challenges-grid').innerHTML =
                '<p class="empty-message">No active challenges at the moment. New challenges are created every Monday!</p>';
        }
    } catch (error) {
        console.error('Error loading challenges:', error);
        document.getElementById('challenges-grid').innerHTML =
            '<p class="error-message">Error loading challenges. Please try again later.</p>';
        if (typeof showToast === 'function') {
            showToast('Failed to load challenges. Please refresh the page.', 'error');
        }
    }
}

/**
 * Render challenge cards in the grid
 * @param {Array} challenges - Array of challenge objects
 */
function renderChallenges(challenges) {
    const grid = document.getElementById('challenges-grid');
    grid.innerHTML = '';

    challenges.forEach(challenge => {
        const card = createChallengeCard(challenge);
        grid.appendChild(card);
    });
}

/**
 * Create a challenge card element
 * @param {Object} challenge - Challenge data
 * @returns {HTMLElement} Challenge card element
 */
function createChallengeCard(challenge) {
    const card = document.createElement('div');
    card.className = 'challenge-card';
    card.setAttribute('data-challenge-id', challenge.id);

    // Ensure participants array exists
    const participants = challenge.participants || [];

    // Check if user has joined this challenge
    const hasJoined = participants.some(p => p.username === currentUsername || p.contributor?.username === currentUsername);
    const userParticipant = participants.find(p => p.username === currentUsername || p.contributor?.username === currentUsername);

    // Calculate days remaining
    const endDate = new Date(challenge.endDate);
    const now = new Date();
    const daysRemaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

    card.innerHTML = `
        <div class="challenge-header">
            <h3 class="challenge-title">${escapeHtml(challenge.title)}</h3>
            <span class="challenge-difficulty challenge-difficulty-${challenge.difficulty}">${challenge.difficulty}</span>
        </div>

        <p class="challenge-description">${escapeHtml(challenge.description)}</p>

        <div class="challenge-stats">
            <div class="challenge-stat">
                <div class="challenge-stat-value">${challenge.target}</div>
                <div class="challenge-stat-label">Target</div>
            </div>
            <div class="challenge-stat">
                <div class="challenge-stat-value">${challenge.reward}</div>
                <div class="challenge-stat-label">Points</div>
            </div>
            <div class="challenge-stat">
                <div class="challenge-stat-value">${participants.length}</div>
                <div class="challenge-stat-label">Participants</div>
            </div>
        </div>

        ${hasJoined ? `
            <div class="challenge-progress">
                <div class="challenge-progress-label">
                    Your Progress: ${userParticipant.progress} / ${challenge.target}
                </div>
                <div class="challenge-progress-bar">
                    <div class="challenge-progress-fill" style="width: ${(userParticipant.progress / challenge.target * 100)}%"></div>
                </div>
            </div>
        ` : ''}

        <div class="challenge-footer">
            <div class="challenge-time-remaining">
                ${daysRemaining > 0 ? `${daysRemaining} days left` : 'Ending soon'}
            </div>
            ${hasJoined ? `
                <button class="challenge-btn challenge-btn-joined" disabled>
                    ✓ Joined
                </button>
            ` : `
                <button class="challenge-btn" data-challenge-id="${challenge.id}">
                    Join Challenge
                </button>
            `}
        </div>
    `;

    return card;
}

/**
 * Join a challenge
 * @param {string} challengeId - Challenge ID
 */
async function joinChallenge(challengeId) {
    if (!currentUsername) {
        if (typeof showToast === 'function') {
            showToast('Please log in with GitHub to join challenges.', 'error');
        }
        return;
    }

    try {
        const response = await fetch(`/api/challenges/${challengeId}/join`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username: currentUsername })
        });

        const data = await response.json();

        if (response.ok) {
            // Show success toast
            if (typeof showToast === 'function') {
                showToast(`Successfully joined challenge!`, 'success');
            }

            // Reload challenges to update UI
            loadActiveChallenges();
            loadMyChallenges(currentUsername);
        } else {
            // Show error toast
            if (typeof showToast === 'function') {
                showToast(data.error || 'Failed to join challenge', 'error');
            } else {
                alert(data.error || 'Failed to join challenge');
            }
        }
    } catch (error) {
        console.error('Error joining challenge:', error);
        if (typeof showToast === 'function') {
            showToast(error.message || 'Failed to join challenge. Please try again.', 'error');
        } else {
            alert('Error joining challenge. Please try again.');
        }
    }
}

/**
 * Load user's active challenges
 * @param {string} username - GitHub username
 */
async function loadMyChallenges(username) {
    try {
        const response = await fetch(`/api/challenges/user/${username}`);
        if (!response.ok) {
            throw new Error(`Failed to load user challenges (HTTP ${response.status})`);
        }
        const data = await response.json();

        if (data.activeChallenges && data.activeChallenges.length > 0) {
            document.getElementById('my-challenges').style.display = 'block';
            renderMyChallenges(data.activeChallenges);
        } else {
            document.getElementById('my-challenges').style.display = 'none';
        }

        // Render past challenges (completed + expired incomplete)
        renderPastChallenges(data.completedChallenges || [], data.expiredIncomplete || []);
    } catch (error) {
        console.error('Error loading user challenges:', error);
        if (typeof showToast === 'function') {
            showToast('Failed to load your challenges.', 'error');
        }
    }
}

/**
 * Render user's active challenges
 * @param {Array} challenges - Array of user's challenges
 */
function renderMyChallenges(challenges) {
    const container = document.getElementById('my-challenges-list');
    container.innerHTML = '';

    challenges.forEach(userChallenge => {
        const item = document.createElement('div');
        item.className = 'my-challenge-item';

        const progress = userChallenge.progress || 0;
        const target = userChallenge.target || 0;
        const percentage = target > 0 ? Math.min(progress / target * 100, 100) : 0;
        const remaining = Math.max(target - progress, 0);

        // Calculate days remaining
        const endDate = new Date(userChallenge.endDate);
        const now = new Date();
        const daysRemaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

        item.innerHTML = `
            <div class="my-challenge-header">
                <h4>${escapeHtml(userChallenge.title)}</h4>
                <span class="challenge-difficulty challenge-difficulty-${userChallenge.difficulty}">${userChallenge.difficulty}</span>
            </div>
            <div class="my-challenge-meta">
                <span class="my-challenge-type">${userChallenge.type}</span>
                <span class="my-challenge-time">${daysRemaining > 0 ? `${daysRemaining} days left` : 'Ending soon'}</span>
            </div>
            <div class="my-challenge-progress-section">
                <div class="my-challenge-progress-label">
                    <span>Progress</span>
                    <span class="my-challenge-progress-text">${progress} / ${target}</span>
                </div>
                <div class="challenge-progress-bar">
                    <div class="challenge-progress-fill" style="width: ${percentage}%"></div>
                </div>
            </div>
            <div class="my-challenge-footer">
                <span>${remaining > 0 ? `${remaining} more to complete` : 'Almost there!'}</span>
                <span class="my-challenge-reward">${userChallenge.reward} pts reward</span>
            </div>
        `;

        container.appendChild(item);
    });
}

/**
 * Render past challenges (completed and expired incomplete)
 * @param {Array} completed - Completed challenges
 * @param {Array} expiredIncomplete - Expired but not completed challenges
 */
function renderPastChallenges(completed, expiredIncomplete) {
    const container = document.getElementById('completed-challenges-list');
    const section = document.getElementById('completed-challenges');

    const allPast = [
        ...completed.map(c => ({ ...c, outcome: 'completed' })),
        ...expiredIncomplete.map(c => ({ ...c, outcome: 'incomplete' }))
    ];

    // Sort by date (most recent first)
    allPast.sort((a, b) => {
        const dateA = a.completedAt ? new Date(a.completedAt) : new Date(a.endDate);
        const dateB = b.completedAt ? new Date(b.completedAt) : new Date(b.endDate);
        return dateB - dateA;
    });

    if (allPast.length === 0) {
        container.innerHTML = '<p class="empty-message">No past challenges yet. Join active challenges above!</p>';
        return;
    }

    section.style.display = 'block';
    container.innerHTML = '';

    allPast.forEach(challenge => {
        const item = document.createElement('div');
        item.className = `past-challenge-item past-challenge-${challenge.outcome}`;

        if (challenge.outcome === 'completed') {
            const completedDate = new Date(challenge.completedAt).toLocaleDateString();
            item.innerHTML = `
                <div class="past-challenge-header">
                    <h4>${escapeHtml(challenge.title)}</h4>
                    <span class="past-challenge-badge past-challenge-badge-completed">Completed</span>
                </div>
                <div class="past-challenge-details">
                    <span>Completed on ${completedDate}</span>
                    <span class="past-challenge-reward">+${challenge.reward} pts earned</span>
                </div>
            `;
        } else {
            const endedDate = new Date(challenge.endDate).toLocaleDateString();
            const progress = challenge.progress || 0;
            const target = challenge.target || 0;
            const percentage = target > 0 ? Math.min(progress / target * 100, 100) : 0;

            item.innerHTML = `
                <div class="past-challenge-header">
                    <h4>${escapeHtml(challenge.title)}</h4>
                    <span class="past-challenge-badge past-challenge-badge-incomplete">Not Completed</span>
                </div>
                <div class="past-challenge-progress-section">
                    <div class="my-challenge-progress-label">
                        <span>Final Progress</span>
                        <span>${progress} / ${target}</span>
                    </div>
                    <div class="challenge-progress-bar">
                        <div class="challenge-progress-fill challenge-progress-fill-expired" style="width: ${percentage}%"></div>
                    </div>
                </div>
                <div class="past-challenge-details">
                    <span>Ended ${endedDate}</span>
                    <span class="past-challenge-difficulty">${challenge.difficulty}</span>
                </div>
            `;
        }

        container.appendChild(item);
    });
}

/**
 * Set up WebSocket listeners for real-time challenge updates
 */
function setupWebSocketListeners() {
    // Check if socket is available from socket-client.js
    if (typeof socket === 'undefined') {
        console.warn('Socket.IO not available. Real-time updates disabled.');
        return;
    }

    // Listen for challenge progress updates
    socket.on('challenge-progress', (data) => {
        console.log('Challenge progress update:', data);

        // If it's the current user's progress, update their challenges
        if (data.username === currentUsername) {
            loadMyChallenges(currentUsername);
        }

        // Update the challenge card if visible
        updateChallengeProgress(data.challengeId, data.username, data.progress);

        // Show toast notification
        if (data.username === currentUsername && typeof showToast === 'function') {
            showToast(
                `Challenge progress: ${data.progress}/${data.target} (${Math.round(data.percentComplete)}%)`,
                'info'
            );
        }
    });

    // Listen for challenge completion
    socket.on('challenge-completed', (data) => {
        console.log('Challenge completed:', data);

        // Reload challenges
        loadActiveChallenges();

        if (data.username === currentUsername) {
            loadMyChallenges(currentUsername);

            // Show celebration toast
            if (typeof showToast === 'function') {
                showToast(
                    `🎉 Challenge "${data.challengeName}" completed! +${data.reward} points!`,
                    'achievement',
                    5000
                );
            }
        }
    });
}

/**
 * Update challenge progress in a card
 * @param {string} challengeId - Challenge ID
 * @param {string} username - Username
 * @param {number} progress - New progress value
 */
function updateChallengeProgress(challengeId, username, progress) {
    if (username !== currentUsername) return;

    const card = document.querySelector(`[data-challenge-id="${challengeId}"]`);
    if (!card) return;

    const progressText = card.querySelector('.challenge-progress-label');
    if (progressText) {
        const target = progressText.textContent.match(/\/ (\d+)/)[1];
        progressText.textContent = `Your Progress: ${progress} / ${target}`;
    }

    const progressBar = card.querySelector('.challenge-progress-fill');
    if (progressBar) {
        const target = progressText.textContent.match(/\/ (\d+)/)[1];
        const percentage = (progress / target * 100);
        progressBar.style.width = `${percentage}%`;
    }
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

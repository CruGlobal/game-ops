// Socket.IO Client for Real-time Updates
(function() {
    'use strict';

    // Initialize Socket.IO connection
    const socket = io({
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5
    });

    // Connection event handlers
    socket.on('connect', () => {
        console.log('WebSocket connected');
        socket.emit('subscribe-updates');
        showToast('Connected to live updates', 'success');
    });

    socket.on('disconnect', () => {
        console.log('WebSocket disconnected');
        showToast('Disconnected from live updates', 'warning');
    });

    socket.on('error', (error) => {
        console.error('WebSocket error:', error);
    });

    // PR update event
    socket.on('pr-update', (data) => {
        console.log('PR Update:', data);
        updateContributorPRCount(data.username, data.prCount);
        showToast(`${data.username} merged a new PR!`, 'info');
    });

    // Badge awarded event
    socket.on('badge-awarded', (data) => {
        console.log('Badge Awarded:', data);
        showBadgeNotification(data);
        refreshLeaderboard();

        // Check if achievements/confetti are enabled
        if (window.notificationSettings && window.notificationSettings.areAchievementsEnabled()) {
            // Trigger confetti celebration
            if (window.confetti) {
                window.confetti.burst({ count: 60 });
            }
        } else {
            console.log('Badge confetti suppressed (disabled)');
        }
    });

    // Review update event
    socket.on('review-update', (data) => {
        console.log('Review Update:', data);
        updateContributorReviewCount(data.username, data.reviewCount);
    });

    // Contributor activity event
    socket.on('contributor-activity', (data) => {
        console.log('Contributor Activity:', data);
        addActivityToFeed(data);
    });

    // Gamification event handlers
    socket.on('streak-update', (data) => {
        console.log('Streak Update:', data);
        showToast(`🔥 ${data.username} has a ${data.currentStreak}-day streak!`, 'success');
        updateStreakDisplay(data);
    });

    socket.on('achievement-unlocked', (data) => {
        console.log('Achievement Unlocked:', data);
        showToast(`🏆 ${data.username} unlocked: ${data.achievementName}!`, 'success', 5000);

        // Check if achievements are enabled
        if (window.notificationSettings && window.notificationSettings.areAchievementsEnabled()) {
            showAchievementModal(data);

            // Full celebration with confetti
            if (window.confetti) {
                window.confetti.celebrate();
            }
        } else {
            console.log('Achievement popup suppressed (disabled):', data.achievementName);
        }
    });

    socket.on('points-awarded', (data) => {
        console.log('Points Awarded:', data);
        updatePointsDisplay(data.username, data.totalPoints);
    });

    socket.on('challenge-progress', (data) => {
        console.log('Challenge Progress:', data);
        updateChallengeProgressBar(data);
    });

    socket.on('challenge-completed', (data) => {
        console.log('Challenge Completed:', data);
        showToast(`🎉 ${data.username} completed: ${data.challengeName}! (+${data.reward} points)`, 'success', 5000);

        // Check if achievements/confetti are enabled
        if (window.notificationSettings && window.notificationSettings.areAchievementsEnabled()) {
            // Confetti cannon celebration
            if (window.confetti) {
                window.confetti.cannon({ side: 'left', count: 40 });
                setTimeout(() => {
                    window.confetti.cannon({ side: 'right', count: 40 });
                }, 200);
            }
        } else {
            console.log('Challenge confetti suppressed (disabled)');
        }
    });

    // Helper functions
    function updateContributorPRCount(username, prCount) {
        const element = document.querySelector(`[data-username="${username}"] .pr-count`);
        if (element) {
            element.textContent = prCount;
            element.classList.add('highlight-update');
            setTimeout(() => element.classList.remove('highlight-update'), 2000);
        }
    }

    function updateContributorReviewCount(username, reviewCount) {
        const element = document.querySelector(`[data-username="${username}"] .review-count`);
        if (element) {
            element.textContent = reviewCount;
            element.classList.add('highlight-update');
            setTimeout(() => element.classList.remove('highlight-update'), 2000);
        }
    }

    function updateLeaderboard(leaderboard) {
        // Refresh the leaderboard without full page reload
        // This will be implemented based on current DOM structure
        location.reload(); // Temporary - will optimize later
    }

    function refreshLeaderboard() {
        // Fetch updated leaderboard data
        fetch('/api/contributors/leaderboard')
            .then(res => res.json())
            .then(data => updateLeaderboard(data))
            .catch(err => console.error('Failed to refresh leaderboard:', err));
    }

    function showBadgeNotification(data) {
        showToast(
            `🎉 ${data.username} earned the ${data.badgeName} badge!`,
            'success',
            5000
        );
    }

    function addActivityToFeed(data) {
        const feed = document.getElementById('activity-feed');
        if (!feed) return;

        const item = document.createElement('div');
        item.className = 'activity-item new';
        item.innerHTML = `
            <span class="activity-time">${formatTime(data.timestamp)}</span>
            <span class="activity-user">${data.username}</span>
            <span class="activity-type">${data.activityType}</span>
        `;

        feed.insertBefore(item, feed.firstChild);
        setTimeout(() => item.classList.remove('new'), 100);
    }

    function formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString();
    }

    // Toast notification system (basic implementation)
    function showToast(message, type = 'info', duration = 3000) {
        // Check if toasts are enabled
        if (window.notificationSettings && !window.notificationSettings.areToastsEnabled()) {
            console.log('Toast suppressed (disabled):', message);
            return;
        }

        // Check if toast container exists
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }

        // Toast icons based on type
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ',
            achievement: '🏆'
        };

        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        // Create toast content structure
        toast.innerHTML = `
            <div class="toast-icon">${icons[type] || icons.info}</div>
            <div class="toast-message">${escapeHtml(message)}</div>
            <button class="toast-close" aria-label="Close">×</button>
            <div class="toast-progress"></div>
        `;

        // Add close button handler
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        });

        container.appendChild(toast);

        // Trigger animation
        setTimeout(() => toast.classList.add('show'), 10);

        // Start progress bar animation
        const progressBar = toast.querySelector('.toast-progress');
        progressBar.style.transition = `width ${duration}ms linear`;
        setTimeout(() => progressBar.style.width = '0%', 50);

        // Remove after duration
        const removeTimeout = setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, duration);

        // Clear timeout if manually closed
        closeBtn.addEventListener('click', () => clearTimeout(removeTimeout), { once: true });
    }

    // Helper function to escape HTML in toast messages
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Gamification helper functions
    function updateStreakDisplay(data) {
        const element = document.querySelector(`[data-username="${data.username}"] .streak-count`);
        if (element) {
            element.textContent = data.currentStreak;
            element.classList.add('highlight-update');
            setTimeout(() => element.classList.remove('highlight-update'), 2000);
        }
    }

    function updatePointsDisplay(username, totalPoints) {
        const element = document.querySelector(`[data-username="${username}"] .points-count`);
        if (element) {
            element.textContent = totalPoints;
            element.classList.add('highlight-update');
            setTimeout(() => element.classList.remove('highlight-update'), 2000);
        }
    }

    function showAchievementModal(data) {
        // Enhanced achievement notification modal with confetti and animations
        const modal = document.createElement('div');
        modal.className = 'achievement-modal';

        // Determine badge icon based on achievement type
        const badgeIcon = data.badgeIcon || '🏆';
        const badgeColor = data.badgeColor || '#ffd93d';

        modal.innerHTML = `
            <div class="achievement-modal-overlay"></div>
            <div class="achievement-modal-content">
                <button class="achievement-close-btn" aria-label="Close">×</button>
                <div class="achievement-confetti"></div>
                <div class="achievement-badge">
                    <div class="achievement-badge-ring"></div>
                    <div class="achievement-badge-icon">${escapeHtml(badgeIcon)}</div>
                </div>
                <h2 class="achievement-title">Achievement Unlocked!</h2>
                <h3 class="achievement-name">${escapeHtml(data.achievementName)}</h3>
                <p class="achievement-description">${escapeHtml(data.description || '')}</p>
                <div class="achievement-points">
                    <span class="points-label">Reward</span>
                    <span class="points-value">+${data.points} points</span>
                </div>
                <button class="achievement-action-btn">Awesome!</button>
            </div>
        `;

        document.body.appendChild(modal);

        // Add confetti particles
        const confettiContainer = modal.querySelector('.achievement-confetti');
        createConfetti(confettiContainer);

        // Event handlers
        const closeBtn = modal.querySelector('.achievement-close-btn');
        const actionBtn = modal.querySelector('.achievement-action-btn');

        const closeModal = () => {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 400);
        };

        closeBtn.addEventListener('click', closeModal);
        actionBtn.addEventListener('click', closeModal);

        // Click overlay to close
        modal.querySelector('.achievement-modal-overlay').addEventListener('click', closeModal);

        // Trigger animation
        setTimeout(() => modal.classList.add('show'), 10);

        // Auto-remove after 15 seconds
        setTimeout(closeModal, 15000);
    }

    // Create confetti particles for celebration effect
    function createConfetti(container) {
        const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#ffd93d', '#6c5ce7', '#fd79a8'];
        const particleCount = 50;

        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'confetti-particle';
            particle.style.left = `${Math.random() * 100}%`;
            particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            particle.style.animationDelay = `${Math.random() * 0.5}s`;
            particle.style.animationDuration = `${2 + Math.random() * 2}s`;
            container.appendChild(particle);
        }
    }

    function updateChallengeProgressBar(data) {
        const element = document.querySelector(`[data-challenge-id="${data.challengeId}"] .progress-bar`);
        if (element) {
            const percent = data.percentComplete;
            element.style.width = `${percent}%`;
            element.textContent = `${Math.round(percent)}%`;
        }
    }

    // Listen for leaderboard updates
    socket.on('leaderboard-update', (data) => {
        console.log('Leaderboard update received:', data);
        updateLeaderboard(data);
    });

    /**
     * Update leaderboard in real-time without page refresh
     * @param {Object} data - Updated contributor data
     */
    function updateLeaderboard(data) {
        const { username, pullRequestCount, reviewCount, totalPoints } = data;

        // Find the list item for this contributor
        const listItem = document.querySelector(`li[data-username="${username}"]`);

        if (!listItem) {
            // Contributor not in current view
            console.log('Contributor not found in leaderboard:', username);
            return;
        }

        // Update PR count
        const prCell = listItem.querySelector('.pr-count');
        if (prCell && prCell.textContent !== pullRequestCount.toString()) {
            prCell.textContent = pullRequestCount;
            animateChange(prCell);
        }

        // Update review count
        const reviewCell = listItem.querySelector('.review-count');
        if (reviewCell && reviewCell.textContent !== reviewCount.toString()) {
            reviewCell.textContent = reviewCount;
            animateChange(reviewCell);
        }

        // Update total points (if displayed)
        const pointsCell = listItem.querySelector('.total-points');
        if (pointsCell && totalPoints !== undefined) {
            const oldPoints = parseInt(pointsCell.textContent.replace(/,/g, '')) || 0;
            if (oldPoints !== totalPoints) {
                pointsCell.textContent = totalPoints.toLocaleString();
                animateChange(pointsCell);
            }
        }

        // Highlight the entire list item
        highlightRow(listItem);
    }

    /**
     * Animate value change in a cell
     * @param {HTMLElement} cell - The cell to animate
     */
    function animateChange(cell) {
        cell.classList.add('value-changed');
        setTimeout(() => {
            cell.classList.remove('value-changed');
        }, 1000);
    }

    /**
     * Highlight a row temporarily
     * @param {HTMLElement} row - The row to highlight
     */
    function highlightRow(row) {
        row.classList.add('row-updated');
        setTimeout(() => {
            row.classList.remove('row-updated');
        }, 2000);
    }

    // Expose functions globally for testing and external use
    window.realtimeSocket = socket;
    window.showToast = showToast;
    window.showAchievementModal = showAchievementModal;

})();

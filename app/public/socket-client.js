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
    });

    // Leaderboard update event
    socket.on('leaderboard-update', (data) => {
        console.log('Leaderboard Update:', data);
        updateLeaderboard(data.leaderboard);
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
        showAchievementModal(data);
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
        // Check if toast container exists
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;

        container.appendChild(toast);

        // Trigger animation
        setTimeout(() => toast.classList.add('show'), 10);

        // Remove after duration
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
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
        // Simple achievement notification modal
        const modal = document.createElement('div');
        modal.className = 'achievement-modal';
        modal.innerHTML = `
            <div class="achievement-modal-content">
                <div class="achievement-icon">🏆</div>
                <h2>Achievement Unlocked!</h2>
                <h3>${data.achievementName}</h3>
                <p>${data.description}</p>
                <p class="achievement-points">+${data.points} points</p>
                <button onclick="this.parentElement.parentElement.remove()">Awesome!</button>
            </div>
        `;
        document.body.appendChild(modal);

        setTimeout(() => modal.classList.add('show'), 10);

        // Auto-remove after 10 seconds
        setTimeout(() => {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);
        }, 10000);
    }

    function updateChallengeProgressBar(data) {
        const element = document.querySelector(`[data-challenge-id="${data.challengeId}"] .progress-bar`);
        if (element) {
            const percent = data.percentComplete;
            element.style.width = `${percent}%`;
            element.textContent = `${Math.round(percent)}%`;
        }
    }

    // Expose socket for debugging
    window.realtimeSocket = socket;

})();

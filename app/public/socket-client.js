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
        socket.emit('subscribe-updates');
        showToast('Connected to live updates', 'success');
    });

    socket.on('disconnect', () => {
        showToast('Disconnected from live updates', 'warning');
    });

    // PR update event — uses a single updating counter toast per user
    const prCountToasts = new Map(); // username → { count, toastEl, timeout }

    socket.on('pr-update', (data) => {
        updateContributorPRCount(data.username, data.prCount);

        const existing = prCountToasts.get(data.username);
        if (existing && existing.toastEl && existing.toastEl.parentNode) {
            // Update the existing toast in-place
            existing.count++;
            const msgEl = existing.toastEl.querySelector('.toast-message');
            if (msgEl) {
                msgEl.textContent = `${data.username} merged ${existing.count} PRs!`;
            }
            // Reset the auto-dismiss timer
            clearTimeout(existing.timeout);
            existing.timeout = setTimeout(() => {
                existing.toastEl.classList.remove('show');
                setTimeout(() => {
                    existing.toastEl.remove();
                    prCountToasts.delete(data.username);
                }, 300);
            }, 5000);
        } else {
            // Create a new toast and track it
            showToast(`${data.username} merged 1 PR!`, 'info', 999999); // long duration, we manage it
            // Find the toast we just created (last one in container)
            const container = document.getElementById('toast-container');
            if (container) {
                const toasts = container.querySelectorAll('.toast');
                const toastEl = toasts[toasts.length - 1];
                if (toastEl) {
                    const timeout = setTimeout(() => {
                        toastEl.classList.remove('show');
                        setTimeout(() => {
                            toastEl.remove();
                            prCountToasts.delete(data.username);
                        }, 300);
                    }, 5000);
                    prCountToasts.set(data.username, { count: 1, toastEl, timeout });
                }
            }
        }
    });

    // Badge awarded event
    socket.on('badge-awarded', (data) => {
        showBadgeNotification(data);
        refreshLeaderboard();

        if (window.notificationSettings && window.notificationSettings.areAchievementsEnabled()) {
            if (window.confetti) {
                window.confetti.burst({ count: 60 });
            }
        }
    });

    // Bill/Vonette awarded event
    socket.on('bill-awarded', (data) => {
        const plural = data.billValue > 1 ? `${data.billType}s` : data.billType;
        showToast(`💵 ${data.username} earned ${data.billValue} ${plural}!`, 'success', 5000);
    });

    // Review update event
    socket.on('review-update', (data) => {
        updateContributorReviewCount(data.username, data.reviewCount);
    });

    // Contributor activity event
    socket.on('contributor-activity', (data) => {
        addActivityToFeed(data);
    });

    // Gamification event handlers
    socket.on('streak-update', (data) => {
        showToast(`🔥 ${data.username} has a ${data.currentStreak}-day streak!`, 'success');
        updateStreakDisplay(data);
    });

    socket.on('achievement-unlocked', (data) => {
        // Wait for any pending or running leaderboard animation to finish before showing
        function showWhenReady() {
            if (window.leaderboardAnimating || window.leaderboardPending) {
                setTimeout(showWhenReady, 300);
                return;
            }
            showCenteredAchievement(data);

            if (window.notificationSettings && window.notificationSettings.areAchievementsEnabled()) {
                if (window.confetti) {
                    window.confetti.celebrate();
                }
            }
        }
        showWhenReady();
    });

    socket.on('points-awarded', (data) => {
        updatePointsDisplay(data.username, data.totalPoints);
    });

    socket.on('challenge-progress', (data) => {
        updateChallengeProgressBar(data);
    });

    socket.on('challenge-completed', (data) => {
        showToast(`🎉 ${data.username} completed: ${data.challengeName}! (+${data.reward} points)`, 'success', 5000);

        if (window.notificationSettings && window.notificationSettings.areAchievementsEnabled()) {
            if (window.confetti) {
                window.confetti.cannon({ side: 'left', count: 40 });
                setTimeout(() => {
                    window.confetti.cannon({ side: 'right', count: 40 });
                }, 200);
            }
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

    function refreshLeaderboard() {
        // On the leaderboard page, leaderboard-client.js handles full refresh via socket events.
        // On other pages (profile, etc.), do a targeted DOM update if elements exist.
        const cards = document.querySelectorAll('.leaderboard-card[data-username]');
        if (cards.length > 0) {
            // leaderboard-client.js will handle this
            return;
        }
        // Fallback for non-leaderboard pages with contributor data
        // No-op — individual event handlers below handle targeted updates
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
    const deferredToasts = [];

    function showToast(message, type = 'info', duration = 3000) {
        // Check if toasts are enabled
        if (window.notificationSettings && !window.notificationSettings.areToastsEnabled()) {
            return;
        }

        // Defer toasts while leaderboard animation is running
        if (window.leaderboardAnimating) {
            // Only queue unique messages to avoid toast flood
            if (!deferredToasts.some(t => t.message === message)) {
                deferredToasts.push({ message, type, duration });
            }
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
            setTimeout(() => modal.remove(), 200);
        };

        closeBtn.addEventListener('click', closeModal);
        actionBtn.addEventListener('click', closeModal);

        // Click overlay to close
        modal.querySelector('.achievement-modal-overlay').addEventListener('click', closeModal);

        // Trigger animation
        setTimeout(() => modal.classList.add('show'), 10);

        // Auto-remove after 1 second
        setTimeout(closeModal, 1000);
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

    // Leaderboard update events are handled by leaderboard-client.js on the leaderboard page.
    // This handler provides a lightweight highlight for contributor cards on other pages (profile, etc.).
    socket.on('leaderboard-update', (data) => {
        if (!data || !data.username) return;

        // Find any cards for this contributor (works on any page)
        const cards = document.querySelectorAll(`[data-username="${data.username}"]`);
        cards.forEach(card => {
            card.classList.add('live-update-highlight');
            setTimeout(() => card.classList.remove('live-update-highlight'), 2000);
        });
    });

    // Flush deferred toasts after animation completes (show max 3 summary toasts)
    function flushDeferredToasts() {
        if (deferredToasts.length === 0) return;
        const toasts = deferredToasts.splice(0);
        // Show at most 3 toasts to avoid flooding
        toasts.slice(0, 3).forEach((t, i) => {
            setTimeout(() => showToast(t.message, t.type, t.duration), i * 500);
        });
        if (toasts.length > 3) {
            setTimeout(() => showToast(`...and ${toasts.length - 3} more updates`, 'info', 2000), 1500);
        }
    }

    // Watch for animation completion to flush deferred toasts
    let wasAnimating = false;
    setInterval(() => {
        if (wasAnimating && !window.leaderboardAnimating) {
            flushDeferredToasts();
        }
        wasAnimating = !!window.leaderboardAnimating;
    }, 500);

    // Centered achievement notification — old visual design, no blocking overlay, auto-dismiss
    function showCenteredAchievement(data) {
        const badgeIcon = data.badgeIcon || '🏆';

        const el = document.createElement('div');
        el.className = 'centered-achievement';
        el.innerHTML = `
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
                <span class="points-value">+${data.points || 0} points</span>
            </div>
        `;
        document.body.appendChild(el);

        // Add confetti particles inside the card
        const confettiContainer = el.querySelector('.achievement-confetti');
        createConfetti(confettiContainer);

        // Animate in
        requestAnimationFrame(() => el.classList.add('show'));

        // Click to dismiss early
        el.addEventListener('click', () => {
            el.classList.remove('show');
            setTimeout(() => el.remove(), 400);
        });

        // Auto-dismiss after 3.5s
        setTimeout(() => {
            el.classList.remove('show');
            setTimeout(() => el.remove(), 400);
        }, 3500);
    }

    // Expose functions globally for testing and external use
    window.realtimeSocket = socket;
    window.showToast = showToast;
    window.showCenteredAchievement = showCenteredAchievement;

})();

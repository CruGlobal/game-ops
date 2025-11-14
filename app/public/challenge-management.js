document.addEventListener('DOMContentLoaded', async () => {
    const authStatus = document.getElementById('auth-status');
    const adminContent = document.getElementById('admin-content');
    const unauthorizedContent = document.getElementById('unauthorized-content');
    const challengesList = document.getElementById('challenges-list');
    const challengeCreateForm = document.getElementById('challenge-create-form');
    const challengeCreateStatus = document.getElementById('challenge-create-status');
    const challengeCategorySelect = document.getElementById('challenge-category');
    const generalChallengeFields = document.getElementById('general-challenge-fields');
    const okrChallengeFields = document.getElementById('okr-challenge-fields');
    const challengeTypeSelect = document.getElementById('challenge-type');
    const targetHelpText = document.getElementById('target-help-text');

    // State
    let allChallenges = [];
    let currentTab = 'all';
    let currentStatusFilter = 'active';
    let searchTerm = '';

    // Token management
    const setToken = (token) => {
        try {
            localStorage.setItem('token', token);
        } catch (error) {
            console.error('Error setting token in localStorage:', error);
        }
    };

    const getToken = () => {
        try {
            return localStorage.getItem('token');
        } catch (error) {
            console.error('Error getting token from localStorage:', error);
            return null;
        }
    };

    // Check if token is present in URL and store it in localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    if (token) {
        setToken(token);
        window.history.replaceState({}, document.title, "/admin/challenges");
    }

    // Set default dates
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const today = new Date().toISOString().split('T')[0];
    startDateInput.value = today;
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    endDateInput.value = thirtyDaysFromNow.toISOString().split('T')[0];

    // Toggle challenge fields based on category
    challengeCategorySelect.addEventListener('change', (e) => {
        const category = e.target.value;
        if (category === 'okr') {
            generalChallengeFields.style.display = 'none';
            okrChallengeFields.style.display = 'block';
            challengeTypeSelect.value = 'okr-label';
            challengeTypeSelect.required = false;
            document.getElementById('label-filters').required = true;
        } else {
            generalChallengeFields.style.display = 'block';
            okrChallengeFields.style.display = 'none';
            challengeTypeSelect.required = true;
            document.getElementById('label-filters').required = false;
        }
    });

    // Update target help text based on challenge type
    challengeTypeSelect.addEventListener('change', (e) => {
        const type = e.target.value;
        const helpTexts = {
            'pr-merge': 'Number of PRs to merge',
            'review': 'Number of code reviews to complete',
            'streak': 'Number of consecutive contribution days',
            'points': 'Total points to earn'
        };
        targetHelpText.textContent = helpTexts[type] || 'Number of items to complete';
    });

    // Tab switching
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentTab = e.target.dataset.tab;
            filterAndDisplayChallenges();
        });
    });

    // Status filter
    document.getElementById('status-filter').addEventListener('change', (e) => {
        currentStatusFilter = e.target.value;
        filterAndDisplayChallenges();
    });

    // Search filter
    document.getElementById('search-filter').addEventListener('input', (e) => {
        searchTerm = e.target.value.toLowerCase();
        filterAndDisplayChallenges();
    });

    // Load all challenges
    const loadChallenges = async () => {
        try {
            const response = await fetch('/api/challenges/admin/all');
            if (!response.ok) {
                throw new Error('Failed to fetch challenges');
            }

            const data = await response.json();
            allChallenges = data.challenges || [];

            updateStats();
            filterAndDisplayChallenges();
        } catch (error) {
            console.error('Error loading challenges:', error);
            challengesList.innerHTML = '<p class="error">Failed to load challenges. Please try again.</p>';
        }
    };

    // Update stats overview
    const updateStats = () => {
        const total = allChallenges.length;
        const active = allChallenges.filter(c => c.status === 'active').length;
        const completed = allChallenges.filter(c => c.status === 'expired' || c.status === 'completed').length;
        const participants = allChallenges.reduce((sum, c) => sum + (c.participants?.length || 0), 0);

        document.getElementById('total-challenges').textContent = total;
        document.getElementById('active-challenges').textContent = active;
        document.getElementById('completed-challenges').textContent = completed;
        document.getElementById('total-participants').textContent = participants;
    };

    // Filter and display challenges
    const filterAndDisplayChallenges = () => {
        let filtered = allChallenges;

        // Filter by tab
        if (currentTab !== 'all') {
            if (currentTab === 'expired') {
                filtered = filtered.filter(c => c.status === 'expired' || c.status === 'completed');
            } else {
                filtered = filtered.filter(c => c.challengeCategory === currentTab);
            }
        }

        // Filter by status
        if (currentStatusFilter !== 'all') {
            filtered = filtered.filter(c => c.status === currentStatusFilter);
        }

        // Filter by search
        if (searchTerm) {
            filtered = filtered.filter(c =>
                c.title.toLowerCase().includes(searchTerm) ||
                c.description.toLowerCase().includes(searchTerm)
            );
        }

        displayChallenges(filtered);
    };

    // Display challenges
    const displayChallenges = (challenges) => {
        if (challenges.length === 0) {
            challengesList.innerHTML = '<p class="no-data">No challenges found matching your filters.</p>';
            return;
        }

        challengesList.innerHTML = '';
        challenges.forEach(challenge => {
            const card = createChallengeCard(challenge);
            challengesList.appendChild(card);
        });
    };

    // Create challenge card
    const createChallengeCard = (challenge) => {
        const card = document.createElement('div');
        card.className = 'challenge-card';

        const participantCount = challenge.participants ? challenge.participants.length : 0;
        const categoryBadge = getCategoryBadge(challenge.challengeCategory);
        const statusBadge = `<span class="badge badge-${challenge.status}">${challenge.status}</span>`;

        let typeInfo = '';
        if (challenge.challengeCategory === 'okr' && challenge.labelFilters && challenge.labelFilters.length > 0) {
            const labelList = challenge.labelFilters.map(l => `<code>${l}</code>`).join(', ');
            typeInfo = `<div><strong>Label Filters:</strong> ${labelList}</div>`;
        } else {
            typeInfo = `<div><strong>Type:</strong> ${challenge.type}</div>`;
        }

        const okrInfo = challenge.okrMetadata && Object.values(challenge.okrMetadata).some(v => v)
            ? `
                <div class="okr-info">
                    ${challenge.okrMetadata.objective ? `<div><strong>Objective:</strong> ${challenge.okrMetadata.objective}</div>` : ''}
                    ${challenge.okrMetadata.keyResult ? `<div><strong>Key Result:</strong> ${challenge.okrMetadata.keyResult}</div>` : ''}
                    ${challenge.okrMetadata.department ? `<div><strong>Department:</strong> ${challenge.okrMetadata.department}</div>` : ''}
                    ${challenge.okrMetadata.quarter ? `<div><strong>Quarter:</strong> ${challenge.okrMetadata.quarter}</div>` : ''}
                </div>
            `
            : '';

        card.innerHTML = `
            <div class="challenge-header">
                <h3>${challenge.title}</h3>
                <div class="challenge-badges">
                    ${categoryBadge}
                    ${statusBadge}
                </div>
            </div>
            <p class="challenge-description">${challenge.description}</p>
            <div class="challenge-details">
                ${typeInfo}
                <div><strong>Target:</strong> ${challenge.target}</div>
                <div><strong>Reward:</strong> ${challenge.reward} points</div>
                <div><strong>Difficulty:</strong> <span class="badge badge-${challenge.difficulty}">${challenge.difficulty}</span></div>
                <div><strong>Participants:</strong> ${participantCount}</div>
                <div><strong>Start:</strong> ${new Date(challenge.startDate).toLocaleDateString()}</div>
                <div><strong>End:</strong> ${new Date(challenge.endDate).toLocaleDateString()}</div>
            </div>
            ${okrInfo}
            <div class="challenge-actions">
                <a href="/challenges" class="btn-secondary">View Public Page</a>
                <button class="btn-danger" onclick="deleteChallenge('${challenge.id}')">Delete</button>
            </div>
        `;
        return card;
    };

    // Get category badge
    const getCategoryBadge = (category) => {
        const badges = {
            'okr': '<span class="badge badge-okr">🎯 OKR</span>',
            'general': '<span class="badge badge-general">📌 General</span>',
            'weekly': '<span class="badge badge-weekly">📅 Weekly</span>'
        };
        return badges[category] || badges['general'];
    };

    // Delete challenge
    window.deleteChallenge = async (challengeId) => {
        if (!confirm('Are you sure you want to delete this challenge? This action cannot be undone.')) {
            return;
        }

        try {
            const storedToken = getToken();
            const response = await fetch(`/api/challenges/admin/${challengeId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${storedToken}`
                }
            });

            if (response.ok) {
                showNotification('Challenge deleted successfully', 'success');
                loadChallenges();
            } else {
                const result = await response.json();
                showNotification(`Error: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Error deleting challenge:', error);
            showNotification(`Error: ${error.message}`, 'error');
        }
    };

    // Handle form submission
    challengeCreateForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(challengeCreateForm);
        const challengeCategory = formData.get('challengeCategory');

        let requestBody;
        let endpoint;

        if (challengeCategory === 'okr') {
            // OKR Challenge
            const labelFiltersText = formData.get('labelFilters');
            const labelFilters = labelFiltersText
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            const okrMetadata = {
                objective: formData.get('objective') || '',
                keyResult: formData.get('keyResult') || '',
                department: formData.get('department') || '',
                quarter: formData.get('quarter') || ''
            };

            requestBody = {
                title: formData.get('title'),
                description: formData.get('description'),
                labelFilters: labelFilters,
                target: parseInt(formData.get('target')),
                reward: parseInt(formData.get('reward')) || 300,
                startDate: formData.get('startDate') || new Date().toISOString(),
                endDate: formData.get('endDate'),
                difficulty: formData.get('difficulty') || 'medium',
                okrMetadata: okrMetadata
            };

            endpoint = '/api/challenges/okr/create';
        } else {
            // General Challenge
            requestBody = {
                title: formData.get('title'),
                description: formData.get('description'),
                type: formData.get('type'),
                target: parseInt(formData.get('target')),
                reward: parseInt(formData.get('reward')) || 300,
                startDate: formData.get('startDate') || new Date().toISOString(),
                endDate: formData.get('endDate'),
                difficulty: formData.get('difficulty') || 'medium'
            };

            endpoint = '/api/challenges/admin/create';
        }

        try {
            const storedToken = getToken();
            if (!storedToken) {
                challengeCreateStatus.innerHTML = '<p class="error">Authentication required. Please log in.</p>';
                return;
            }

            challengeCreateStatus.innerHTML = '<p class="info">Creating challenge...</p>';

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${storedToken}`
                },
                body: JSON.stringify(requestBody)
            });

            const result = await response.json();

            if (response.ok) {
                challengeCreateStatus.innerHTML = `
                    <p class="success">
                        ✅ Challenge created successfully!<br>
                        <strong>${result.challenge.title}</strong>
                    </p>
                `;
                challengeCreateForm.reset();
                startDateInput.value = today;
                endDateInput.value = thirtyDaysFromNow.toISOString().split('T')[0];
                challengeCategorySelect.value = 'general';
                challengeCategorySelect.dispatchEvent(new Event('change'));

                setTimeout(() => {
                    loadChallenges();
                    challengeCreateStatus.innerHTML = '';
                }, 3000);
            } else {
                challengeCreateStatus.innerHTML = `<p class="error">❌ Error: ${result.error}</p>`;
            }
        } catch (error) {
            console.error('Error creating challenge:', error);
            challengeCreateStatus.innerHTML = `<p class="error">❌ Error: ${error.message}</p>`;
        }
    });

    // Show notification
    const showNotification = (message, type = 'info') => {
        challengeCreateStatus.innerHTML = `<p class="${type}">${message}</p>`;
        setTimeout(() => {
            challengeCreateStatus.innerHTML = '';
        }, 5000);
    };

    // Check authentication status
    try {
        const response = await fetch('/api/auth/status');
        if (response.ok) {
            const data = await response.json();
            if (data.isAuthenticated) {
                authStatus.textContent = `Welcome, ${data.username}`;
                adminContent.style.display = 'block';
                unauthorizedContent.style.display = 'none';
                loadChallenges();
            } else {
                adminContent.style.display = 'none';
                unauthorizedContent.style.display = 'block';
            }
        } else {
            adminContent.style.display = 'none';
            unauthorizedContent.style.display = 'block';
        }
    } catch (error) {
        console.error('Error checking authentication status:', error);
        adminContent.style.display = 'none';
        unauthorizedContent.style.display = 'block';
    }
});

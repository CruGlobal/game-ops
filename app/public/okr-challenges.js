document.addEventListener('DOMContentLoaded', async () => {
    const authStatus = document.getElementById('auth-status');
    const adminContent = document.getElementById('admin-content');
    const unauthorizedContent = document.getElementById('unauthorized-content');
    const okrChallengesList = document.getElementById('okr-challenges-list');

    // Function to set the token in localStorage
    const setToken = (token) => {
        try {
            localStorage.setItem('token', token);
        } catch (error) {
            console.error('Error setting token in localStorage:', error);
        }
    };

    // Function to get the token from localStorage
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
        window.history.replaceState({}, document.title, "/admin/okr-challenges");
    }

    // Load existing OKR challenges
    const loadOKRChallenges = async () => {
        try {
            const response = await fetch('/api/challenges/active');
            if (!response.ok) {
                throw new Error('Failed to fetch challenges');
            }

            const data = await response.json();
            const okrChallenges = data.challenges.filter(c => c.type === 'okr-label');

            if (okrChallenges.length === 0) {
                okrChallengesList.innerHTML = '<p class="no-data">No OKR challenges found. Create one above!</p>';
                return;
            }

            okrChallengesList.innerHTML = '';
            okrChallenges.forEach(challenge => {
                const card = document.createElement('div');
                card.className = 'challenge-card';

                const participantCount = challenge.participants ? challenge.participants.length : 0;
                const labelList = challenge.labelFilters && challenge.labelFilters.length > 0
                    ? challenge.labelFilters.map(l => `<code>${l}</code>`).join(', ')
                    : '<em>No filters</em>';

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
                    <h3>${challenge.title}</h3>
                    <p class="challenge-description">${challenge.description}</p>
                    <div class="challenge-details">
                        <div><strong>Label Filters:</strong> ${labelList}</div>
                        <div><strong>Target:</strong> ${challenge.target} PRs</div>
                        <div><strong>Reward:</strong> ${challenge.reward} points</div>
                        <div><strong>Difficulty:</strong> <span class="badge badge-${challenge.difficulty}">${challenge.difficulty}</span></div>
                        <div><strong>Participants:</strong> ${participantCount}</div>
                        <div><strong>End Date:</strong> ${new Date(challenge.endDate).toLocaleDateString()}</div>
                    </div>
                    ${okrInfo}
                    <div class="challenge-actions">
                        <a href="/challenges" class="btn-secondary">View Challenge</a>
                    </div>
                `;
                okrChallengesList.appendChild(card);
            });
        } catch (error) {
            console.error('Error loading OKR challenges:', error);
            okrChallengesList.innerHTML = '<p class="error">Failed to load challenges. Please try again.</p>';
        }
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
                loadOKRChallenges();
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

    // Handle OKR Challenge Form Submission
    const okrChallengeForm = document.getElementById('okr-challenge-form');
    const challengeCreateStatus = document.getElementById('challenge-create-status');

    if (okrChallengeForm) {
        // Set default start date to today
        const startDateInput = document.getElementById('start-date');
        const today = new Date().toISOString().split('T')[0];
        startDateInput.value = today;

        // Set default end date to 30 days from now
        const endDateInput = document.getElementById('end-date');
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        endDateInput.value = thirtyDaysFromNow.toISOString().split('T')[0];

        okrChallengeForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = new FormData(okrChallengeForm);

            // Parse label filters (one per line)
            const labelFiltersText = formData.get('labelFilters');
            const labelFilters = labelFiltersText
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            // Build OKR metadata
            const okrMetadata = {
                objective: formData.get('objective') || '',
                keyResult: formData.get('keyResult') || '',
                department: formData.get('department') || '',
                quarter: formData.get('quarter') || ''
            };

            // Build request body
            const requestBody = {
                title: formData.get('title'),
                description: formData.get('description'),
                labelFilters: labelFilters,
                target: parseInt(formData.get('target')),
                reward: parseInt(formData.get('reward')) || 300,
                startDate: formData.get('startDate') || new Date().toISOString(),
                endDate: formData.get('endDate'),
                difficulty: formData.get('difficulty') || 'hard',
                okrMetadata: okrMetadata
            };

            try {
                const storedToken = getToken();
                if (!storedToken) {
                    challengeCreateStatus.innerHTML = '<p class="error">Authentication required. Please log in.</p>';
                    return;
                }

                challengeCreateStatus.innerHTML = '<p class="info">Creating challenge...</p>';

                const response = await fetch('/api/challenges/okr/create', {
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
                            <strong>${result.challenge.title}</strong><br>
                            ID: ${result.challenge._id}<br>
                            <a href="/challenges">View all challenges</a>
                        </p>
                    `;
                    okrChallengeForm.reset();
                    // Reset dates to defaults
                    startDateInput.value = today;
                    endDateInput.value = thirtyDaysFromNow.toISOString().split('T')[0];

                    // Reload the challenges list
                    setTimeout(() => {
                        loadOKRChallenges();
                        challengeCreateStatus.innerHTML = '';
                    }, 3000);
                } else {
                    challengeCreateStatus.innerHTML = `<p class="error">❌ Error: ${result.error}</p>`;
                }
            } catch (error) {
                console.error('Error creating OKR challenge:', error);
                challengeCreateStatus.innerHTML = `<p class="error">❌ Error: ${error.message}</p>`;
            }
        });
    }
});

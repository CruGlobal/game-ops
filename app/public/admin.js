document.addEventListener('DOMContentLoaded', async () => {
    const authStatus = document.getElementById('auth-status');
    const adminContent = document.getElementById('admin-content');
    const contributorsList = document.getElementById('contributors-list');
    const resetAllButton = document.getElementById('reset-all');

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
        window.history.replaceState({}, document.title, "/admin"); // Remove token from URL
    }

    //const storedToken = getToken();

    const loadContributors = async () => {
        try {
            const storedToken = getToken();
            if (!storedToken) {
                throw new Error('No token found');
            }
            const response = await fetch('/api/admin/contributors', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${storedToken}`
                }
            });
            if (response.ok) {
                const contributors = await response.json();
                contributorsList.innerHTML = '';
                contributors.forEach(contributor => {
                    const listItem = document.createElement('li');
                    listItem.innerHTML = `
                        ${contributor.username}
                        <button class="reset-contributor" data-username="${contributor.username}">Reset</button>
                    `;
                    contributorsList.appendChild(listItem);
                });
            } else {
                alert('Error loading contributors');
            }
        } catch (error) {
            console.error('Error loading contributors:', error);
        }
    };

    try {
        const response = await fetch('/api/auth/status');
        if (response.ok) {
            const data = await response.json();
            if (data.isAuthenticated) {
                authStatus.textContent = `Welcome, ${data.username}`;
                adminContent.style.display = 'block';
                loadContributors();
            } else {
                adminContent.style.display = 'none';
            }
        } else {
            adminContent.style.display = 'none';
        }
    } catch (error) {
        console.error('Error checking authentication status:', error);
        adminContent.style.display = 'none';
    }

    resetAllButton.addEventListener('click', async () => {
        try {
            const storedToken = getToken();
            if (!storedToken) {
                throw new Error('No token found');
            }
            const response = await fetch('/api/admin/reset-all', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${storedToken}`
                }
            });
            if (response.ok) {
                alert('All contributors reset successfully');
                loadContributors();
            } else {
                alert('Error resetting all contributors');
            }
        } catch (error) {
            console.error('Error resetting all contributors:', error);
        }
    });

    contributorsList.addEventListener('click', async (e) => {
        if (e.target.classList.contains('reset-contributor')) {
            const username = e.target.dataset.username;
            try {
                const storedToken = getToken();
                if (!storedToken) {
                    throw new Error('No token found');
                }
                const response = await fetch(`/api/admin/reset-contributor`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${storedToken}`
                    },
                    body: JSON.stringify({ username })
                });
                if (response.ok) {
                    alert(`Contributor ${username} reset successfully`);
                    loadContributors();
                } else {
                    alert(`Error resetting contributor ${username}`);
                }
            } catch (error) {
                console.error(`Error resetting contributor ${username}:`, error);
            }
        }
    });

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
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
});
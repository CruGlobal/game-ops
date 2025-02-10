document.addEventListener('DOMContentLoaded', () => {
    const authForm = document.getElementById('auth-form');
    const adminContent = document.getElementById('admin-content');
    const adminPassword = document.getElementById('admin-password');
    const contributorsList = document.getElementById('contributors-list');
    const resetAllButton = document.getElementById('reset-all');

    // Get the token from the URL
    function getParameterByName(name, url = window.location.href) {
        name = name.replace(/[\[\]]/g, '\\$&');
        const regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
            results = regex.exec(url);
        if (!results) return null;
        if (!results[2]) return '';
        return decodeURIComponent(results[2].replace(/\+/g, ' '));
    }

    // Get the token from the URL and store it in localStorage
    const token = getParameterByName('token');
    if (token) {
        localStorage.setItem('token', token);
    }

    // Function to load the list of contributors from the server
    const loadContributors = async () => {
        const response = await fetch('/api/admin/contributors', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
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
    };

    // Handle the admin login form submission
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = adminPassword.value;
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        if (response.ok) {
            authForm.style.display = 'none';
            adminContent.style.display = 'block';
            loadContributors();
        } else {
            alert('Invalid password');
        }
    });

    // Handle the reset all contributors button click
    resetAllButton.addEventListener('click', async () => {
        const response = await fetch('/api/admin/reset-all', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        if (response.ok) {
            alert('All contributors reset successfully');
            loadContributors();
        } else {
            alert('Error resetting all contributors');
        }
    });

    // Handle the reset button click for individual contributors
    contributorsList.addEventListener('click', async (e) => {
        if (e.target.classList.contains('reset-contributor')) {
            const username = e.target.dataset.username;
            const response = await fetch(`/api/admin/reset-contributor`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ username })
            });
            if (response.ok) {
                alert(`Contributor ${username} reset successfully`);
                loadContributors();
            } else {
                alert(`Error resetting contributor ${username}`);
            }
        }
    });
});
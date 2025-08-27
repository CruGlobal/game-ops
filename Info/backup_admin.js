// Wait for the DOM to fully load before executing the script
document.addEventListener('DOMContentLoaded', () => {
    // Get references to the DOM elements
    const authForm = document.getElementById('auth-form');
    const adminContent = document.getElementById('admin-content');
    const adminPassword = document.getElementById('admin-password');
    const contributorsList = document.getElementById('contributors-list');
    const resetAllButton = document.getElementById('reset-all');

    // Handle the admin login form submission
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Prevent the default form submission behavior
        const password = adminPassword.value; // Get the entered password
        // Send a POST request to the server to authenticate the admin
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }) // Send the password in the request body
        });
        if (response.ok) {
            // If authentication is successful, hide the login form and show the admin content
            authForm.style.display = 'none';
            adminContent.style.display = 'block';
            loadContributors(); // Load the list of contributors
        } else {
            alert('Invalid password'); // Show an alert if the password is incorrect
        }
    });

    // Function to load the list of contributors from the server
    const loadContributors = async () => {
        const response = await fetch('/api/admin/contributors'); // Fetch the contributors
        const contributors = await response.json(); // Parse the JSON response
        contributorsList.innerHTML = ''; // Clear the current list
        // Iterate over each contributor and create a list item
        contributors.forEach(contributor => {
            const listItem = document.createElement('li');
            listItem.innerHTML = `
                ${contributor.username}
                <button class="reset-contributor" data-username="${contributor.username}">Reset</button>
            `;
            contributorsList.appendChild(listItem); // Add the list item to the contributors list
        });
    };

    // Handle the reset all contributors button click
    resetAllButton.addEventListener('click', async () => {
        // Send a POST request to reset all contributors
        const response = await fetch('/api/admin/reset-all', {
            method: 'POST'
        });
        if (response.ok) {
            alert('All contributors reset successfully'); // Show a success message
            loadContributors(); // Reload the list of contributors
        } else {
            alert('Error resetting all contributors'); // Show an error message
        }
    });

    // Handle the reset button click for individual contributors
    contributorsList.addEventListener('click', async (e) => {
        if (e.target.classList.contains('reset-contributor')) {
            const username = e.target.dataset.username; // Get the username from the data attribute
            // Send a POST request to reset the specific contributor
            const response = await fetch(`/api/admin/reset-contributor`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username }) // Send the username in the request body
            });
            if (response.ok) {
                alert(`Contributor ${username} reset successfully`); // Show a success message
                loadContributors(); // Reload the list of contributors
            } else {
                alert(`Error resetting contributor ${username}`); // Show an error message
            }
        }
    });
});
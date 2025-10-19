// Function to set the token in localStorage
const setToken = (token) => {
    localStorage.setItem('token', token);
};

// Function to get the token from localStorage
const getToken = () => {
    return localStorage.getItem('token');
};

document.addEventListener('DOMContentLoaded', () => {
    const token = getToken();
    const adminContent = document.getElementById('admin-content');

    if (adminContent) {
        if (token) {
            adminContent.style.display = 'block';
        } else {
            adminContent.style.display = 'none';
        }
    }

    // Initialize modernized navigation submenu toggle
    const adminMenuToggle = document.querySelector('.admin-menu-toggle');
    if (adminMenuToggle) {
        adminMenuToggle.addEventListener('click', () => {
            const isExpanded = adminMenuToggle.getAttribute('aria-expanded') === 'true';
            adminMenuToggle.setAttribute('aria-expanded', !isExpanded);
        });
    }
});
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
        } else {
            console.error('Required elements not found in the DOM.');
        }
    });
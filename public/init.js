document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    const authForm = document.getElementById('auth-form');
    const adminContent = document.getElementById('admin-content');

    if (token) {
        authForm.style.display = 'none';
        adminContent.style.display = 'block';
    } else {
        authForm.style.display = 'block';
        adminContent.style.display = 'none';
    }
});
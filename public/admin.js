document.addEventListener('DOMContentLoaded', () => {
    const authForm = document.getElementById('auth-form');
    const resetForm = document.getElementById('reset-form');
    const adminPassword = document.getElementById('admin-password');
    const contributorUsername = document.getElementById('contributor-username');

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
            resetForm.style.display = 'block';
        } else {
            alert('Invalid password');
        }
    });

    resetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = contributorUsername.value;
        const response = await fetch(`/api/admin/reset-contributor`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });
        if (response.ok) {
            alert('Contributor reset successfully');
        } else {
            alert('Error resetting contributor');
        }
    });
});
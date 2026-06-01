document.addEventListener('DOMContentLoaded', () => {
    async function login(event) {
        event.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        if (response.ok) {
            // Auth is carried by the httpOnly session cookie; never put the
            // token in the URL or localStorage.
            window.location.href = '/admin';
        } else {
            alert('Invalid credentials');
        }
    }

    document.getElementById('login-form').addEventListener('submit', login);
});
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
            const data = await response.json();
            // Redirect to admin with the token as a query parameter
            window.location.href = `/admin?token=${data.token}`;
        } else {
            alert('Invalid credentials');
        }
    }

    document.getElementById('login-form').addEventListener('submit', login);

    // Function to get the token from the URL
    function getParameterByName(name, url = window.location.href) {
        name = name.replace(/[\[\]]/g, '\\$&');
        var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
            results = regex.exec(url);
        if (!results) return null;
        if (!results[2]) return '';
        return decodeURIComponent(results[2].replace(/\+/g, ' '));
    }

    // Get the token from the URL
    const token = getParameterByName('token');
    if (token) {
        // Store the token in localStorage
        localStorage.setItem('token', token);
    }
});
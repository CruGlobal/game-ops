// The localStorage token gate that used to live here is gone. setToken was never
// called anywhere, so getToken() always returned null and this only ever hid
// #admin-content — which admin.ejs then unhid from its own /api/auth/status check,
// loaded after this file. Auth is the httpOnly session cookie; there is no token.

document.addEventListener('DOMContentLoaded', () => {
    // Initialize modernized navigation submenu toggle
    const adminMenuToggle = document.querySelector('.admin-menu-toggle');
    if (adminMenuToggle) {
        adminMenuToggle.addEventListener('click', () => {
            const isExpanded = adminMenuToggle.getAttribute('aria-expanded') === 'true';
            adminMenuToggle.setAttribute('aria-expanded', !isExpanded);
        });
    }
});
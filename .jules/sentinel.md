## 2024-05-18 - Fix DOM-based XSS Vulnerabilities
**Vulnerability:** User-controlled data (usernames, badges, avatar URLs) was being directly injected into the DOM using `innerHTML` in several files (`app/public/admin.js`, `app/views/admin.ejs`, `app/public/activity_script.js`, `app/public/badges.js`).
**Learning:** In EJS templates and vanilla JS DOM manipulation, relying solely on client-side or implicit server-side rendering is insufficient if the data isn't escaped right before being inserted into `innerHTML`.
**Prevention:** Always define and use a robust HTML escaping function (`escapeHtml`) immediately before writing dynamic user-controlled text into `innerHTML`.

## 2026-07-13 - Prevent Timing Attacks in Login
**Vulnerability:** In `app/controllers/authController.js`, standard string equality (`===`) was used to check the admin credentials. This exposes the login endpoint to timing attacks where an attacker can determine correct characters in a password by observing small timing variations in the response.
**Learning:** This codebase handles administrative login via simple string equality.
**Prevention:** Use a constant-time comparison mechanism, like `crypto.timingSafeEqual`, when verifying secrets or passwords to prevent timing-based side channels.

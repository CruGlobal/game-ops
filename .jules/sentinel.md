## 2024-05-18 - Fix DOM-based XSS Vulnerabilities
**Vulnerability:** User-controlled data (usernames, badges, avatar URLs) was being directly injected into the DOM using `innerHTML` in several files (`app/public/admin.js`, `app/views/admin.ejs`, `app/public/activity_script.js`, `app/public/badges.js`).
**Learning:** In EJS templates and vanilla JS DOM manipulation, relying solely on client-side or implicit server-side rendering is insufficient if the data isn't escaped right before being inserted into `innerHTML`.
**Prevention:** Always define and use a robust HTML escaping function (`escapeHtml`) immediately before writing dynamic user-controlled text into `innerHTML`.

## 2026-07-13 - Prevent Timing Attacks in Login
**Vulnerability:** In `app/controllers/authController.js`, standard string equality (`===`) was used to check the admin credentials. This exposes the login endpoint to timing attacks where an attacker can determine correct characters in a password by observing small timing variations in the response.
**Learning:** This codebase handles administrative login via simple string equality.
**Prevention:** Use a constant-time comparison mechanism, like `crypto.timingSafeEqual`, when verifying secrets or passwords to prevent timing-based side channels.

## 2026-10-05 - Missing XSS escaping in DOM innerHTML assignment
**Vulnerability:** User-controlled content (such as badges, bills, usernames) returned from an API route (`/api/admin/run-badge-bill-scan`) was directly interpolated into an HTML string and appended via `element.innerHTML = ...` without escaping, leading to a Cross-Site Scripting (XSS) vulnerability.
**Learning:** EJS template context has `escapeHtml()` available for safely escaping values, but in-page client-side scripts might forget to use it when manipulating the DOM.
**Prevention:** Always wrap dynamically retrieved fields containing user input with `escapeHtml(...)` or standard DOM methods like `textContent`/`innerText` before assigning them into `.innerHTML`.

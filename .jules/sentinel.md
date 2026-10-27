## 2024-05-18 - Fix DOM-based XSS Vulnerabilities
**Vulnerability:** User-controlled data (usernames, badges, avatar URLs) was being directly injected into the DOM using `innerHTML` in several files (`app/public/admin.js`, `app/views/admin.ejs`, `app/public/activity_script.js`, `app/public/badges.js`).
**Learning:** In EJS templates and vanilla JS DOM manipulation, relying solely on client-side or implicit server-side rendering is insufficient if the data isn't escaped right before being inserted into `innerHTML`.
**Prevention:** Always define and use a robust HTML escaping function (`escapeHtml`) immediately before writing dynamic user-controlled text into `innerHTML`.

## 2026-07-13 - Prevent Timing Attacks in Login
**Vulnerability:** In `app/controllers/authController.js`, standard string equality (`===`) was used to check the admin credentials. This exposes the login endpoint to timing attacks where an attacker can determine correct characters in a password by observing small timing variations in the response.
**Learning:** This codebase handles administrative login via simple string equality.
**Prevention:** Use a constant-time comparison mechanism, like `crypto.timingSafeEqual`, when verifying secrets or passwords to prevent timing-based side channels.

## 2026-10-02 - Client-side XSS via EJS `.innerHTML` assignment
**Vulnerability:** EJS templates contain inline `<script>` blocks where strings generated from user-controlled inputs and database fields were concatenated with HTML markup and then injected dynamically using `el.innerHTML = html`. Because these templates define the frontend JavaScript, server-side EJS escaping (`<%=`) is insufficient or inapplicable for dynamically generated frontend DOM segments.
**Learning:** This codebase handles safe frontend markup generation by loading a global `escapeHtml()` function (from `/escape-html.js`) prior to the main script blocks. However, many components in the UI (like `app/views/admin.ejs`) still concatenated database outputs directly into `.innerHTML` structures without calling `escapeHtml()`.
**Prevention:** Always trace the rendering pathway of data in this project. When injecting dynamic UI components client-side via JavaScript (e.g. `el.innerHTML = ...`), **every variable that derives from the backend or the DOM** must be wrapped in `escapeHtml()`. Array values like `.join()` outputs must also individually `.map(escapeHtml)` before joining.

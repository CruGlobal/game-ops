## 2024-05-24 - [CRITICAL] Client-side XSS via EJS `.innerHTML` assignment

**Vulnerability:** EJS templates contain inline `<script>` blocks where strings generated from user-controlled inputs and database fields were concatenated with HTML markup and then injected dynamically using `el.innerHTML = html`. Because these templates define the frontend JavaScript, server-side EJS escaping (`<%=`) is insufficient or inapplicable for dynamically generated frontend DOM segments.

**Learning:** This codebase handles safe frontend markup generation by loading a global `escapeHtml()` function (from `/escape-html.js`) prior to the main script blocks. However, many components in the UI (like `app/views/admin.ejs`) still concatenated database outputs directly into `.innerHTML` structures without calling `escapeHtml()`.

**Prevention:** Always trace the rendering pathway of data in this project. When injecting dynamic UI components client-side via JavaScript (e.g. `el.innerHTML = ...`), **every variable that derives from the backend or the DOM** must be wrapped in `escapeHtml()`. Array values like `.join()` outputs must also individually `.map(escapeHtml)` before joining.

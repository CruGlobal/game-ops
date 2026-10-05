## 2026-10-05 - Missing XSS escaping in DOM innerHTML assignment
**Vulnerability:** User-controlled content (such as badges, bills, usernames) returned from an API route (`/api/admin/run-badge-bill-scan`) was directly interpolated into an HTML string and appended via `element.innerHTML = ...` without escaping, leading to a Cross-Site Scripting (XSS) vulnerability.
**Learning:** EJS template context has `escapeHtml()` available for safely escaping values, but in-page client-side scripts might forget to use it when manipulating the DOM.
**Prevention:** Always wrap dynamically retrieved fields containing user input with `escapeHtml(...)` or standard DOM methods like `textContent`/`innerText` before assigning them into `.innerHTML`.
## 2026-10-05 - Missing XSS escaping in DOM innerHTML assignment
**Vulnerability:** User-controlled content (such as badges, bills, usernames) returned from an API route (`/api/admin/run-badge-bill-scan`) was directly interpolated into an HTML string and appended via `element.innerHTML = ...` without escaping, leading to a Cross-Site Scripting (XSS) vulnerability.
**Learning:** EJS template context has `escapeHtml()` available for safely escaping values, but in-page client-side scripts might forget to use it when manipulating the DOM.
**Prevention:** Always wrap dynamically retrieved fields containing user input with `escapeHtml(...)` or standard DOM methods like `textContent`/`innerText` before assigning them into `.innerHTML`.

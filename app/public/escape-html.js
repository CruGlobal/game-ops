/**
 * Escape a value for safe interpolation into HTML — including inside
 * double-quoted attributes. Escapes & < > " ' so untrusted strings such as
 * avatarUrl/username cannot break out and inject markup.
 *
 * Loaded as a standalone script so every page can share one definition.
 */
function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

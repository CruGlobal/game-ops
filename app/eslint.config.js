// Flat config, required by ESLint >= 9 (the .eslintrc.json format was removed in v10).
// Rules are a straight port of the previous .eslintrc.json. The per-area blocks below
// supply the globals that config was missing, which is what produced the bulk of its
// `no-undef` noise: Jest's injected globals in the suite, and browser globals in public/.
import js from '@eslint/js';
import globals from 'globals';

const sharedRules = {
    'no-console': 'warn',
    'no-unused-vars': 'error',
    'no-undef': 'error',
    semi: ['error', 'always'],
    quotes: ['error', 'single'],
    indent: ['error', 4],
    'no-trailing-spaces': 'error',
    'eol-last': 'error',
};

export default [
    {
        ignores: ['node_modules/**', 'coverage/**'],
    },
    js.configs.recommended,
    {
        // Server-side application code: ESM running on Node.
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: globals.node,
        },
        rules: sharedRules,
    },
    {
        // Jest injects describe/it/expect rather than importing them.
        files: ['__tests__/**/*.js'],
        languageOptions: {
            globals: { ...globals.node, ...globals.jest },
        },
    },
    {
        // Browser assets, loaded via <script> rather than as modules.
        files: ['public/**/*.js'],
        languageOptions: {
            sourceType: 'script',
            globals: {
                ...globals.browser,
                // Loaded as separate <script> tags, so these are globals at
                // runtime rather than imports: helpers from sibling files,
                // and Chart.js / socket.io from their CDN bundles.
                escapeHtml: 'readonly',
                showToast: 'readonly',
                Chart: 'readonly',
                io: 'readonly',
                socket: 'readonly',
            },
        },
        rules: {
            // These files log to the browser console deliberately.
            'no-console': 'off',
        },
    },
];

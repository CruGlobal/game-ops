/**
 * Dark Mode Toggle
 * Handles theme switching between light and dark modes
 */

(function() {
    'use strict';

    // Get stored theme or default to light
    const getStoredTheme = () => localStorage.getItem('theme') || 'light';

    // Store theme preference
    const setStoredTheme = (theme) => localStorage.setItem('theme', theme);

    // Apply theme to document
    const applyTheme = (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        updateToggleIcon(theme);
    };

    // Update toggle button icon
    const updateToggleIcon = (theme) => {
        const toggle = document.getElementById('theme-toggle');
        if (toggle) {
            toggle.textContent = theme === 'dark' ? '☀️' : '🌙';
            toggle.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
        }
    };

    // Toggle between light and dark themes
    const toggleTheme = () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        applyTheme(newTheme);
        setStoredTheme(newTheme);

        // Optional: Show toast notification
        if (typeof window.showToast === 'function') {
            window.showToast(
                `${newTheme === 'dark' ? 'Dark' : 'Light'} mode activated`,
                'info',
                2000
            );
        }
    };

    // Initialize theme on page load
    const initTheme = () => {
        const storedTheme = getStoredTheme();
        applyTheme(storedTheme);

        // Create toggle button if it doesn't exist
        if (!document.getElementById('theme-toggle')) {
            createToggleButton();
        }

        // Add event listener to toggle button
        const toggle = document.getElementById('theme-toggle');
        if (toggle) {
            toggle.addEventListener('click', toggleTheme);
        }
    };

    // Create floating toggle button
    const createToggleButton = () => {
        const toggle = document.createElement('button');
        toggle.id = 'theme-toggle';
        toggle.className = 'theme-toggle';
        toggle.setAttribute('aria-label', 'Toggle theme');
        toggle.setAttribute('type', 'button');

        document.body.appendChild(toggle);
    };

    // Listen for system theme changes
    const watchSystemTheme = () => {
        if (window.matchMedia) {
            const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');

            darkModeQuery.addEventListener('change', (e) => {
                // Only auto-switch if user hasn't set a preference
                if (!localStorage.getItem('theme')) {
                    applyTheme(e.matches ? 'dark' : 'light');
                }
            });
        }
    };

    // Initialize on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initTheme();
            watchSystemTheme();
        });
    } else {
        initTheme();
        watchSystemTheme();
    }

    // Expose functions globally for testing
    window.themeToggle = {
        toggle: toggleTheme,
        setTheme: (theme) => {
            applyTheme(theme);
            setStoredTheme(theme);
        },
        getTheme: () => document.documentElement.getAttribute('data-theme') || 'light'
    };

})();

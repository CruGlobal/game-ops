/**
 * Notification Settings Manager
 * Manages user preferences for toast notifications and achievement popups
 */

class NotificationSettings {
    constructor() {
        this.storageKey = 'notificationSettings';
        this.defaultSettings = {
            toastsEnabled: true,
            achievementsEnabled: true
        };
    }

    /**
     * Get current notification settings
     */
    getSettings() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                return { ...this.defaultSettings, ...JSON.parse(stored) };
            }
        } catch (error) {
            console.error('Error reading notification settings:', error);
        }
        return { ...this.defaultSettings };
    }

    /**
     * Update notification settings
     */
    setSettings(settings) {
        try {
            const current = this.getSettings();
            const updated = { ...current, ...settings };
            localStorage.setItem(this.storageKey, JSON.stringify(updated));

            // Dispatch event so other parts of the app can react
            window.dispatchEvent(new CustomEvent('notification-settings-changed', {
                detail: updated
            }));

            return updated;
        } catch (error) {
            console.error('Error saving notification settings:', error);
            return this.getSettings();
        }
    }

    /**
     * Check if toasts are enabled
     */
    areToastsEnabled() {
        return this.getSettings().toastsEnabled;
    }

    /**
     * Check if achievements are enabled
     */
    areAchievementsEnabled() {
        return this.getSettings().achievementsEnabled;
    }

    /**
     * Toggle toast notifications
     */
    toggleToasts(enabled) {
        return this.setSettings({ toastsEnabled: enabled });
    }

    /**
     * Toggle achievement popups
     */
    toggleAchievements(enabled) {
        return this.setSettings({ achievementsEnabled: enabled });
    }

    /**
     * Reset to defaults
     */
    resetToDefaults() {
        localStorage.removeItem(this.storageKey);
        window.dispatchEvent(new CustomEvent('notification-settings-changed', {
            detail: this.defaultSettings
        }));
        return this.defaultSettings;
    }
}

// Create singleton instance
const notificationSettings = new NotificationSettings();

// Export for use in other scripts
if (typeof window !== 'undefined') {
    window.notificationSettings = notificationSettings;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = notificationSettings;
}

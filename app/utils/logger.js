import { createWriteStream } from 'fs';
import { join } from 'path';

class Logger {
    constructor() {
        this.logLevels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3
        };
        
        this.currentLevel = process.env.LOG_LEVEL || 'info';
    }

    _shouldLog(level) {
        return this.logLevels[level] <= this.logLevels[this.currentLevel];
    }

    _formatMessage(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level: level.toUpperCase(),
            message,
            ...meta
        };
        return JSON.stringify(logEntry);
    }

    _log(level, message, meta) {
        if (!this._shouldLog(level)) return;

        const formattedMessage = this._formatMessage(level, message, meta);
        
        if (process.env.NODE_ENV === 'production') {
            // In production, write to stdout/stderr
            if (level === 'error') {
                console.error(formattedMessage);
            } else {
                console.log(formattedMessage);
            }
        } else {
            // In development, use regular console methods for better readability
            const timestamp = new Date().toISOString();
            const prefix = `[${timestamp}] ${level.toUpperCase()}:`;
            
            switch (level) {
                case 'error':
                    console.error(prefix, message, meta);
                    break;
                case 'warn':
                    console.warn(prefix, message, meta);
                    break;
                case 'info':
                    console.info(prefix, message, meta);
                    break;
                case 'debug':
                    console.debug(prefix, message, meta);
                    break;
                default:
                    console.log(prefix, message, meta);
            }
        }
    }

    error(message, meta = {}) {
        this._log('error', message, meta);
    }

    warn(message, meta = {}) {
        this._log('warn', message, meta);
    }

    info(message, meta = {}) {
        this._log('info', message, meta);
    }

    debug(message, meta = {}) {
        this._log('debug', message, meta);
    }
}

export default new Logger();
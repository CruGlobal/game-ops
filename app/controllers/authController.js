// authController.js
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import crypto from 'crypto';

// Retrieve the admin credentials from environment variables
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

// Constant-time string compare (length-guarded so timingSafeEqual never throws).
function secureCompare(a, b) {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// Admin login function
export const login = [
    body('username').isString().trim().notEmpty(),
    body('password').isString().trim().notEmpty(),
    (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ message: 'Username and password are required' });
        }

        const { username, password } = req.body;

        // Use secure compare to prevent timing attacks
        const isUsernameValid = secureCompare(username, ADMIN_USERNAME);
        const isPasswordValid = secureCompare(password, ADMIN_PASSWORD);

        if (isUsernameValid && isPasswordValid) {
            const secret = process.env.JWT_SECRET;
            const token = jwt.sign({ username }, secret, { expiresIn: '1h' });
            res.json({ token });
        } else {
            res.status(401).json({ message: 'Invalid credentials' });
        }
    }
];

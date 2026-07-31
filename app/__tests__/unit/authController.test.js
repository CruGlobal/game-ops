import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';

// authController reads the admin credentials at module load, so set the
// environment before the dynamic import.
let loginHandler;

beforeAll(async () => {
    process.env.ADMIN_USERNAME = 'testadmin';
    process.env.ADMIN_PASSWORD = 'testpassword';
    process.env.JWT_SECRET = 'test_jwt_secret';

    const { login } = await import('../../controllers/authController.js');
    // login is [usernameValidator, passwordValidator, handler]
    loginHandler = login[login.length - 1];
});

function mockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

describe('authController login', () => {
    it('issues a JWT for valid credentials', () => {
        const res = mockRes();
        loginHandler({ body: { username: 'testadmin', password: 'testpassword' } }, res);

        expect(res.status).not.toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledTimes(1);
        const { token } = res.json.mock.calls[0][0];
        const decoded = jwt.verify(token, 'test_jwt_secret');
        expect(decoded.username).toBe('testadmin');
    });

    it('rejects a wrong password of the same length', () => {
        const res = mockRes();
        loginHandler({ body: { username: 'testadmin', password: 'testpassworX' } }, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ message: 'Invalid credentials' });
    });

    it('rejects a password of a different length (timingSafeEqual length guard)', () => {
        const res = mockRes();
        loginHandler({ body: { username: 'testadmin', password: 'testpassword-and-more' } }, res);

        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('rejects a wrong username even when the password is correct', () => {
        const res = mockRes();
        loginHandler({ body: { username: 'nottheadmin', password: 'testpassword' } }, res);

        expect(res.status).toHaveBeenCalledWith(401);
    });
});

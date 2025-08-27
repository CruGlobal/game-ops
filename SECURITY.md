# Security Policy

## Environment Variables

**CRITICAL:** This application uses sensitive environment variables that must be kept secure:

- `GITHUB_TOKEN` - GitHub personal access token with repo access
- `GITHUB_CLIENT_SECRET` - OAuth application client secret
- `JWT_SECRET` - Secret for signing JWT tokens
- `SESSION_SECRET` - Secret for Express sessions
- `ADMIN_PASSWORD` - Admin account password
- AWS credentials (production only)

### Security Requirements

1. **Never commit secrets to version control**
2. **Use strong, randomly generated secrets**
   - Generate JWT/Session secrets: `openssl rand -hex 32`
3. **Rotate secrets regularly**
4. **Use environment-specific `.env` files**
5. **Validate all environment variables on startup**

## Reporting Security Issues

If you discover a security vulnerability, please report it by emailing [security contact] rather than creating a public issue.

## Security Features

- Rate limiting on all endpoints
- Input validation and sanitization
- Helmet.js security headers
- MongoDB query sanitization
- Environment-based error handling (no stack traces in production)
- Structured logging without sensitive data exposure
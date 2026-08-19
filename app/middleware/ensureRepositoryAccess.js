import fetch from 'node-fetch';

// How long a verified repository-access decision stays good for on a session.
const REPO_ACCESS_TTL_MS = 15 * 60 * 1000;

/**
 * Middleware to ensure user has access to the repository
 * Checks if user is authenticated and has read access to the configured repository
 */
export const ensureRepositoryAccess = async (req, res, next) => {
    // In tests or local dev with auth disabled, bypass external auth checks.
    // DISABLE_AUTH is never honored in production so it cannot open access if leaked.
    if (process.env.NODE_ENV === 'test' || (process.env.DISABLE_AUTH === 'true' && process.env.NODE_ENV !== 'production')) {
        return next();
    }

    const isAuth = typeof req.isAuthenticated === 'function' ? req.isAuthenticated() : false;

    // This guard now fronts every /api call, not just page loads. Without caching, each
    // request would add a GitHub round-trip and eat into the 5000/hr token budget, so a
    // verified decision is remembered on the session for a while.
    if (isAuth && req.session?.repoAccessGrantedAt &&
        Date.now() - req.session.repoAccessGrantedAt < REPO_ACCESS_TTL_MS) {
        return next();
    }

    if (isAuth) {
        const token = process.env.GITHUB_TOKEN;
        const repoOwner = process.env.REPO_OWNER || process.env.GITHUB_ORG;
        const repoName = process.env.REPO_NAME || 'cru-terraform';
        
        try {
            // Check if user has access to the repository
            const response = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/collaborators/${encodeURIComponent(req.user.username)}`, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.ok) {
                // User has access to the repository
                if (req.session) req.session.repoAccessGrantedAt = Date.now();
                return next();
            } else if (response.status === 404) {
                // User is not a collaborator, check if repo is public and user is org member
                const orgResponse = await fetch(`https://api.github.com/orgs/${repoOwner}/members/${encodeURIComponent(req.user.username)}`, {
                    headers: {
                        'Authorization': `token ${token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });

                if (orgResponse.ok) {
                    // User is org member, allow access
                    if (req.session) req.session.repoAccessGrantedAt = Date.now();
                    return next();
                }
            }

            console.error('User does not have access to repository:', req.user.username);
            res.status(403).send('Forbidden: You do not have access to this repository');
        } catch (error) {
            console.error('Error checking repository access:', error);
            res.status(500).send('Internal Server Error');
        }
    } else {
        // Not authenticated - redirect to GitHub OAuth
        // Use originalUrl (full path) — req.path is mount-relative inside sub-routers,
        // so a sub-router API route would otherwise be misclassified as a page request.
        const isApiRequest = req.originalUrl.startsWith('/api/');
        
        if (isApiRequest) {
            res.status(401).json({ success: false, message: 'Authentication required' });
        } else {
            // Store the original URL to redirect back after authentication
            req.session.returnTo = req.originalUrl;
            res.redirect('/auth/github');
        }
    }
};


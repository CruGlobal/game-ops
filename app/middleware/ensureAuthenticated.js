import fetch from 'node-fetch';

export const ensureAuthenticated = async (req, res, next) => {
    // In tests, bypass external auth checks to keep integration tests deterministic
    if (process.env.NODE_ENV === 'test') {
        return next();
    }

    const isAuth = typeof req.isAuthenticated === 'function' ? req.isAuthenticated() : false;
    if (isAuth) {
        const token = process.env.GITHUB_TOKEN;
        const org = process.env.GITHUB_ORG; // Read GitHub organization from environment variable
        const teamSlug = process.env.DEVOPS_TEAM_SLUG || 'devops-engineering-team'; // Use DEVOPS_TEAM_SLUG for consistency

        try {
            const response = await fetch(`https://api.github.com/orgs/${org}/teams/${teamSlug}/memberships/${req.user.username}`, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.ok) {
                const membership = await response.json();
                if (membership.state === 'active') {
                    return next();
                }
            } else {
                console.error('GitHub API responded with status:', response.status); // Log response status
            }
            res.status(403).send('Forbidden: You are not a member of the required GitHub group');
        } catch (error) {
            console.error('Error checking GitHub group membership:', error);
            res.status(500).send('Internal Server Error');
        }
    } else {
        // Check if this is an API request or page request
        const isApiRequest = req.path.startsWith('/api/');
        
        if (isApiRequest) {
            // For API routes, respond with 401 JSON
            res.status(401).json({ success: false, message: 'Unauthorized' });
        } else {
            // For page routes, redirect to GitHub OAuth
            res.redirect('/auth/github');
        }
    }
};
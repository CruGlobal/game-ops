import fetch from 'node-fetch';

export const ensureAuthenticated = async (req, res, next) => {
    if (req.isAuthenticated()) {
        const token = process.env.GITHUB_TOKEN;
        const org = process.env.GITHUB_ORG; // Read GitHub organization from environment variable
        const teamSlug = process.env.GITHUB_TEAM_SLUG; // Read GitHub team slug from environment variable

        console.log('Using token:', token); // Log the token for debugging

        try {
            const response = await fetch(`https://api.github.com/orgs/${org}/teams/${teamSlug}/memberships/${req.user.username}`, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.ok) {
                const membership = await response.json();
                console.log('Membership state:', membership.state); // Log membership state
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
        res.redirect('/auth/github');
    }
};
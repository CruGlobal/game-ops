// config/passport.js
import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { prisma } from '../lib/prisma.js';

passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: 'http://localhost:3000/auth/github/callback'
},
async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await prisma.user.findUnique({
            where: { githubId: profile.id }
        });
        if (!user) {
            user = await prisma.user.create({
                data: {
                    githubId: profile.id,
                    username: profile.username
                }
            });
        }
        return done(null, user);
    } catch (err) {
        return done(err);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id }
        });

        // Also fetch DevOps status from Contributor table if available
        if (user) {
            const contributor = await prisma.contributor.findUnique({
                where: { username: user.username },
                select: { isDevOps: true }
            });
            user.isDevOps = contributor?.isDevOps || false;
        }

        done(null, user);
    } catch (err) {
        done(err);
    }
});

export default passport;
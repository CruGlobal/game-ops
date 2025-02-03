import Contributor from '../models/contributor.js';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

export const adminLogin = (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        res.status(200).send('Login successful');
    } else {
        res.status(401).send('Invalid password');
    }
};

export const resetContributor = async (req, res) => {
    const { username } = req.body;
    try {
        const contributor = await Contributor.findOne({ username });
        if (!contributor) {
            return res.status(404).send('Contributor not found');
        }
        contributor.firstPrAwarded = false;
        contributor.firstReviewAwarded = false;
        contributor.first10PrsAwarded = false;
        contributor.first10ReviewsAwarded = false;
        contributor.first50PrsAwarded = false;
        contributor.first50ReviewsAwarded = false;
        contributor.first100PrsAwarded = false;
        contributor.first100ReviewsAwarded = false;
        contributor.first500PrsAwarded = false;
        contributor.first500ReviewsAwarded = false;
        contributor.first1000PrsAwarded = false;
        contributor.first1000ReviewsAwarded = false;
        contributor.badges = [];
        await contributor.save();
        res.status(200).send('Contributor reset successfully');
    } catch (err) {
        res.status(500).send('Error resetting contributor');
    }
};
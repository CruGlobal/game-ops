# github-pr-scoreboard

Pull Request Scoreboard application. It includes:
1.	Backend Implementation:
•	Uses Express.js for server setup.
•	Uses MongoDB for storing contributor data.
•	Employs the Octokit library to interact with GitHub APIs.
2.	Features:
•	Tracks PR and review counts.
•	Awards badges for every 20 PRs with a GitHub comment.
•	Provides endpoints to view top contributors and reviewers.
3.	Automation:
•	Fetches pull requests daily and updates contributor data.
•	Scheduled task using node-cron.
4.	Deployment:
•	Includes a Dockerfile to simplify containerized deployment.
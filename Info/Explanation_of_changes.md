### New Structure and Changes

The new structure and changes to the GitHub PR Scoreboard application follow best practices and improve security in several ways. Here is a detailed explanation:

#### 1. Folder Structure

The new folder structure organizes the code into logical components, making it easier to manage and maintain:

```
/app
  /config
    db-config.js
  /controllers
    contributorController.js
  /models
    contributor.js
  /routes
    contributorRoutes.js
  /services
    contributorService.js
  /public
    index.html
    scripts.js
  .env
  docker-compose.yml
  Dockerfile
  github-pr-scoreboard.js
  package.json
```

- **`config`**: Contains configuration files, such as database configuration.
- **`controllers`**: Contains controller files that handle HTTP requests and responses.
- **`models`**: Contains database models.
- **`routes`**: Contains route definitions.
- **`services`**: Contains business logic and service functions.
- **`public`**: Contains static files like HTML and JavaScript.

This structure separates concerns, making the code more modular and easier to understand.

#### 2. Security Best Practices

Several security best practices have been implemented:

- **Environment Variables**: Sensitive data, such as database credentials and API keys, are stored in environment variables. This prevents hardcoding sensitive information in the source code.

```javascript
import dotenv from 'dotenv';
dotenv.config();
```

- **Helmet**: Helmet is used to secure HTTP headers, protecting the app from common web vulnerabilities.

```javascript
import helmet from 'helmet';
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https://github.com", "https://avatars.githubusercontent.com"]
        }
    }
}));
```

- **Rate Limiting**: Express-rate-limit is used to limit repeated requests to public APIs, preventing abuse.

```javascript
import rateLimit from 'express-rate-limit';
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
});
app.use(limiter);
```

- **Input Sanitization**: Express-mongo-sanitize is used to sanitize user inputs, preventing MongoDB injection attacks.

```javascript
import mongoSanitize from 'express-mongo-sanitize';
app.use(mongoSanitize());
```

- **CORS**: CORS is configured to control resource sharing between different origins, enhancing security.

```javascript
import cors from 'cors';
app.use(cors());
```

#### 3. Code Refactoring

The code has been refactored to separate concerns, making it more modular and easier to maintain:

- **Controllers**: Handle HTTP requests and responses.

```javascript
import { fetchPullRequests, awardBadges, getTopContributors, getTopReviewers } from '../services/contributorService.js';

export const fetchPRs = async (req, res) => {
    try {
        await fetchPullRequests();
        res.status(200).send('Pull requests fetched and data updated.');
    } catch (err) {
        res.status(500).send('Error fetching pull requests.');
    }
};
```

- **Services**: Contain business logic and interact with external APIs and databases.

```javascript
import { Octokit } from '@octokit/rest';
import dbClient from '../config/db-config.js';
import Contributor from '../models/contributor.js';
import mongoSanitize from 'express-mongo-sanitize';
import fetch from 'node-fetch';

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
    request: {
        fetch: fetch
    }
});

export const fetchPullRequests = async () => {
    try {
        const { data: pullRequests } = await octokit.rest.pulls.list({
            owner: process.env.REPO_OWNER,
            repo: process.env.REPO_NAME,
            state: 'all',
            per_page: 100,
        });

        for (const pr of pullRequests) {
            await updateContributor(pr.user.login, 'prCount');
            if (pr.reviews) {
                for (const review of pr.reviews) {
                    await updateContributor(review.user.login, 'reviewCount');
                }
            }
        }
    } catch (err) {
        console.error('Error fetching pull requests', err);
    }
};
```

- **Routes**: Define API endpoints and map them to controller functions.

```javascript
import express from 'express';
import { fetchPRs, awardContributorBadges, topContributors, topReviewers } from '../controllers/contributorController.js';

const router = express.Router();

router.get('/fetch-pull-requests', fetchPRs);
router.get('/award-badges', awardContributorBadges);
router.get('/top-contributors', topContributors);
router.get('/top-reviewers', topReviewers);

export default router;
```

#### 4. Docker and Deployment

The Dockerfile and docker-compose.yml file simplify containerized deployment, ensuring consistency across different environments.

- **Dockerfile**: Defines the Docker image for the application.

```dockerfile
FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

- **docker-compose.yml**: Defines the services and their configurations.

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      MONGO_URI: mongodb://mongo:27017/github-scoreboard
    env_file:
      - .env
    depends_on:
      - mongo

  mongo:
    image: mongo:6.0
    container_name: mongodb
    restart: always
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db

  mongo-express:
    image: mongo-express:1.0.0
    container_name: mongo-express
    restart: always
    ports:
      - "8081:8081"
    environment:
      ME_CONFIG_MONGODB_SERVER: mongo
      ME_CONFIG_MONGODB_PORT: 27017
      ME_CONFIG_BASICAUTH_USERNAME: admin
      ME_CONFIG_BASICAUTH_PASSWORD: admin

volumes:
  mongo_data:
    driver: local
```

### Summary

By following these best practices and implementing these changes, the application is now more secure, modular, and maintainable. The new structure separates concerns, making the code easier to understand and manage. Security measures like environment variables, Helmet, rate limiting, input sanitization, and CORS enhance the application's security. Docker and Docker Compose simplify deployment, ensuring consistency across different environments.
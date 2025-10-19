# Deployment Guide

Complete guide for deploying the GitHub PR Scoreboard to various environments.

---

## Table of Contents
- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Local Development](#local-development)
- [Docker Deployment](#docker-deployment)
- [Production Deployment](#production-deployment)
  - [AWS](#aws-deployment)
  - [Heroku](#heroku-deployment)
  - [DigitalOcean](#digitalocean-deployment)
- [Database Setup](#database-setup)
- [Monitoring & Logging](#monitoring--logging)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software
- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **MongoDB** >= 5.0 (development) or AWS DynamoDB (production)
- **Docker** >= 20.10 (optional, recommended)
- **Git** >= 2.30

### Required Accounts
- **GitHub Account** with admin access to target repository
- **GitHub Personal Access Token** with `repo` scope
- **MongoDB Atlas Account** (for cloud database) or local MongoDB
- **AWS Account** (optional, for production with DynamoDB)

---

## Environment Setup

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/github-pr-scoreboard.git
cd github-pr-scoreboard
```

### 2. Install Dependencies

```bash
cd app
npm install
```

### 3. Configure Environment Variables

Create `.env` file in the `app/` directory:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Required Variables
GITHUB_TOKEN=<your-github-token>
MONGO_URI=mongodb://localhost:27017/scoreboard
SESSION_SECRET=<generate-random-secret>
NODE_ENV=development

# Optional Variables
PORT=3000
GITHUB_CLIENT_ID=<your-oauth-client-id>
GITHUB_CLIENT_SECRET=<your-oauth-client-secret>
GITHUB_CALLBACK_URL=http://localhost:3000/auth/github/callback

# Organization/Repository Settings
GITHUB_ORG=your-org-name
GITHUB_REPO=your-repo-name

# Feature Flags (optional)
ENABLE_CHALLENGES=true
ENABLE_STREAKS=true
ENABLE_POINTS=true
CHALLENGE_AUTO_CREATE=true
CHALLENGE_DURATION_DAYS=7
```

### 4. Generate Session Secret

```bash
# Generate a secure random string
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use this value for `SESSION_SECRET`.

---

## Local Development

### Using Node.js Directly

```bash
cd app
npm install
npm start
```

Application runs at `http://localhost:3000`

### Using Docker Compose (Recommended)

```bash
# Build and start all services
docker-compose up --build

# Run in detached mode
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

**Services Available:**
- **Application:** `http://localhost:3000`
- **MongoDB:** `mongodb://localhost:27017`
- **Mongo Express:** `http://localhost:8081` (admin/admin)

### Development Mode with Hot Reload

```bash
cd app
npm run dev  # Uses nodemon for auto-restart
```

---

## Docker Deployment

### Build Docker Image

```bash
docker build -t github-pr-scoreboard:latest .
```

### Run Container

```bash
docker run -d \
  --name pr-scoreboard \
  -p 3000:3000 \
  -e GITHUB_TOKEN=<your-token> \
  -e MONGO_URI=mongodb://host.docker.internal:27017/scoreboard \
  -e SESSION_SECRET=<your-secret> \
  -e NODE_ENV=production \
  github-pr-scoreboard:latest
```

### Using Docker Compose for Production

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      GITHUB_TOKEN: ${GITHUB_TOKEN}
      MONGO_URI: mongodb://mongodb:27017/scoreboard
      SESSION_SECRET: ${SESSION_SECRET}
    depends_on:
      - mongodb
    restart: unless-stopped

  mongodb:
    image: mongo:5
    volumes:
      - mongodb_data:/data/db
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - app
    restart: unless-stopped

volumes:
  mongodb_data:
```

Deploy:

```bash
docker-compose -f docker-compose.prod.yml up -d
```

---

## Production Deployment

### AWS Deployment

#### Option 1: AWS ECS (Elastic Container Service)

**1. Create ECR Repository**

```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Create repository
aws ecr create-repository --repository-name github-pr-scoreboard --region us-east-1

# Build and push image
docker build -t github-pr-scoreboard .
docker tag github-pr-scoreboard:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/github-pr-scoreboard:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/github-pr-scoreboard:latest
```

**2. Create ECS Task Definition**

```json
{
  "family": "pr-scoreboard",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "containerDefinitions": [
    {
      "name": "pr-scoreboard",
      "image": "<account-id>.dkr.ecr.us-east-1.amazonaws.com/github-pr-scoreboard:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        }
      ],
      "secrets": [
        {
          "name": "GITHUB_TOKEN",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:<account-id>:secret:github-token"
        },
        {
          "name": "SESSION_SECRET",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:<account-id>:secret:session-secret"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/pr-scoreboard",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

**3. Create ECS Service**

```bash
aws ecs create-service \
  --cluster pr-scoreboard-cluster \
  --service-name pr-scoreboard \
  --task-definition pr-scoreboard \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}"
```

#### Option 2: AWS EC2

**1. Launch EC2 Instance**

```bash
# Use Amazon Linux 2 AMI
# Instance type: t3.medium (recommended)
# Security Group: Allow ports 80, 443, 3000, 22
```

**2. SSH into Instance**

```bash
ssh -i your-key.pem ec2-user@your-instance-ip
```

**3. Install Dependencies**

```bash
# Install Node.js
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs git

# Install Docker
sudo yum install -y docker
sudo service docker start
sudo usermod -a -G docker ec2-user
```

**4. Clone and Deploy**

```bash
git clone https://github.com/yourusername/github-pr-scoreboard.git
cd github-pr-scoreboard

# Set environment variables
sudo nano /etc/environment

# Start with Docker Compose
docker-compose -f docker-compose.prod.yml up -d
```

**5. Configure Nginx**

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**6. Setup SSL with Let's Encrypt**

```bash
sudo yum install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

### Heroku Deployment

**1. Install Heroku CLI**

```bash
curl https://cli-assets.heroku.com/install.sh | sh
heroku login
```

**2. Create Heroku App**

```bash
heroku create your-app-name
```

**3. Add MongoDB Add-on**

```bash
heroku addons:create mongolab:sandbox
```

**4. Set Environment Variables**

```bash
heroku config:set GITHUB_TOKEN=your_token
heroku config:set SESSION_SECRET=$(openssl rand -hex 32)
heroku config:set NODE_ENV=production
heroku config:set GITHUB_ORG=your-org
heroku config:set GITHUB_REPO=your-repo
```

**5. Create Procfile**

```bash
echo "web: cd app && npm start" > Procfile
```

**6. Deploy**

```bash
git add .
git commit -m "Configure for Heroku"
git push heroku main

# Open app
heroku open
```

**7. Scale Dynos**

```bash
heroku ps:scale web=1
```

---

### DigitalOcean Deployment

**1. Create Droplet**

- Choose Ubuntu 22.04 LTS
- Select plan (minimum: 2GB RAM, 2 vCPUs)
- Add SSH key
- Enable monitoring

**2. Initial Server Setup**

```bash
# SSH into droplet
ssh root@your-droplet-ip

# Update packages
apt update && apt upgrade -y

# Create non-root user
adduser deployuser
usermod -aG sudo deployuser
su - deployuser
```

**3. Install Dependencies**

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

**4. Clone and Deploy**

```bash
git clone https://github.com/yourusername/github-pr-scoreboard.git
cd github-pr-scoreboard
```

**5. Configure Environment**

```bash
cd app
nano .env
# Add your environment variables
```

**6. Setup Process Manager (PM2)**

```bash
sudo npm install -g pm2

# Start application
cd app
pm2 start scoreboard.js --name pr-scoreboard

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

**7. Configure Firewall**

```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

**8. Setup Nginx Reverse Proxy**

```bash
sudo apt install -y nginx

sudo nano /etc/nginx/sites-available/pr-scoreboard
```

Add configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/pr-scoreboard /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

**9. Setup SSL**

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## Database Setup

### MongoDB Atlas (Cloud)

**1. Create Account and Cluster**

- Visit [mongodb.com/cloud/atlas](https://mongodb.com/cloud/atlas)
- Create free tier cluster
- Create database user
- Whitelist IP addresses (0.0.0.0/0 for all IPs in production use your server IP)

**2. Get Connection String**

```
mongodb+srv://<your-username>:<your-password>@cluster.mongodb.net/scoreboard?retryWrites=true&w=majority
```

**3. Update Environment Variable**

```env
MONGO_URI=mongodb+srv://<your-username>:<your-password>@cluster.mongodb.net/scoreboard?retryWrites=true&w=majority
```

### Local MongoDB

**Docker:**

```bash
docker run -d \
  --name mongodb \
  -p 27017:27017 \
  -v mongodb_data:/data/db \
  mongo:5
```

**Native Installation (Ubuntu):**

```bash
wget -qO - https://www.mongodb.org/static/pgp/server-5.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/5.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-5.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod
```

### DynamoDB (Production Option)

**Update `app/config/db-config.js` to use DynamoDB:**

```javascript
if (process.env.NODE_ENV === 'production') {
  // Use DynamoDB
  const dynamodb = new AWS.DynamoDB.DocumentClient({
    region: process.env.AWS_REGION
  });
}
```

**Set AWS credentials:**

```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
```

---

## Monitoring & Logging

### PM2 Monitoring

```bash
# View logs
pm2 logs pr-scoreboard

# Monitor resources
pm2 monit

# View process info
pm2 info pr-scoreboard

# View dashboard
pm2 plus
```

### Application Logs

Logs are stored in:
- Development: Console output
- Production: `/var/log/pr-scoreboard/` (configure in logger.js)

### Health Check Endpoint

Add to your application:

```javascript
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});
```

### Monitoring Services

**New Relic:**

```bash
npm install newrelic
```

Add to `scoreboard.js`:

```javascript
require('newrelic');
```

**DataDog:**

```bash
npm install dd-trace --save
```

**Sentry (Error Tracking):**

```bash
npm install @sentry/node
```

---

## Troubleshooting

### Common Issues

**1. Port Already in Use**

```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>
```

**2. MongoDB Connection Failed**

```bash
# Check MongoDB status
systemctl status mongod

# View MongoDB logs
tail -f /var/log/mongodb/mongod.log

# Test connection
mongosh "mongodb://localhost:27017/scoreboard"
```

**3. WebSocket Connection Issues**

- Check firewall rules allow WebSocket connections
- Verify CORS configuration
- Check Nginx/proxy WebSocket support

**4. Memory Issues**

```bash
# Increase Node.js memory
NODE_OPTIONS="--max-old-space-size=4096" npm start
```

**5. Permission Denied**

```bash
# Fix file permissions
sudo chown -R $USER:$USER /path/to/app
chmod -R 755 /path/to/app
```

### Logs Location

- **Application logs:** `/var/log/pr-scoreboard/`
- **Nginx logs:** `/var/log/nginx/`
- **PM2 logs:** `~/.pm2/logs/`
- **MongoDB logs:** `/var/log/mongodb/`

### Performance Optimization

**1. Enable Compression**

```javascript
import compression from 'compression';
app.use(compression());
```

**2. Database Indexing**

```javascript
// Add indexes to MongoDB
db.contributors.createIndex({ username: 1 });
db.contributors.createIndex({ totalPoints: -1 });
db.contributors.createIndex({ currentStreak: -1 });
db.challenges.createIndex({ status: 1, endDate: 1 });
```

**3. Caching**

```javascript
import redis from 'redis';
const client = redis.createClient();

// Cache leaderboard for 5 minutes
app.get('/api/contributors', async (req, res) => {
  const cached = await client.get('leaderboard');
  if (cached) return res.json(JSON.parse(cached));

  const data = await getContributors();
  await client.setEx('leaderboard', 300, JSON.stringify(data));
  res.json(data);
});
```

---

## Backup & Recovery

### Database Backup

**MongoDB:**

```bash
# Backup
mongodump --uri="mongodb://localhost:27017/scoreboard" --out=/backup/$(date +%Y%m%d)

# Restore
mongorestore --uri="mongodb://localhost:27017/scoreboard" /backup/20251015
```

**Automated Backup Script:**

```bash
#!/bin/bash
BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mongodump --uri="$MONGO_URI" --out="$BACKUP_DIR/$DATE"

# Keep only last 7 days
find $BACKUP_DIR -type d -mtime +7 -exec rm -rf {} \;
```

Add to crontab:

```bash
0 2 * * * /path/to/backup-script.sh
```

---

## CI/CD Setup

### GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'

    - name: Install dependencies
      run: cd app && npm ci

    - name: Run tests
      run: cd app && npm test

    - name: Build Docker image
      run: docker build -t pr-scoreboard .

    - name: Deploy to production
      run: |
        # Add your deployment commands here
```

---

## Security Checklist

- [ ] Environment variables are not committed to git
- [ ] `.env` file is in `.gitignore`
- [ ] SESSION_SECRET is randomly generated
- [ ] HTTPS is enabled with valid SSL certificate
- [ ] Firewall rules are configured
- [ ] MongoDB is not publicly accessible
- [ ] Rate limiting is enabled
- [ ] CSP headers are configured
- [ ] Regular security updates are applied
- [ ] Logs don't contain sensitive data
- [ ] GitHub token has minimal required permissions

---

## Support

For deployment issues:
- **Documentation:** [CLAUDE.md](../CLAUDE.md)
- **GitHub Issues:** [github.com/yourusername/github-pr-scoreboard/issues](https://github.com/yourusername/github-pr-scoreboard/issues)

---

**Last Updated:** October 2025

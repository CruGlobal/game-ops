# Dockerfile Documentation

This document provides a detailed explanation of the multi-stage Dockerfile used for AWS ECS deployment of the Game Ops application.

## Table of Contents
- [Overview](#overview)
- [Multi-Stage Build Strategy](#multi-stage-build-strategy)
- [Builder Stage (Lines 1-20)](#builder-stage-lines-1-20)
- [Production Stage (Lines 22-62)](#production-stage-lines-22-62)
- [Critical Copy Operations (Lines 39-54)](#critical-copy-operations-lines-39-54)
- [Why This Pattern?](#why-this-pattern)
- [Size Optimization](#size-optimization)
- [Build and Run](#build-and-run)

---

## Overview

The Dockerfile implements a **two-stage build pattern** optimized for production deployment:

1. **Builder Stage**: Heavy build environment with all dependencies
2. **Production Stage**: Minimal runtime environment with only production dependencies

This approach reduces the final image size by ~70% while maintaining all required functionality.

---

## Multi-Stage Build Strategy

```
BUILD CONTEXT (host machine)
    ↓
┌─────────────────────────────────┐
│  BUILDER STAGE                  │
│  • Install ALL dependencies     │
│  • Copy all application code    │
│  • Generate Prisma Client       │
│  • Size: ~500MB                 │
└─────────────────────────────────┘
    ↓ (copy artifacts only)
┌─────────────────────────────────┐
│  PRODUCTION STAGE               │
│  • Install prod deps only       │
│  • Copy Prisma from builder     │
│  • Copy app code from builder   │
│  • Size: ~150MB                 │
└─────────────────────────────────┘
    ↓
FINAL IMAGE (pushed to ECR)
```

---

## Builder Stage (Lines 1-20)

### Line 1-2: Build Arguments
```dockerfile
ARG NODE_VERSION
```
- Declares `NODE_VERSION` as a build-time variable
- Set by `build.sh` script which reads from `.tool-versions`
- Example value: `23.9.0`

### Line 3: Base Image
```dockerfile
FROM public.ecr.aws/docker/library/node:${NODE_VERSION}-alpine as builder
```
- Uses Node.js Alpine Linux image from **AWS ECR Public Registry**
- `${NODE_VERSION}` - Injects version from build argument
- `-alpine` - Minimal Linux distribution (~5MB base vs ~900MB Ubuntu)
- `as builder` - Names this stage "builder" for later reference

**Why AWS ECR Public?**
- Better performance in AWS environments
- Mirrors Docker Hub official images
- Faster pulls from within AWS

### Line 6: Install OpenSSL
```dockerfile
RUN apk add --no-cache openssl
```
- `apk` - Alpine Linux package manager
- `openssl` - Required by Prisma for database connections and encryption
- `--no-cache` - Don't save package index (~1MB savings)

**Why OpenSSL is needed:**
- Prisma Query Engine uses OpenSSL for secure database connections
- Required for PostgreSQL SSL/TLS connections
- Runtime dependency (not just build-time)

### Line 8: Working Directory
```dockerfile
WORKDIR /usr/src/app
```
- Sets working directory for all subsequent commands
- `/usr/src/app` is the standard convention for ECS/AWS deployments
- All relative paths resolve from this directory

### Line 11: Copy Package Files First
```dockerfile
COPY app/package.json app/package-lock.json ./
```
- Copies **only** dependency manifests initially
- Source: `app/package.json` and `app/package-lock.json` from build context
- Destination: `/usr/src/app/` (current WORKDIR)

**Docker Layer Caching Optimization:**
- Package files change less frequently than source code
- If these files haven't changed, Docker reuses the cached `npm ci` layer
- Significantly speeds up rebuilds when only code changes

### Line 14: Install All Dependencies
```dockerfile
RUN npm ci
```
- `npm ci` - Clean install using exact versions from `package-lock.json`
- Installs **both** production AND development dependencies
- Development dependencies needed for:
  - Prisma CLI (`prisma` package)
  - TypeScript compilation (if applicable)
  - Build tools and scripts

**Why `npm ci` instead of `npm install`?**
- Faster (10-20x for large projects)
- Deterministic (uses lockfile exactly)
- Deletes `node_modules/` first (clean slate)
- Fails if `package.json` and `package-lock.json` are out of sync

### Line 17: Copy Application Code
```dockerfile
COPY app ./
```
- Copies entire `app/` directory contents to `/usr/src/app/`
- Includes all source code, configuration, views, public assets
- Overwrites `package.json` and `package-lock.json` (but with same content)

**What gets copied:**
```
app/
├── server.js
├── config/
├── controllers/
├── middleware/
├── models/
├── routes/
├── services/
├── utils/
├── views/
├── public/
├── prisma/
├── __tests__/
└── scripts/
```

### Line 20: Generate Prisma Client
```dockerfile
RUN npx prisma generate
```
- Executes Prisma's code generation based on `prisma/schema.prisma`
- Creates type-safe database client in `node_modules/.prisma/client/`
- Generates platform-specific query engine binary

**Output location:**
```
node_modules/
├── .prisma/
│   └── client/
│       ├── index.js          (Generated client API)
│       ├── index.d.ts        (TypeScript definitions)
│       ├── libquery_engine-linux-musl.so.node  (Query engine binary)
│       └── schema.prisma     (Schema copy)
└── @prisma/
    └── client/               (Runtime package)
```

**Why in builder stage:**
- Requires `prisma` CLI (devDependency)
- Production stage won't have devDependencies
- Generated client will be copied to production stage

---

## Production Stage (Lines 22-62)

### Line 23-24: Fresh Base Image
```dockerfile
ARG NODE_VERSION
FROM public.ecr.aws/docker/library/node:${NODE_VERSION}-alpine
```
- **Starts completely fresh** - No files or layers from builder stage
- Must re-declare `NODE_VERSION` (ARG scope doesn't cross stages)
- No `as` name - This becomes the final image
- Same Alpine base as builder for consistency

### Line 27: Install OpenSSL for Production
```dockerfile
RUN apk add --no-cache openssl
```
- Production runtime also needs OpenSSL for Prisma
- Must install again (fresh image has nothing from builder)
- Same version as builder (same Alpine base ensures this)

### Line 29: Set Production Environment
```dockerfile
ENV NODE_ENV="production"
```
- Sets environment variable for runtime
- Effects:
  - Express.js enables optimizations (caching, minified error messages)
  - npm commands respect production mode
  - Application code can check `process.env.NODE_ENV`

### Line 31: Working Directory
```dockerfile
WORKDIR /usr/src/app
```
- Same path as builder stage for consistency
- All subsequent COPY destinations are relative to this

### Line 34: Copy Package Files
```dockerfile
COPY app/package.json app/package-lock.json ./
```
- Copying from **build context** (host machine), not builder
- Needed for `npm ci` to know what to install

### Line 37: Install Production Dependencies Only
```dockerfile
RUN npm ci --production
```
- `--production` flag skips all devDependencies
- **Only installs packages listed in `dependencies` section**
- Much smaller `node_modules/` directory

**What gets skipped:**
```json
{
  "devDependencies": {
    "prisma": "^6.17.1",        // ← NOT installed
    "jest": "^29.7.0",           // ← NOT installed
    "@types/node": "^24.9.0",    // ← NOT installed
    "eslint": "^8.57.0",         // ← NOT installed
    "nodemon": "^3.0.2"          // ← NOT installed
  }
}
```

**Critical note:**
- Prisma Client is NOT generated here (no `prisma` CLI)
- We must copy the pre-generated client from builder

---

## Critical Copy Operations (Lines 39-54)

### Line 40: Copy Prisma Schema
```dockerfile
COPY --from=builder /usr/src/app/prisma ./prisma
```

**What it does:**
- `--from=builder` - Copy from the "builder" stage (not host machine)
- Source: `/usr/src/app/prisma/` in builder container
- Destination: `/usr/src/app/prisma/` in production container

**Why it's needed:**
- Contains `schema.prisma` - Prisma's data model definition
- Contains `migrations/` - Database migration history
- Prisma Client references schema at runtime for certain operations
- Required for running migrations in production

**Directory structure:**
```
prisma/
├── schema.prisma              # Database schema definition
└── migrations/
    └── 20251020202950_init/
        └── migration.sql      # SQL migration file
```

### Line 41: Copy Generated Prisma Client
```dockerfile
COPY --from=builder /usr/src/app/node_modules/.prisma ./node_modules/.prisma
```

**What it does:**
- Copies the **generated** Prisma Client from builder stage

**Why it's critical:**
- `npm ci --production` doesn't install `prisma` CLI (devDependency)
- Production stage cannot run `npx prisma generate`
- We must copy the **pre-generated** client from builder

**What's inside `.prisma/client/`:**
```
node_modules/.prisma/client/
├── index.js              # Generated TypeScript/JavaScript API
├── index.d.ts            # Type definitions for TypeScript
├── libquery_engine-linux-musl.so.node  # Native query engine binary
├── schema.prisma         # Schema copy (for runtime reference)
└── package.json          # Package metadata
```

**This is what you import in code:**
```javascript
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
```

### Line 42: Copy @prisma/client Runtime Package
```dockerfile
COPY --from=builder /usr/src/app/node_modules/@prisma ./node_modules/@prisma
```

**What it does:**
- Copies the `@prisma/client` npm package (runtime loader)

**Why copy from builder instead of relying on npm ci?**
- `@prisma/client` IS in production dependencies
- `npm ci --production` DOES install it
- **BUT** we copy from builder to ensure exact version match with generated client
- Prevents version mismatches between loader and generated code

**Package relationship:**
```
Your Code
    ↓ imports
@prisma/client (runtime loader package)  ← Line 42 copies this
    ↓ loads
.prisma/client (generated client code)   ← Line 41 copies this
    ↓ uses
libquery_engine-*.node (native binary)   ← Inside .prisma/client
```

**What's inside `@prisma/client/`:**
```
node_modules/@prisma/client/
├── package.json
├── index.js              # Main entry point
├── runtime/              # Runtime library code
│   ├── library.js        # Query engine integration
│   └── binary.js         # Binary engine integration
└── generator-build/      # Generator utilities
```

### Line 45: Copy Root JavaScript Files
```dockerfile
COPY --from=builder /usr/src/app/*.js ./
```

**What it does:**
- Copies all `.js` files from root of `/usr/src/app/` (not subdirectories)
- Pattern `*.js` matches: `server.js`, configuration files, etc.

**Why from builder instead of host:**
- Could copy from host, but copying from builder ensures consistency
- If you had a build step (e.g., TypeScript → JavaScript), compiled output would be in builder
- Guarantees production uses exact same files that were built/tested

**Files typically copied:**
```
server.js              # Main application entry point
```

### Lines 46-54: Copy Application Directories
```dockerfile
COPY --from=builder /usr/src/app/config ./config
COPY --from=builder /usr/src/app/controllers ./controllers
COPY --from=builder /usr/src/app/middleware ./middleware
COPY --from=builder /usr/src/app/models ./models
COPY --from=builder /usr/src/app/routes ./routes
COPY --from=builder /usr/src/app/services ./services
COPY --from=builder /usr/src/app/utils ./utils
COPY --from=builder /usr/src/app/views ./views
COPY --from=builder /usr/src/app/public ./public
```

**What it does:**
- Copies each application directory individually and recursively
- Each COPY command is a separate Docker layer

**Why individual COPY commands instead of `COPY app ./`?**

1. **Explicit control** - Clear about what goes into production
2. **Security** - Excludes sensitive/unnecessary files:
   - `__tests__/` - Test files
   - `scripts/` - Development scripts
   - `.env` - Environment secrets
   - `.git/` - Version control
   - `node_modules/` - Already installed separately

3. **Layer caching** - Can update one directory without invalidating others
4. **Principle of least privilege** - Only include what's needed

**Directory purposes:**
```
config/         → Application configuration (DB, passport, points)
controllers/    → Request handlers (business logic entry points)
middleware/     → Express middleware (auth, validation, error handling)
models/         → Data models (mostly legacy, using Prisma now)
routes/         → API route definitions
services/       → Business logic layer (core functionality)
utils/          → Helper functions (logger, socket emitter)
views/          → EJS templates (HTML rendering)
public/         → Static assets (CSS, JS, images)
```

**What's excluded:**
```
__tests__/      → Test suites (Jest tests)
scripts/        → Admin/migration scripts
backup/         → Legacy Mongoose code
docs/           → Documentation
.env            → Environment variables (set at runtime)
.git/           → Git repository data
node_modules/   → Installed separately
```

---

## Why This Pattern?

### The Prisma Problem

**Challenge:**
1. Production needs `@prisma/client` to run database queries
2. Prisma Client must be **generated** via `npx prisma generate`
3. `prisma generate` requires `prisma` CLI package
4. `prisma` CLI is a **devDependency** (build tool)
5. Production uses `npm ci --production` (excludes devDependencies)

**If we don't copy from builder:**
```dockerfile
# ❌ This would fail in production:
RUN npm ci --production    # Installs @prisma/client but NOT prisma CLI
RUN npx prisma generate    # ERROR: 'prisma' command not found
```

### The Multi-Stage Solution

**Builder Stage:**
```dockerfile
RUN npm ci                  # ✅ Installs prisma CLI (devDependency)
RUN npx prisma generate     # ✅ Generates client successfully
```

**Production Stage:**
```dockerfile
RUN npm ci --production            # ✅ Installs @prisma/client only
COPY --from=builder .prisma/       # ✅ Copy pre-generated client
COPY --from=builder @prisma/       # ✅ Copy runtime package
```

### Benefits Summary

| Aspect | Single-Stage | Multi-Stage |
|--------|--------------|-------------|
| **Image Size** | ~500MB | ~150MB |
| **Build Tools** | Included | Excluded |
| **Dev Dependencies** | Included | Excluded |
| **Test Files** | Included | Excluded |
| **Security Surface** | Large | Minimal |
| **Startup Time** | Slower | Faster |
| **Production Ready** | No | Yes |

---

## Size Optimization

### What Gets Excluded from Production

**Development Dependencies (~200MB):**
```json
{
  "devDependencies": {
    "prisma": "^6.17.1",           // ~50MB (CLI + engines)
    "jest": "^29.7.0",             // ~30MB (testing framework)
    "@types/node": "^24.9.0",      // ~5MB (TypeScript types)
    "eslint": "^8.57.0",           // ~20MB (linter)
    "nodemon": "^3.0.2",           // ~10MB (dev server)
    "prettier": "^3.1.1",          // ~5MB (formatter)
    "husky": "^8.0.3",             // ~2MB (git hooks)
    "lint-staged": "^15.2.0",      // ~3MB (pre-commit)
    "supertest": "^6.3.3",         // ~5MB (API testing)
    "socket.io-client": "^4.8.1"   // ~10MB (testing client)
  }
}
```

**Source Files (~50MB):**
```
__tests__/                    # ~5MB (test suites)
scripts/                      # ~2MB (admin scripts)
backup/                       # ~10MB (legacy code)
docs/                         # ~1MB (markdown docs)
*.test.js                     # ~3MB (inline tests)
```

**Build Artifacts (~50MB):**
```
node_modules/.cache/          # npm/Jest caches
.git/                         # Git history (if copied)
```

### Size Comparison

```
┌─────────────────────────────────────┐
│  Single-Stage Build                 │
│  ┌────────────────────────────────┐ │
│  │ Base Image         50 MB       │ │
│  │ Prod Dependencies  200 MB      │ │
│  │ Dev Dependencies   200 MB      │ │
│  │ Application Code   50 MB       │ │
│  │ Test Files         50 MB       │ │
│  └────────────────────────────────┘ │
│  Total: ~550 MB                     │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  Multi-Stage Build (Final Image)    │
│  ┌────────────────────────────────┐ │
│  │ Base Image         50 MB       │ │
│  │ Prod Dependencies  200 MB      │ │
│  │ Application Code   50 MB       │ │
│  │ Generated Client   10 MB       │ │
│  └────────────────────────────────┘ │
│  Total: ~150 MB                     │
└─────────────────────────────────────┘

Savings: 400 MB (73% reduction)
```

---

## Build and Run

### Building the Image

**Using build.sh (recommended):**
```bash
./build.sh
```

This script:
1. Reads Node.js version from `.tool-versions`
2. Runs `docker buildx build` with `NODE_VERSION` argument
3. Supports `DOCKER_ARGS` environment variable for additional flags

**Manual build:**
```bash
docker build \
  --build-arg NODE_VERSION=23.9.0 \
  -t game-ops:latest \
  .
```

**Build with specific platform:**
```bash
docker buildx build \
  --platform linux/amd64 \
  --build-arg NODE_VERSION=23.9.0 \
  -t game-ops:latest \
  .
```

### Running the Container

**Basic run:**
```bash
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/db" \
  -e GITHUB_TOKEN="ghp_xxxxx" \
  game-ops:latest
```

**With docker-compose:**
```bash
docker-compose up -d --build
```

### Inspecting the Image

**View image size:**
```bash
docker images game-ops:latest
```

**View image layers:**
```bash
docker history game-ops:latest
```

**Inspect image contents:**
```bash
docker run --rm -it game-ops:latest sh
ls -la
```

**Check Node.js version:**
```bash
docker run --rm game-ops:latest node --version
```

---

## Additional Configuration

### Line 57: DataDog Logging Label
```dockerfile
LABEL "com.datadoghq.ad.logs"='[{"source": "node", "service": "game-ops", "log_processing_rules": [{"type": "exclude_at_match", "name": "exclude_health_checks", "pattern": "/health"}]}]'
```

**Purpose:**
- Configures DataDog agent for automatic log collection
- Identifies logs as coming from Node.js service named "game-ops"
- Excludes health check endpoint logs (reduces noise)

**How it works:**
- DataDog agent reads Docker labels
- Auto-discovers and configures log collection
- Applies filtering rules

### Line 59: Expose Port
```dockerfile
EXPOSE 3000
```

**Purpose:**
- Documents that container listens on port 3000
- Does NOT actually publish the port (that's done at runtime)
- Metadata for documentation and orchestration tools

### Line 61: Start Command
```dockerfile
CMD ["npm", "start"]
```

**Purpose:**
- Default command when container starts
- Runs `npm start` which executes `node server.js` (from package.json)
- Can be overridden at runtime: `docker run game-ops node other-script.js`

**Why array syntax `["npm", "start"]` instead of string `"npm start"`?**
- Array form = exec form (preferred)
- String form = shell form (spawns `/bin/sh -c "npm start"`)
- Exec form:
  - npm receives signals directly (SIGTERM for graceful shutdown)
  - No shell overhead
  - More reliable in production

---

## Troubleshooting

### Build Fails at "npx prisma generate"

**Error:**
```
Error: Generator at prisma-client-js could not be installed
```

**Solution:**
- Ensure `prisma` is in `devDependencies`
- Check network connectivity (downloads query engine)
- Verify `prisma/schema.prisma` exists and is valid

### Runtime Error: "Cannot find module '@prisma/client'"

**Error:**
```
Error: Cannot find module '@prisma/client'
```

**Cause:**
- Prisma client not copied from builder
- Lines 41-42 missing or incorrect

**Solution:**
- Verify COPY commands for `.prisma` and `@prisma`
- Rebuild image

### Runtime Error: "Query engine binary not found"

**Error:**
```
Error: Query engine library for current platform "linux-musl" could not be found
```

**Cause:**
- Generated client is for wrong platform
- OpenSSL missing

**Solution:**
- Ensure builder and production use same Alpine base
- Verify OpenSSL is installed (line 27)
- Check `binaryTargets` in `schema.prisma`

### Image Size Too Large

**Symptom:**
- Production image > 300MB

**Common causes:**
- Copying unnecessary files (tests, docs)
- Not using multi-stage build properly
- Including devDependencies

**Solution:**
- Review COPY commands (lines 45-54)
- Use `.dockerignore` file
- Verify `npm ci --production` is used

---

## References

- [Docker Multi-Stage Builds](https://docs.docker.com/build/building/multi-stage/)
- [Prisma Deployment Guide](https://www.prisma.io/docs/guides/deployment/deployment-guides)
- [Node.js Docker Best Practices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)
- [Alpine Linux Package Management](https://wiki.alpinelinux.org/wiki/Alpine_Package_Keeper)

---

**Document Version:** 1.0
**Last Updated:** 2025-01-19
**Dockerfile Version:** Based on commit `c47b7b5`

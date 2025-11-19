# NODE_VERSION set by build.sh based on .tool-versions file
ARG NODE_VERSION
FROM public.ecr.aws/docker/library/node:${NODE_VERSION}-alpine as builder

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

WORKDIR /usr/src/app

# Copy package files
COPY app/package.json app/package-lock.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy application code
COPY app ./

# Generate Prisma Client
RUN npx prisma generate

# Production stage
ARG NODE_VERSION
FROM public.ecr.aws/docker/library/node:${NODE_VERSION}-alpine

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

ENV NODE_ENV="production"

WORKDIR /usr/src/app

# Copy package files
COPY app/package.json app/package-lock.json ./

# Install production dependencies only
RUN npm ci --production

# Copy Prisma schema and generated client from builder
COPY --from=builder /usr/src/app/prisma ./prisma
COPY --from=builder /usr/src/app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /usr/src/app/node_modules/@prisma ./node_modules/@prisma

# Copy application code from builder
COPY --from=builder /usr/src/app/*.js ./
COPY --from=builder /usr/src/app/config ./config
COPY --from=builder /usr/src/app/controllers ./controllers
COPY --from=builder /usr/src/app/lib ./lib
COPY --from=builder /usr/src/app/middleware ./middleware
COPY --from=builder /usr/src/app/routes ./routes
COPY --from=builder /usr/src/app/services ./services
COPY --from=builder /usr/src/app/utils ./utils
COPY --from=builder /usr/src/app/views ./views
COPY --from=builder /usr/src/app/public ./public

# Add DataDog label for log processing
LABEL "com.datadoghq.ad.logs"='[{"source": "node", "service": "game-ops", "log_processing_rules": [{"type": "exclude_at_match", "name": "exclude_health_checks", "pattern": "/health"}]}]'

EXPOSE 3000

CMD ["npm", "start"]

// lib/prisma.js
// Prisma Client singleton for the application with enhanced logging and monitoring

// Ensure environment variables from .env are loaded before Prisma reads them
import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { cpus } from 'os';
import logger from '../utils/logger.js';

const globalForPrisma = global;

// Configure Prisma logging levels based on environment
const logConfig = process.env.NODE_ENV === 'development' 
  ? ['query', 'info', 'warn', 'error']
  : ['warn', 'error'];

// Safety guard: never run tests against a production database by mistake
const dbUrl = process.env.DATABASE_URL || '';
if (process.env.NODE_ENV === 'test') {
  const looksLikeProd = /neon\.tech|aws|azure|gcp|render|railway|vercel|prod|production/i.test(dbUrl);
  if (!dbUrl || looksLikeProd) {
    // Throw early to avoid destructive operations against a real DB during tests
    throw new Error(
      'Refusing to run tests without a dedicated test DATABASE_URL. ' +
      'Set DATABASE_URL in app/.env.test to a safe test database.'
    );
  }
}

// Prisma 7 connects through a driver adapter rather than reading DATABASE_URL
// from the schema. That hands connection handling to node-pg, which does not
// share the Rust engine's defaults, so three things have to be set explicitly.

// 1. pg treats an empty connection string as "absent" and falls back to the
//    PG* environment defaults (localhost, the OS user). A missing
//    DATABASE_URL would therefore boot cleanly and fail every query at
//    request time, where the engine used to fail loudly up front.
if (!dbUrl) {
  throw new Error(
    'DATABASE_URL is not set — refusing to start. Prisma 7 connects through ' +
    'node-pg, which would otherwise silently fall back to a local database.'
  );
}

// 2. pg does not understand Prisma's `connection_limit` and `pool_timeout`
//    URL parameters, and its own defaults are max 10 with NO acquire
//    timeout — so a saturated pool would hang requests indefinitely instead
//    of raising. These restore what the engine did: cpus * 2 + 1
//    connections, and a 10s wait before giving up.
const poolMax = Number(process.env.DATABASE_POOL_MAX) || cpus().length * 2 + 1;

// 3. `?schema=` in the URL is honoured by the Prisma CLI but ignored by pg,
//    so push and runtime would disagree on anything but the default schema.
//    Pass it through explicitly to keep the two halves in step.
let urlSchema;
try {
  urlSchema = new URL(dbUrl).searchParams.get('schema') || undefined;
} catch {
  urlSchema = undefined;
}

export const prisma = globalForPrisma.prisma || new PrismaClient({
  adapter: new PrismaPg(
    {
      connectionString: dbUrl,
      max: poolMax,
      connectionTimeoutMillis: 10000,
    },
    urlSchema ? { schema: urlSchema } : undefined
  ),
  log: logConfig.map(level => ({
    emit: 'event',
    level
  })),
});

// Enhanced logging middleware for Prisma events
if (process.env.PRISMA_LOGGING === 'true') {
  prisma.$on('query', (e) => {
    logger.debug('Prisma Query', {
      query: e.query,
      params: e.params,
      duration: `${e.duration}ms`,
      target: e.target
    });
  });

  prisma.$on('info', (e) => {
    logger.info('Prisma Info', {
      message: e.message,
      target: e.target
    });
  });

  prisma.$on('warn', (e) => {
    logger.warn('Prisma Warning', {
      message: e.message,
      target: e.target
    });
  });

  prisma.$on('error', (e) => {
    logger.error('Prisma Error', {
      message: e.message,
      target: e.target
    });
  });
}

// Connection lifecycle logging
// $connect() no longer proves the database is reachable: with a driver
// adapter it resolves even when nothing is listening, so it would log a
// successful connection to a database that does not answer. Probe for real.
prisma.$queryRaw`SELECT 1`
  .then(() => {
    logger.info('Prisma connected to PostgreSQL database');
  })
  .catch((err) => {
    logger.error('Failed to connect to PostgreSQL database', {
      error: err.message,
      stack: err.stack
    });
  });

// Graceful shutdown handling
process.on('beforeExit', async () => {
  await prisma.$disconnect();
  logger.info('Prisma disconnected from PostgreSQL database');
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;

// lib/prisma.js
// Prisma Client singleton for the application with enhanced logging and monitoring

import { PrismaClient } from '@prisma/client';
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

export const prisma = globalForPrisma.prisma || new PrismaClient({
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
prisma.$connect()
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

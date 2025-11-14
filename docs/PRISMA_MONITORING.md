# Prisma Monitoring and Logging Guide

This document outlines the monitoring, logging, and performance optimization strategies for the Prisma-based PostgreSQL implementation.

## Table of Contents
- [Logging Configuration](#logging-configuration)
- [Query Monitoring](#query-monitoring)
- [Performance Optimization](#performance-optimization)
- [Error Handling](#error-handling)
- [Connection Pool Management](#connection-pool-management)
- [Metrics and Observability](#metrics-and-observability)

## Logging Configuration

### Environment Variables

```bash
# Enable detailed Prisma logging (development only)
PRISMA_LOGGING=true

# Set log level for application logger
LOG_LEVEL=debug  # Options: error, warn, info, debug

# Database connection URL
DATABASE_URL=postgresql://user:password@host:port/database
```

### Log Levels

Prisma supports the following log levels:
- **query**: SQL queries executed (includes parameters and duration)
- **info**: General informational messages
- **warn**: Warning messages (e.g., deprecated features)
- **error**: Error messages from the database

By default:
- **Development**: Logs `query`, `info`, `warn`, `error` when `PRISMA_LOGGING=true`
- **Production**: Logs only `warn` and `error` to minimize overhead

## Query Monitoring

### Slow Query Detection

Monitor query performance using the built-in duration logging:

```javascript
// Enable query logging
process.env.PRISMA_LOGGING = 'true';
process.env.LOG_LEVEL = 'debug';

// Queries will log with duration:
// [2024-01-15T10:30:45.123Z] DEBUG: Prisma Query {
//   query: 'SELECT ...',
//   duration: '45ms',
//   params: '[...]'
// }
```

### Query Performance Best Practices

1. **Use Select to Minimize Data Transfer**
   ```javascript
   // Bad: Fetches all fields
   const contributor = await prisma.contributor.findUnique({ where: { id } });
   
   // Good: Fetches only needed fields
   const contributor = await prisma.contributor.findUnique({
     where: { id },
     select: { username: true, points: true }
   });
   ```

2. **Batch Operations**
   ```javascript
   // Bad: N+1 queries
   for (const id of contributorIds) {
     await prisma.contributor.update({ where: { id }, data: { ... } });
   }
   
   // Good: Single batch update
   await prisma.contributor.updateMany({
     where: { id: { in: contributorIds } },
     data: { ... }
   });
   ```

3. **Use Transactions for Multi-Step Operations**
   ```javascript
   await prisma.$transaction(async (tx) => {
     const contributor = await tx.contributor.update({ ... });
     await tx.achievement.create({ ... });
     return contributor;
   });
   ```

## Performance Optimization

### Indexing

Our schema includes strategic indexes for frequently queried fields:

```prisma
// Contributor model indexes
@@index([username])           // Username lookups
@@index([githubId])          // GitHub ID lookups
@@index([points])            // Leaderboard sorting
@@index([currentStreak])     // Streak tracking

// Contribution model indexes
@@index([contributorId])     // Contributor relations
@@index([date])             // Date-based queries
@@index([type])             // Filter by type (PR/review)
```

### Connection Pool Tuning

Default Prisma connection pool settings:
```
Pool size: min=2, max=10 (calculated from DATABASE_URL or defaults)
Connection timeout: 10 seconds
```

For production, tune based on your workload:
```bash
# Add to DATABASE_URL connection string
DATABASE_URL="postgresql://user:password@host:port/db?connection_limit=20&pool_timeout=20"
```

### Query Optimization Tips

1. **Avoid N+1 Queries with Include**
   ```javascript
   // Bad: N+1 queries
   const contributors = await prisma.contributor.findMany();
   for (const c of contributors) {
     c.badges = await prisma.badge.findMany({ where: { contributorId: c.id } });
   }
   
   // Good: Single query with join
   const contributors = await prisma.contributor.findMany({
     include: { badges: true }
   });
   ```

2. **Use Pagination for Large Result Sets**
   ```javascript
   const contributors = await prisma.contributor.findMany({
     skip: (page - 1) * pageSize,
     take: pageSize,
     orderBy: { points: 'desc' }
   });
   ```

3. **Cursor-Based Pagination for Better Performance**
   ```javascript
   const contributors = await prisma.contributor.findMany({
     take: 20,
     cursor: lastCursor ? { id: lastCursor } : undefined,
     orderBy: { id: 'asc' }
   });
   ```

## Error Handling

### Prisma Error Types

The application handles these Prisma-specific errors:

1. **PrismaClientKnownRequestError**: Database constraint violations, unique key conflicts
   ```javascript
   if (err instanceof Prisma.PrismaClientKnownRequestError) {
     if (err.code === 'P2002') {
       // Unique constraint violation
       return res.status(409).json({ error: 'Record already exists' });
     }
   }
   ```

2. **PrismaClientValidationError**: Invalid query parameters
   ```javascript
   if (err instanceof Prisma.PrismaClientValidationError) {
     return res.status(400).json({ error: 'Invalid database operation' });
   }
   ```

3. **PrismaClientUnknownRequestError**: Unexpected database errors

### Common Error Codes

| Code | Description | Action |
|------|-------------|--------|
| P2002 | Unique constraint failed | Check for duplicates before insert |
| P2003 | Foreign key constraint failed | Verify related records exist |
| P2025 | Record not found | Handle missing data gracefully |
| P1001 | Can't reach database server | Check database connection |
| P1008 | Operations timed out | Optimize query or increase timeout |

## Connection Pool Management

### Monitoring Connection Usage

```javascript
// Get connection pool metrics (requires Prisma middleware)
prisma.$use(async (params, next) => {
  const before = Date.now();
  const result = await next(params);
  const after = Date.now();
  
  console.log(`Query ${params.model}.${params.action} took ${after - before}ms`);
  return result;
});
```

### Graceful Shutdown

The application automatically disconnects Prisma on shutdown:

```javascript
process.on('beforeExit', async () => {
  await prisma.$disconnect();
  logger.info('Prisma disconnected from PostgreSQL database');
});
```

## Metrics and Observability

### Health Check Endpoints

The application provides health check endpoints for monitoring:

```bash
# Basic health check
GET /health

# Kubernetes readiness probe
GET /ready

# Kubernetes liveness probe  
GET /live
```

### Prisma Studio

For development, use Prisma Studio to visualize and manage data:

```bash
cd app
npx prisma studio
```

This opens a web interface at http://localhost:5555

### Query Analysis

Enable query logging to analyze performance:

```bash
# Development
export PRISMA_LOGGING=true
export LOG_LEVEL=debug
npm start

# Production (logs only errors/warnings)
export PRISMA_LOGGING=false
export LOG_LEVEL=info
npm start
```

### APM Integration

For production monitoring, integrate with APM tools:

- **New Relic**: Use `@prisma/instrumentation` package
- **Datadog**: Configure Prisma logging to send to Datadog agent
- **Prometheus**: Export custom metrics from Prisma middleware

Example with custom metrics:

```javascript
import { Counter, Histogram } from 'prom-client';

const queryCounter = new Counter({
  name: 'prisma_queries_total',
  help: 'Total number of Prisma queries',
  labelNames: ['model', 'action']
});

const queryDuration = new Histogram({
  name: 'prisma_query_duration_seconds',
  help: 'Prisma query duration in seconds',
  labelNames: ['model', 'action']
});

prisma.$use(async (params, next) => {
  const startTime = Date.now();
  const result = await next(params);
  const duration = (Date.now() - startTime) / 1000;
  
  queryCounter.inc({ model: params.model, action: params.action });
  queryDuration.observe({ model: params.model, action: params.action }, duration);
  
  return result;
});
```

## Troubleshooting

### Common Issues

1. **Connection Pool Exhaustion**
   - Symptom: `Connection pool timeout` errors
   - Solution: Increase `connection_limit` in DATABASE_URL or reduce concurrent operations

2. **Slow Queries**
   - Symptom: High query durations in logs
   - Solution: Add indexes, optimize queries, use pagination

3. **Memory Leaks**
   - Symptom: Increasing memory usage over time
   - Solution: Ensure `prisma.$disconnect()` is called on shutdown, use connection pooling

4. **Test Hanging**
   - Symptom: Jest tests don't exit after completion
   - Solution: Already configured with `forceExit: true` and `globalTeardown`

### Debug Mode

Enable Prisma debug mode for detailed logging:

```bash
export DEBUG="prisma:*"
npm start
```

This will log:
- Query execution
- Connection pool activity
- Transaction boundaries
- Migration information

## Migration from MongoDB

### Key Differences

| MongoDB/Mongoose | Prisma/PostgreSQL |
|------------------|-------------------|
| Embedded documents | Relational tables with foreign keys |
| `populate()` | `include` or `select` |
| Schema validation at runtime | Schema enforced at database level |
| No explicit transactions needed | Explicit transactions with `$transaction()` |
| `mongoose.connection.readyState` | `prisma.$queryRaw()` for health checks |

### Query Translation Examples

```javascript
// MongoDB/Mongoose
const contributors = await Contributor.find({ points: { $gte: 100 } })
  .populate('badges')
  .sort({ points: -1 })
  .limit(10);

// Prisma/PostgreSQL
const contributors = await prisma.contributor.findMany({
  where: { points: { gte: 100 } },
  include: { badges: true },
  orderBy: { points: 'desc' },
  take: 10
});
```

## Best Practices Summary

1. ✅ Use `select` to fetch only needed fields
2. ✅ Batch operations when possible
3. ✅ Use transactions for multi-step operations
4. ✅ Add indexes for frequently queried fields
5. ✅ Implement proper error handling for Prisma-specific errors
6. ✅ Monitor query performance with logging
7. ✅ Use pagination for large result sets
8. ✅ Configure connection pooling appropriately
9. ✅ Implement graceful shutdown with `$disconnect()`
10. ✅ Enable query logging in development only

## Additional Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [Prisma Performance Best Practices](https://www.prisma.io/docs/guides/performance-and-optimization)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Neon PostgreSQL](https://neon.tech/docs)

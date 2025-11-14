import logger from '../utils/logger.js';
import { Prisma } from '@prisma/client';

export const errorHandler = (err, req, res, next) => {
    // Log error with context
    logger.error('Unhandled error', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });

    // Don't expose stack traces in production
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    // Handle specific error types
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            error: isDevelopment ? err.message : 'Invalid input data'
        });
    }

    // Handle Prisma errors
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
        return res.status(503).json({
            success: false,
            message: 'Database error',
            error: isDevelopment ? err.message : 'Service temporarily unavailable'
        });
    }

    if (err instanceof Prisma.PrismaClientValidationError) {
        return res.status(400).json({
            success: false,
            message: 'Database validation error',
            error: isDevelopment ? err.message : 'Invalid database operation'
        });
    }

    if (err.status === 404) {
        return res.status(404).json({
            success: false,
            message: 'Resource not found',
            error: isDevelopment ? err.message : 'The requested resource was not found'
        });
    }

    // Default error response
    res.status(err.status || 500).json({
        success: false,
        message: 'Internal server error',
        error: isDevelopment ? err.message : 'Something went wrong'
    });
};
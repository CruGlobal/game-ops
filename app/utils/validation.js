import { body, query, validationResult } from 'express-validator';

export const validateRequest = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array()
        });
    }
    next();
};

export const validateDateRange = [
    query('startDate')
        .optional()
        .isISO8601()
        .withMessage('Start date must be a valid ISO 8601 date'),
    query('endDate')
        .optional()
        .isISO8601()
        .withMessage('End date must be a valid ISO 8601 date')
        .custom((value, { req }) => {
            if (req.query.startDate && value) {
                const start = new Date(req.query.startDate);
                const end = new Date(value);
                if (end < start) {
                    throw new Error('End date must be after start date');
                }
            }
            return true;
        })
];

// `range` is a day count, not a date, so validateDateRange never covered it. Left
// unvalidated it reached `new Date(NaN)` and surfaced as a Prisma 500 rather than a 400.
export const validateRangeDays = [
    // Deliberately optional. A missing `range` already returns a 400 from the
    // controller with its own body shape, and callers depend on that; taking it over
    // here would change the response for a case that already worked. This only rejects
    // a range that is present but not a usable number of days — previously that reached
    // `new Date(NaN)` and surfaced as a Prisma 500.
    query('range')
        .optional()
        .isInt({ min: 1, max: 3650 })
        .withMessage('Range must be a whole number of days between 1 and 3650')
];

export const validatePagination = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100')
];


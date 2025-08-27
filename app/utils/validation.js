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

export const validateUsername = [
    body('username')
        .isLength({ min: 1, max: 39 })
        .withMessage('Username must be between 1 and 39 characters')
        .matches(/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i)
        .withMessage('Username must be a valid GitHub username')
];
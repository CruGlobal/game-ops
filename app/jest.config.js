// Two projects, because the suites need different worlds.
//
//   server - the original suite: node environment, and __tests__/setup.js connects Prisma
//            and truncates tables between tests.
//   client - the browser code in public/. jsdom environment, and deliberately NO
//            setupFilesAfterEnv: these tests must not need a database, and loading the
//            Prisma setup into jsdom would only slow them down and couple them to one.
//
// Root-level options below apply to both.

const serverProject = {
    displayName: 'server',
    testEnvironment: 'node',
    preset: null,
    transform: {},
    moduleFileExtensions: ['js', 'json'],
    testMatch: [
        '**/__tests__/**/*.test.js',
        '**/__tests__/**/*.spec.js',
        '**/?(*.)+(spec|test).js'
    ],
    testPathIgnorePatterns: [
        '/node_modules/',
        '/__tests__/setup.js',
        '/__tests__/unit/githubIntegration.test.js',
        '/__tests__/client/'            // owned by the client project below
    ],
    setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
    transformIgnorePatterns: ['node_modules/(?!(supertest|nock)/)'],
    // Project-level in Jest 29: at the root, next to `projects`, these are dropped.
    clearMocks: true,
    restoreMocks: true
};

const clientProject = {
    displayName: 'client',
    testEnvironment: 'jsdom',
    preset: null,
    transform: {},
    moduleFileExtensions: ['js', 'json'],
    testMatch: ['**/__tests__/client/**/*.test.js'],
    testPathIgnorePatterns: ['/node_modules/'],
    transformIgnorePatterns: ['node_modules/(?!(supertest|nock)/)'],
    clearMocks: true,
    restoreMocks: true
};

export default {
    projects: [serverProject, clientProject],

    // Coverage configuration
    collectCoverageFrom: [
        'controllers/**/*.js',
        'services/**/*.js',
        'middleware/**/*.js',
        'utils/**/*.js',
        'models/**/*.js',
        'public/arcade.js',
        '!**/__tests__/**',
        '!**/node_modules/**',
        '!**/coverage/**'
    ],

    // Global teardown
    globalTeardown: '<rootDir>/__tests__/globalTeardown.js',

    // Test timeout (increased for database operations)
    testTimeout: 30000,

    // Run tests serially to prevent database conflicts
    maxWorkers: 1,

    // Verbose output
    verbose: true,

    // Force exit after tests complete
    // Note: Required due to Prisma's connection pool not closing immediately in test mode
    // The globalTeardown gives Prisma time to cleanup, but forceExit ensures Jest doesn't hang
    forceExit: true
};

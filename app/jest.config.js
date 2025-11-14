export default {
  // Test environment
  testEnvironment: 'node',
  
  // ES modules support
  preset: null,
  transform: {},
  
  // Module file extensions
  moduleFileExtensions: ['js', 'json'],
  
  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/__tests__/**/*.spec.js',
    '**/?(*.)+(spec|test).js'
  ],

  // Exclude setup files from test runs
  testPathIgnorePatterns: [
    '/node_modules/',
    '/__tests__/setup.js',
    '/__tests__/unit/controllers.test.js',
    '/__tests__/unit/githubIntegration.test.js'
  ],
  
  // Coverage configuration
  collectCoverageFrom: [
    'controllers/**/*.js',
    'services/**/*.js',
    'middleware/**/*.js',
    'utils/**/*.js',
    'models/**/*.js',
    '!**/__tests__/**',
    '!**/node_modules/**',
    '!**/coverage/**'
  ],
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
  
  // Global teardown
  globalTeardown: '<rootDir>/__tests__/globalTeardown.js',
  
  // Test timeout (increased for database operations)
  testTimeout: 30000,
  
  // Run tests serially to prevent database conflicts
  maxWorkers: 1,
  
  // Verbose output
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Restore mocks after each test
  restoreMocks: true,
  
  // Force exit after tests complete
  // Note: Required due to Prisma's connection pool not closing immediately in test mode
  // The globalTeardown gives Prisma time to cleanup, but forceExit ensures Jest doesn't hang
  forceExit: true,
  
  // Transform ignore patterns for ES modules
  transformIgnorePatterns: [
    'node_modules/(?!(supertest|nock)/)'
  ]
};
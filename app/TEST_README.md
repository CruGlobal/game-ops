# Testing Documentation

This application uses **Jest** as the testing framework with comprehensive unit and integration tests.

## Test Structure

```
__tests__/
├── setup.js                           # Test configuration and helpers
├── integration/
│   └── api.test.js                    # API endpoint integration tests
└── unit/
    ├── contributorService.test.js     # Core service unit tests
    ├── githubIntegration.test.js      # GitHub API integration tests
    ├── badgeAndBillLogic.test.js      # Badge/Bill awarding logic tests
    └── controllers.test.js            # Controller unit tests
```

## Test Categories

### Unit Tests
- **Service Tests**: Test business logic in isolation
- **Controller Tests**: Test request/response handling
- **Badge Logic Tests**: Test award criteria and calculations
- **GitHub Integration Tests**: Test API calls with mocking

### Integration Tests
- **API Tests**: Test complete HTTP request/response cycles
- **Database Tests**: Test data persistence and retrieval
- **Authentication Tests**: Test JWT token handling

## Running Tests

### Install Dependencies
```bash
cd app
npm install
```

### Run All Tests
```bash
npm test
```

### Run Specific Test Types
```bash
# Run only unit tests
npm run test:unit

# Run only integration tests  
npm run test:integration

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

### Run Individual Test Files
```bash
# Run specific test file
npx jest __tests__/unit/contributorService.test.js

# Run tests matching a pattern
npx jest --testNamePattern="badge"
```

## Test Environment

Tests use:
- **In-Memory MongoDB**: Provided by `mongodb-memory-server`
- **Mocked GitHub API**: Using `nock` for HTTP request mocking
- **Isolated Test Environment**: Each test runs in isolation with clean database state

### Environment Variables
Tests use `.env.test` with safe test values:
- `NODE_ENV=test`
- Mock GitHub tokens and API endpoints
- Test database connections

## Test Coverage

Generate a coverage report:
```bash
npm run test:coverage
```

Coverage reports show:
- Line coverage
- Branch coverage  
- Function coverage
- Statement coverage

## Writing New Tests

### Test File Naming
- Unit tests: `*.test.js` in `__tests__/unit/`
- Integration tests: `*.test.js` in `__tests__/integration/`

### Helper Functions
Use the provided helpers from `__tests__/setup.js`:

```javascript
import { createTestContributor, mockGitHubApi } from '../setup.js';

// Create test contributor data
const contributor = createTestContributor({
  username: 'testuser',
  prCount: 10,
  reviewCount: 5
});

// Mock GitHub API responses
mockGitHubApi.pullRequests([/* test data */]);
mockGitHubApi.rateLimit(5000, 5000);
```

### Test Structure
```javascript
import { describe, it, expect, beforeEach } from '@jest/globals';

describe('Feature Name', () => {
  beforeEach(async () => {
    // Clean up before each test
    await Contributor.deleteMany({});
  });

  describe('Specific Functionality', () => {
    it('should behave correctly when...', async () => {
      // Arrange
      const testData = createTestContributor();
      
      // Act
      const result = await functionUnderTest(testData);
      
      // Assert
      expect(result).toEqual(expectedResult);
    });
  });
});
```

## Best Practices

1. **Isolation**: Each test should be independent and not rely on other tests
2. **Clean State**: Database is cleaned before each test
3. **Descriptive Names**: Test names should clearly describe what is being tested
4. **Mock External APIs**: Use nock to mock GitHub API calls
5. **Test Edge Cases**: Include tests for error conditions and edge cases
6. **Async/Await**: Use async/await for asynchronous operations

## Debugging Tests

### Verbose Output
```bash
npm test -- --verbose
```

### Run Single Test
```bash
npm test -- --testNamePattern="should award 1st PR badge"
```

### Debug Mode
```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

## Continuous Integration

Tests are designed to run in CI environments:
- No external dependencies (MongoDB, GitHub API are mocked)
- Deterministic results
- Fast execution with parallel test running
- Clear error reporting

## Troubleshooting

### Common Issues

1. **MongoDB Connection**: Tests use in-memory MongoDB, no external connection needed
2. **GitHub API Limits**: All GitHub API calls are mocked in tests
3. **Port Conflicts**: Tests don't start HTTP servers, avoiding port conflicts
4. **Environment Variables**: Tests use `.env.test` file automatically

### Test Failures
- Check that all async operations use `await`
- Verify mock expectations match actual calls
- Ensure database cleanup is working correctly
- Review test isolation and shared state issues

## Performance

- **Unit Tests**: ~100-500ms each
- **Integration Tests**: ~500-2000ms each  
- **Full Test Suite**: Should complete in under 30 seconds

For faster development, use `npm run test:watch` to only run tests related to changed files.
# Testing Guide for ws-actual

This document describes the testing strategy and approach for the ws-actual project.

## Testing Philosophy

The ws-actual project follows an **integration-first testing approach** that prioritizes:

1. **Value Over Coverage**: Tests that catch real bugs and prevent regressions
2. **Integration Tests**: Testing complete workflows with realistic scenarios
3. **Practical Mocking**: Mocking external dependencies (APIs, browser automation) while keeping internal logic real
4. **Maintainability**: Tests that are easy to understand, update, and extend

## Test Organization

### Test Types

- **Integration Tests**: Test complete workflows from input to output
  - `config-integration.test.js` - Configuration loading, saving, and validation
  - `parser-integration.test.js` - Transaction parsing from raw scraped data
  - `transformer-validation.test.js` - Transaction transformation and statistics
  - `actual-client-integration.test.js` - ActualBudget API wrapper operations

- **Unit Tests**: Test specific functions with many edge cases
  - `parser.test.js` - Core parsing logic
  - `account-resolution-unit.test.js` - Account resolution patterns
  - `deterministic-id.test.js` - ID generation consistency

- **Comprehensive Tests**: Extensive test coverage with many scenarios
  - `transformer-comprehensive.test.js` - Wide range of transformation cases
  - `transfer.test.js` - Transfer detection and handling
  - `transformation-simple.test.js` - Basic transformation workflows

### Test Fixtures

Reusable test data is located in `/home/ahal/dev/ws-actual/test/fixtures/`:

- `transactions.js` - Sample WealthSimple transactions, mock ActualBudget data, and test configurations

Use fixtures to:
- Create consistent test data
- Avoid duplication
- Make tests more readable
- Simplify test maintenance

## Running Tests

### Basic Commands

```bash
# Run all tests
npm test

# Run tests with coverage
npm test:coverage

# Run tests in watch mode (auto-rerun on file changes)
npm test:watch

# Run only integration tests
npm test:integration

# Run only unit tests
npm test:unit
```

### Pre-commit Testing

Tests automatically run before each commit via husky pre-commit hooks. To manually run all pre-commit checks:

```bash
npm run precommit
```

This runs:
1. ESLint for code linting
2. Prettier for code formatting
3. All tests

## Test Coverage

The project uses Node.js's built-in `--experimental-test-coverage` flag for coverage reporting.

### Coverage Targets

- **Lines**: 80%+
- **Functions**: 75%+
- **Branches**: 70%+
- **Statements**: 80%+

### Coverage Reports

Coverage reports are generated in the `coverage/` directory:
- `coverage/index.html` - HTML coverage report (open in browser)
- `coverage/lcov.info` - LCOV format for CI/CD integration

**Note**: 100% coverage is not a goal. Focus on:
- Critical business logic paths
- Error handling
- Edge cases
- Integration workflows

Don't test:
- Trivial getters/setters
- Simple wrapper functions
- Code already covered by integration tests

## Writing New Tests

### Using Fixtures

```javascript
import { validTransactions, mockActualAccounts } from './fixtures/transactions.js';

it('should process a deposit transaction', () => {
  const result = transformTransaction(validTransactions.simpleDeposit);
  assert.strictEqual(result.Amount, 10050);
});
```

### Integration Test Pattern

```javascript
describe('Module Integration Tests', () => {
  let testEnv;

  beforeEach(async () => {
    // Set up test environment
    testEnv = await createTestEnvironment();
  });

  afterEach(async () => {
    // Clean up
    await testEnv.cleanup();
  });

  it('should complete full workflow', async () => {
    // Arrange: Set up test data
    const input = createTestData();

    // Act: Execute the full workflow
    const result = await processWorkflow(input);

    // Assert: Verify the outcome
    assert.ok(result.success);
    assert.strictEqual(result.items.length, 3);
  });
});
```

### Mocking External Dependencies

For integration tests, mock at the lowest practical level:

```javascript
// Mock HTTP responses, not business logic
import { mock } from 'node:test';

mock.method(api, 'downloadBudget', async () => {
  return { success: true };
});

// Mock browser operations, not parsing logic
mock.method(page, 'evaluate', async () => {
  return rawTransactionData;
});
```

### Avoid Over-Parametrization

Use parametrization when:
- Test cases differ only in input/output data
- Setup and assertions are identical
- Adding new cases is common

Avoid parametrization when:
- Setup varies between cases
- Assertions differ significantly
- It makes tests harder to understand

Instead, use fixtures and helper functions for shared logic.

## What to Test

### Critical Paths (High Priority)

1. **Transaction Transformation Pipeline**
   - CSV/Scraping → Parsing → Transformation → Import
   - Date formatting and fallbacks
   - Amount conversion (dollars → cents)
   - Debit/credit classification

2. **Transfer Detection**
   - Identifying transfers between accounts
   - Transfer payee mapping
   - Perspective-based account resolution

3. **Configuration Management**
   - Loading and saving config files
   - Account resolution and mapping
   - Validation and error messages

4. **Error Handling**
   - Missing required fields
   - Invalid data formats
   - Network failures (mocked)

### Secondary Paths (Medium Priority)

1. **Statistics and Reporting**
   - Transaction grouping
   - Statistics calculation
   - Date range detection

2. **Validation**
   - Transaction validation
   - Config validation
   - Data type checking

3. **Edge Cases**
   - Zero amounts
   - Very large amounts
   - Special characters
   - Empty fields

### Low Priority

- Trivial utility functions
- Simple formatters
- Code already covered by integration tests

## Continuous Integration

The project is set up for CI/CD integration:

1. **Pre-commit Hooks**: Run linting, formatting, and tests before each commit
2. **Coverage Reports**: Generate LCOV format for CI platforms
3. **Exit Codes**: Tests fail with non-zero exit code on failure

### CI Configuration Example

```yaml
# .github/workflows/test.yml (example)
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check
      - run: npm test:coverage
      - uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info
```

## Debugging Tests

### Run Single Test File

```bash
node --test test/parser.test.js
```

### Run Single Test

```bash
node --test test/parser.test.js --test-name-pattern="should parse date"
```

### Enable Verbose Output

```bash
node --test --test-reporter=spec test/*.test.js
```

### Debug with Node Inspector

```bash
node --test --inspect-brk test/parser.test.js
```

Then open `chrome://inspect` in Chrome.

## Common Testing Patterns

### Testing Async Operations

```javascript
it('should load config asynchronously', async () => {
  const config = await loadConfig(testPath);
  assert.ok(config);
});
```

### Testing Error Conditions

```javascript
it('should handle missing file gracefully', async () => {
  const config = await loadConfig('/nonexistent/path');
  // Should return default config, not throw
  assert.ok(config.accounts);
});
```

### Testing With Temporary Files

```javascript
import { rm, mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

let testDir;

beforeEach(async () => {
  testDir = join(tmpdir(), `test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});
```

### Asserting on Objects

```javascript
// Check specific fields
assert.strictEqual(result.Date, '2024-01-01');
assert.strictEqual(result.Amount, 10050);

// Check field existence
assert.ok('Date' in result);
assert.ok('Account' in result);

// Check no extra fields
const allowedFields = ['Date', 'Account', 'Payee', 'Notes', 'Amount'];
const actualFields = Object.keys(result);
const extraFields = actualFields.filter(f => !allowedFields.includes(f));
assert.strictEqual(extraFields.length, 0);
```

## Test Maintenance

### When to Update Tests

- **Implementation changes**: Update tests when behavior changes intentionally
- **Bug fixes**: Add test cases to prevent regression
- **New features**: Add tests for new functionality
- **Refactoring**: Tests should still pass; if not, they were too coupled to implementation

### When to Remove Tests

- Tests that don't add value (only test trivial code)
- Tests that are redundant (already covered by integration tests)
- Tests that are flaky and can't be fixed
- Tests for removed features

### Keeping Tests Fast

- Mock external dependencies (APIs, file system, browser)
- Use in-memory operations where possible
- Avoid unnecessary waits/delays
- Run expensive tests separately (e.g., E2E tests)

## Troubleshooting

### Tests Pass Locally But Fail in CI

- Check Node version consistency
- Verify environment variables
- Look for timing-dependent tests
- Check file path differences (Windows vs. Unix)

### Flaky Tests

- Add proper waits for async operations
- Mock time-dependent code
- Avoid race conditions
- Use fixtures instead of external data

### Tests Are Slow

- Profile tests to find bottlenecks
- Move slow tests to separate suite
- Mock expensive operations
- Parallelize independent tests

## Further Reading

- [Node.js Test Runner Documentation](https://nodejs.org/api/test.html)
- [Node.js Assert Documentation](https://nodejs.org/api/assert.html)
- [Testing Best Practices](https://testingjavascript.com/)
- [Integration Testing Principles](https://martinfowler.com/bliki/IntegrationTest.html)

## Contributing

When contributing tests:

1. Follow existing patterns and conventions
2. Use fixtures for common test data
3. Write integration tests for workflows
4. Focus on behavior, not implementation details
5. Keep tests readable and maintainable
6. Add documentation for complex test scenarios

// Unit test setup - no database connection required

// Set test environment
process.env['NODE_ENV'] = 'test';

// Use the same database server configuration but with test database name
// These will be read from the actual .env file, we just need to override the database name
process.env['DB_NAME'] = 'Administration';

// Mock environment variables for unit tests (only if not already set)
if (!process.env['JWT_SECRET']) {
  process.env['JWT_SECRET'] = 'test-jwt-secret-key-for-unit-tests-only-32-chars-minimum';
}
if (!process.env['REFRESH_TOKEN_SECRET']) {
  process.env['REFRESH_TOKEN_SECRET'] = 'test-refresh-token-secret-key-for-unit-tests-only-32-chars';
}
if (!process.env['SMTP_HOST']) {
  process.env['SMTP_HOST'] = 'smtp.test.com';
  process.env['SMTP_PORT'] = '587';
  process.env['SMTP_USER'] = 'test@test.com';
  process.env['SMTP_PASSWORD'] = 'test_password';
  process.env['FROM_EMAIL'] = 'test@test.com';
  process.env['FROM_NAME'] = 'Test App';
}

// Mock console methods to reduce noise in tests
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  // Suppress console.error and console.warn during tests unless explicitly needed
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterAll(() => {
  // Restore original console methods
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Set reasonable timeout for unit tests
jest.setTimeout(5000);

// Mock logger to prevent actual logging during tests
jest.mock('../config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
  },
  httpLoggerConfig: {},
}));

// Mock database to prevent actual database connections
jest.mock('../config/database', () => ({
  database: {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    healthCheck: jest.fn().mockResolvedValue(true),
    knex: {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({}),
      then: jest.fn().mockResolvedValue([]),
    },
  },
}));
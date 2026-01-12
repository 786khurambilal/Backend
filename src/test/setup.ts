import { database } from '../config/database';

// Global test setup
beforeAll(async () => {
  // Set test environment and test database name
  process.env['NODE_ENV'] = 'test';
  process.env['DB_NAME'] = 'Administration';

  // Initialize database connection for tests
  try {
    await database.connect();
  } catch (error) {
    console.error('Failed to connect to test database:', error);
    console.error('Make sure the test database "Administration" exists on the server');
    process.exit(1);
  }
});

// Global test teardown
afterAll(async () => {
  // Close database connection
  await database.disconnect();
});

// Increase test timeout for integration tests
jest.setTimeout(30000);

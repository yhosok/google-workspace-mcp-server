/**
 * Jest test setup configuration
 *
 * This file configures the test environment to minimize log output
 * and improve test execution performance.
 */

// Set NODE_ENV to test if not already set
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}

// Disable debug mode during testing to reduce log output
process.env.DEBUG = 'false';

// Set required environment variables for tests
process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH = '/mock/service-account.json';
process.env.GOOGLE_DRIVE_FOLDER_ID = 'mock-folder-id';

// Disable keytar in test environment to avoid native dependency (libsecret) issues in CI
process.env.DISABLE_KEYTAR = '1';

// Set fast retry configuration for tests (but preserve default timeout values)
process.env.GOOGLE_RETRY_MAX_ATTEMPTS = '2';
process.env.GOOGLE_RETRY_BASE_DELAY = '10';
process.env.GOOGLE_RETRY_MAX_DELAY = '50';
process.env.GOOGLE_RETRY_JITTER = '0';
process.env.GOOGLE_RETRY_RETRIABLE_CODES = '429,500,502,503,504';
// Note: Don't set GOOGLE_REQUEST_TIMEOUT or GOOGLE_TOTAL_TIMEOUT here to test defaults

// Import logger types and utilities
import { logger, LogLevel } from './utils/logger.js';

// Configure logger for test environment with minimal output
// Only ERROR and FATAL level logs will be shown during tests
logger.updateConfig({
  level: LogLevel.ERROR,
  debugMode: false,
  includePerformanceMetrics: false,
  prettyPrint: false,
  // Optionally, completely silence logs during testing
  // outputFn: () => {} // Uncomment this line to completely silence all logs
});

// Suppress console output during tests (except for errors/log)
// This prevents Jest from showing console output unless it's an actual error
console.debug = (): void => {};
console.info = (): void => {};
console.warn = (): void => {};
// Keep console.error and console.log for actual test failures and important messages
// console.error = () => {};
// console.log = () => {};

// Optional: Restore console methods after all tests complete
// This can be useful for debugging if needed
// afterAll(() => {
//   Object.assign(console, originalConsole);
// });

// Set test timeout to handle any remaining async operations
jest.setTimeout(30000); // 30 seconds timeout for tests

// Optional GC after each test when explicitly enabled (set FORCE_GC=1)
afterEach(() => {
  if (process.env.FORCE_GC === '1' && global.gc) {
    global.gc();
  }
});

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

// Import logger types and utilities
import { logger, LogLevel } from '../src/utils/logger.js';

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

// Store original console methods to suppress console output during tests
const originalConsole = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
  log: console.log
};

// Suppress console output during tests (except for errors)
// This prevents Jest from showing console output unless it's an actual error
console.debug = () => {};
console.info = () => {};
console.warn = () => {};
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
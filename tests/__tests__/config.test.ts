import { loadConfig, GOOGLE_SCOPES } from '../../src/config/index';

describe('Config', () => {
  describe('loadConfig', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    test('should load valid config from environment variables', () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH = './test-key.json';
      process.env.GOOGLE_DRIVE_FOLDER_ID = 'test-folder-id';

      const config = loadConfig();

      expect(config.GOOGLE_SERVICE_ACCOUNT_KEY_PATH).toBe('./test-key.json');
      expect(config.GOOGLE_DRIVE_FOLDER_ID).toBe('test-folder-id');
    });

    test('should throw error for missing required environment variables', () => {
      delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;

      expect(() => loadConfig()).toThrow();
    });
  });

  describe('GOOGLE_SCOPES', () => {
    test('should contain required Google API scopes', () => {
      expect(GOOGLE_SCOPES).toContain('https://www.googleapis.com/auth/spreadsheets');
      expect(GOOGLE_SCOPES).toContain('https://www.googleapis.com/auth/drive.readonly');
    });
  });
});
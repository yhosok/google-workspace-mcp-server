const { createDefaultPreset } = require('ts-jest');

const presetConfig = createDefaultPreset({
  tsconfig: 'tsconfig.test.json',
});

const config = {
  ...presetConfig,
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts'
  ],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  extensionsToTreatAsEsm: ['.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  // Light-weight ts-jest settings (Step 2 optimization)
  globals: {
    'ts-jest': {
      diagnostics: false,       // Skip type diagnostics for speed in tests
      isolatedModules: true,    // Faster, per-file transpilation
      useESM: true,
      tsconfig: 'tsconfig.test.json'
    }
  },
  
  // Performance optimizations
  coverageProvider: 'v8',      // Use V8's built-in coverage for better performance
  maxWorkers: '75%',           // Default local parallelism (CI may override via CLI)
  testTimeout: 10000,          // タイムアウト10秒（デフォルト5秒から適度に延長）
  cache: true,                 // キャッシュ有効化で再実行時の高速化
  watchman: false,             // watchman無効で高速化（CI環境で特に有効）
  bail: false,                 // 全テスト実行（failfast無効）
  verbose: false,              // verbose無効で出力抑制・高速化
  
  // 出力とログ設定の最適化
  silent: false,               // console出力は維持（デバッグ用）
  errorOnDeprecated: false,    // 非推奨警告でのエラー停止を無効化
  
  // テストファイル検索の最適化
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/'
  ],
  
  // モジュール解決の最適化
  modulePathIgnorePatterns: [
    '/dist/',
    '/coverage/'
  ]
};

module.exports = config;
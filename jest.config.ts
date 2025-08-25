import type { Config } from 'jest';
import { createDefaultPreset } from 'ts-jest';

const presetConfig = createDefaultPreset({
  tsconfig: 'tsconfig.test.json',
});

const config: Config = {
  ...presetConfig,
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
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
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  
  // Performance optimizations
  maxWorkers: '75%',           // CPU並列度向上 - 75%のワーカーでバランス良く並列化
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

export default config;
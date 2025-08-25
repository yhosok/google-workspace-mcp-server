import { z } from 'zod';
import type { EnvironmentConfig } from '../types/index.js';

// 環境変数のスキーマ定義
const envSchema = z.object({
  GOOGLE_SERVICE_ACCOUNT_KEY_PATH: z.string(),
  GOOGLE_DRIVE_FOLDER_ID: z.string(),
});

export function loadConfig(): EnvironmentConfig {
  return envSchema.parse(process.env);
}

// Google APIスコープの定義
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly',
] as const;
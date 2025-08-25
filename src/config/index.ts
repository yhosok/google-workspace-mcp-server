import { z } from 'zod';
import type { EnvironmentConfig } from '../types/index.js';

// 環境変数のスキーマ定義
const envSchema = z.object({
  GOOGLE_SERVICE_ACCOUNT_KEY_PATH: z.string().min(1, 'GOOGLE_SERVICE_ACCOUNT_KEY_PATH is required'),
  GOOGLE_DRIVE_FOLDER_ID: z.string().optional(),
}).transform((data) => ({
  GOOGLE_SERVICE_ACCOUNT_KEY_PATH: data.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
  GOOGLE_DRIVE_FOLDER_ID: data.GOOGLE_DRIVE_FOLDER_ID || '',
}));

export function loadConfig(): EnvironmentConfig {
  return envSchema.parse(process.env);
}

// Google APIスコープの定義
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly',
] as const;
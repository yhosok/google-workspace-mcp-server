# Google Drive 検索・参照機能実装計画

## 実装概要

Google Drive APIを使用した検索・参照機能を、既存のMCPサーバーアーキテクチャに従って実装します。TDDのRed-Green-Refactorサイクルで開発を進めます。

## 1. DriveService拡張 (src/services/drive.service.ts)

### 新規メソッド追加

- `listFiles()` - ファイル一覧取得
- `searchFiles()` - クエリベースの検索
- `getFile()` - 特定ファイルの詳細取得
- `getFileContent()` - ファイル内容の取得

### 主な機能

- ページネーション対応
- 検索クエリ構築（名前、MIMEタイプ、フォルダ）
- メタデータ取得（作成日時、更新日時、オーナー等）

## 2. BaseDriveTool作成 (src/tools/drive/base-drive-tool.ts)

### BaseCalendarToolsパターンに従って実装

- 認証チェック機能
- エラーハンドリング
- ロギング機能
- 共通のツール実行パターン

## 3. Driveツール実装

### 3つの新規ツール

1. **ListFilesTool** (google-workspace__drive-list)
   - フォルダ内のファイル一覧取得
   - ページサイズ指定可能
   
2. **SearchFilesTool** (google-workspace__drive-search)
   - 名前、MIMEタイプでの検索
   - 複雑なクエリ対応
   
3. **GetFileTool** (google-workspace__drive-get)
   - ファイルの詳細情報取得
   - メタデータとコンテンツの取得

## 4. スキーマ定義 (Zod使用)

各ツールの入力/出力スキーマを定義:

- 厳密な型チェック
- バリデーション
- エラーメッセージの改善

## 5. テスト戦略

### TDD Red-Green-Refactorサイクル

1. **Red Phase**: テストを先に書く
   - DriveService単体テスト
   - 各ツールの単体テスト
   - 統合テスト

2. **Green Phase**: 実装
   - 最小限のコードでテストを通す
   - 機能の完全実装

3. **Refactor Phase**: リファクタリング
   - コードの整理
   - パフォーマンス最適化

## 6. 実装順序

1. DriveServiceのテスト作成（Red）
2. DriveService実装（Green）
3. BaseDriveTool作成
4. 各ツールのテスト作成（Red）
5. 各ツール実装（Green）
6. DriveServiceModuleでツール登録
7. 統合テスト
8. リファクタリング
9. lint/typecheckの実行

## 技術的考慮事項

- **認証**: OAuth2とService Account両対応
- **エラーハンドリング**: GoogleDriveErrorクラス使用
- **リトライ**: 既存のリトライ設定に従う
- **ロギング**: 詳細なデバッグログ
- **型安全性**: TypeScript strict mode対応

## Google Drive API リファレンス

### Files.list API

```
GET https://www.googleapis.com/drive/v3/files
```

**主要パラメータ:**
- `q`: 検索クエリ
- `pageSize`: 結果の最大数 (1-1000)
- `pageToken`: ページネーションのトークン
- `fields`: 返すフィールドの指定
- `orderBy`: ソート順序

### 検索クエリ例

```
name contains 'report'
mimeType = 'application/pdf'
parents in 'folder_id'
createdTime > '2024-01-01T00:00:00'
```

## 実装予定のインターフェース

### DriveFileInfo

```typescript
interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime: string;
  modifiedTime: string;
  webViewLink?: string;
  parents?: string[];
  owners?: Array<{
    displayName: string;
    emailAddress: string;
  }>;
}
```

### SearchOptions

```typescript
interface SearchOptions {
  query?: string;
  mimeType?: string;
  parentId?: string;
  pageSize?: number;
  pageToken?: string;
  orderBy?: string;
}
```

## 期待される成果物

1. 完全にテストされたDriveService拡張
2. 3つの新しいMCPツール
3. 包括的なテストスイート
4. エラーハンドリングとログ出力
5. TypeScript型安全性の維持
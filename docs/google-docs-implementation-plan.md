# Google Docs API Integration Plan

## Overview
Google Docs APIの機能を既存のGoogle Workspace MCPサーバーに追加します。既存のSheets、Calendar、Driveサービスと同様のアーキテクチャパターンに従って実装します。

## 実装内容

### 1. DocsService実装 (`src/services/docs.service.ts`)
- GoogleServiceを継承
- 並行初期化防止機能（initializingPromiseパターン）
- 以下の主要メソッドを実装：
  - `createDocument()` - 新規ドキュメント作成（GOOGLE_DRIVE_FOLDER_ID対応）
  - `getDocument()` - ドキュメント内容取得
  - `batchUpdate()` - ドキュメント更新
  - `insertText()` - テキスト挿入
  - `replaceText()` - テキスト置換
  - `updateTextStyle()` - テキストスタイル更新

### 2. BaseDocsTool実装 (`src/tools/docs/base-docs-tool.ts`)
- ToolRegistryを継承
- 共通バリデーション機能
- エラーハンドリング
- Zodスキーマファクトリー

### 3. Docsツール実装 (`src/tools/docs/`)
- **CreateDocumentTool**: 新規ドキュメント作成（フォルダ配置対応）
- **GetDocumentTool**: ドキュメント内容取得
- **UpdateDocumentTool**: バッチ更新
- **InsertTextTool**: テキスト挿入
- **ReplaceTextTool**: テキスト置換

### 4. DocsServiceModule実装 (`src/registry/docs/`)
- ServiceModuleインターフェース実装
- ツールの登録と管理
- ヘルスチェック機能

### 5. フォルダ統合機能
- `GOOGLE_DRIVE_FOLDER_ID`環境変数のサポート
- DriveService連携によるフォルダ配置
- Sheets/Calendarと同様のフォルダ制約

### 6. テスト実装
- DocsService単体テスト
- 各ツールの単体テスト
- 統合テスト
- TDDのRed-Green-Refactorサイクル

### 7. 設定とドキュメント更新
- `.env.example`にDocs関連設定追加
- `CLAUDE.md`にDocsサービス説明追加
- スコープ設定（`https://www.googleapis.com/auth/documents`）

## 技術仕様

### Google Docs API概要
- **API Version**: Google Docs API v1
- **主要メソッド**:
  - `documents.create`: 新規ドキュメント作成
  - `documents.get`: ドキュメント内容取得
  - `documents.batchUpdate`: ドキュメント更新（複数操作を原子的に実行）

### 実装技術
- **googleapis**ライブラリ経由でのAPI呼び出し
- **neverthrow**によるエラーハンドリング
- **Zod**によるスキーマバリデーション
- リトライ機能付き実行
- 並行アクセス最適化

### アーキテクチャパターン
既存サービスと同様の以下のパターンを踏襲：
1. **Service Registry Pattern**: DocsServiceModuleによる管理
2. **Result Type Pattern**: neverthrowライブラリを使用
3. **Dependency Injection**: 設定による依存関係の注入
4. **Schema Validation**: Zodによるランタイム型安全性
5. **Concurrent Initialization Prevention**: initializingPromiseパターン

## 実装順序

### Phase 1: Core Service Implementation
1. DocsServiceとコアメソッド実装
2. 基本的なエラーハンドリングとバリデーション

### Phase 2: Tools Implementation  
3. BaseDocsToolと基本ツール実装
4. CreateDocumentTool（フォルダ対応含む）
5. GetDocumentTool
6. UpdateDocumentTool（バッチ更新）

### Phase 3: Advanced Tools
7. InsertTextTool
8. ReplaceTextTool
9. その他必要なツール

### Phase 4: Integration
10. DocsServiceModule作成
11. サービスレジストリへの統合
12. 環境設定の追加

### Phase 5: Testing & Documentation
13. テスト作成（TDD）
14. ドキュメント更新
15. 総合テストとlint確認

## 環境設定

### 必要なスコープ
```bash
# OAuth2設定に追加
GOOGLE_OAUTH_SCOPES=https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/drive.file,https://www.googleapis.com/auth/documents
```

### フォルダ統合
```bash
# ドキュメントもDriveフォルダに配置
GOOGLE_DRIVE_FOLDER_ID=your-folder-id
```

## Success Criteria

### 機能要件
- [x] Google Docs APIの最新情報調査完了
- [ ] 新規ドキュメント作成機能
- [ ] ドキュメント内容取得機能  
- [ ] テキスト挿入・更新機能
- [ ] フォルダ配置機能
- [ ] エラーハンドリングと再試行

### 技術要件
- [ ] すべてのテストが通過
- [ ] Lintエラーゼロ
- [ ] 既存機能への影響なし
- [ ] TypeScript型安全性確保
- [ ] ドキュメント更新完了

## Risk Mitigation

### リスク要因
1. **Google Docs API制限**: レート制限やクォータ制限
2. **認証スコープ**: Docsアクセスに必要な権限
3. **既存コードへの影響**: 新しいサービス追加による影響
4. **テストの複雑性**: Docsコンテンツの検証

### 対策
1. **適切なリトライ戦略**: 既存のGoogleServiceパターンを使用
2. **段階的ロールアウト**: 機能ごとの段階的実装
3. **包括的テスト**: ユニットテスト、統合テスト、E2Eテスト
4. **ドキュメント化**: 実装パターンと使用方法の明確な文書化

## Next Steps

1. **context7での技術調査**: Google Docs API最新情報の確認
2. **TDD開始**: DocsServiceの基本機能からテスト駆動で実装
3. **サブエージェント活用**: 実装とテストの専門エージェントを使用
4. **継続的検証**: 各フェーズでのテストとlint確認

この計画に従って、既存のGoogle Workspace MCP serverにGoogle Docs機能を完全に統合します。
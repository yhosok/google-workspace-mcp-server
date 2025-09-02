# Access Control Implementation Plan for Google Workspace MCP Server

## 概要

Google Workspace MCP サーバーに、更新系ツールの利用制限機能を実装するプランです。

## 要件

### 基本要件
- `GOOGLE_DRIVE_FOLDER_ID` が指定されている場合、そのフォルダ内のファイルは更新可能
- `GOOGLE_DRIVE_FOLDER_ID` 以外のフォルダ内のファイルはデフォルトで更新系ツール不可
- フォルダ外でも更新系ツールを使えるフラグ環境変数の追加
- 各ツールごとに利用可否を設定できる仕組み
- サービスレベルでの利用制限設定
- 実装の共通化

## 実装フェーズ

### Phase 1: 設定システムの拡張

**新しい環境変数の追加** (`src/config/index.ts`)
```bash
# フォルダ外での書き込み許可
GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER=false

# サービスレベルでの書き込み許可 (カンマ区切り)
GOOGLE_ALLOWED_WRITE_SERVICES=sheets,docs,calendar,drive

# 個別ツールでの書き込み許可 (カンマ区切り)
GOOGLE_ALLOWED_WRITE_TOOLS=google-workspace__sheets-write,google-workspace__sheets-append

# グローバル読み取り専用モード
GOOGLE_READ_ONLY_MODE=false
```

**設定スキーマの更新**
- Zodスキーマの拡張
- 設定バリデーション

### Phase 2: アクセス制御サービスの作成

**新規ファイル: `src/services/access-control.service.ts`**

主要メソッド:
```typescript
class AccessControlService {
  // フォルダアクセスの検証
  validateFolderAccess(folderId: string, operation: 'read' | 'write'): Result<boolean, AccessControlError>
  
  // ツールアクセスの検証
  validateToolAccess(toolName: string): Result<boolean, AccessControlError>
  
  // サービスアクセスの検証
  validateServiceAccess(serviceName: string): Result<boolean, AccessControlError>
  
  // 書き込み操作の実行可否判定
  canExecuteWriteOperation(context: AccessControlContext): Result<boolean, AccessControlError>
}
```

### Phase 3: ベースツールクラスの拡張

**対象ファイル:**
- `src/tools/sheets/base-sheets-tool.ts`
- `src/tools/docs/base-docs-tool.ts`
- `src/tools/calendar/base-calendar-tool.ts`
- `src/tools/drive/base-drive-tool.ts`

**追加メソッド:**
```typescript
protected validateAccessControl(context: AccessControlContext): Promise<Result<true, GoogleWorkspaceError>>
protected isWriteOperation(): boolean
protected getRequiredFolderIds(): string[]
```

### Phase 4: ツールの分類と更新

**読み取り専用ツール:**
- Sheets: `SheetsListTool`, `SheetsReadTool`
- Docs: `GetDocumentTool`
- Calendar: `ListCalendarsTool`, `ListEventsTool`, `GetEventTool`
- Drive: `ListFilesTool`, `GetFileTool`, `GetFileContentTool`

**更新系ツール:**
- Sheets: `SheetsWriteTool`, `SheetsAppendTool`, `SheetsAddSheetTool`, `SheetsCreateSpreadsheetTool`
- Docs: `CreateDocumentTool`, `UpdateDocumentTool`, `InsertTextTool`, `ReplaceTextTool`
- Calendar: `CreateEventTool`, `QuickAddTool`, `DeleteEventTool`

**実装パターン:**
```typescript
public async executeImpl(params: ToolParams, context?: ToolExecutionContext): Promise<Result<MCPToolResult, GoogleWorkspaceError>> {
  // 既存の認証
  const authResult = await this.validateAuthentication(requestId);
  if (authResult.isErr()) return err(authResult.error);
  
  // 新規: アクセス制御の検証
  const accessResult = await this.validateAccessControl({
    operation: this.isWriteOperation() ? 'write' : 'read',
    toolName: this.getToolName(),
    serviceName: this.getServiceName(),
    folderIds: this.getRequiredFolderIds(),
    params
  });
  if (accessResult.isErr()) return err(accessResult.error);
  
  // ツール実行の継続...
}
```

### Phase 5: サービスモジュールの統合

**対象ファイル:**
- `src/registry/sheets/sheets-service-module.ts`
- `src/registry/docs/docs-service-module.ts`
- `src/registry/calendar/calendar-service-module.ts`
- `src/registry/drive/drive-service-module.ts`

**機能:**
- アクセス制御設定に基づくツール登録フィルタリング
- サービスレベルでのアクセス制御

### Phase 6: エラーハンドリング

**新しいエラータイプ** (`src/errors/index.ts`):
```typescript
class AccessControlError extends GoogleWorkspaceError
class FolderAccessDeniedError extends AccessControlError
class ToolAccessDeniedError extends AccessControlError
class ServiceAccessDeniedError extends AccessControlError
```

**ユーザーフレンドリーなエラーメッセージ:**
- 操作がブロックされた理由の明確な表示
- 必要な権限や設定変更のガイダンス

### Phase 7: テストの実装

**テストカバレッジ:**
- AccessControlServiceの単体テスト
- 各アクセス制御モードの統合テスト
- ツールレベルでのアクセス制御シナリオテスト
- サービスモジュールの制限設定テスト

## 設定例

### フォルダベースの制限
```bash
GOOGLE_DRIVE_FOLDER_ID=folder123
GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER=false
```

### サービスレベルの制限
```bash
GOOGLE_ALLOWED_WRITE_SERVICES=sheets
```

### ツール固有の制限
```bash
GOOGLE_ALLOWED_WRITE_TOOLS=google-workspace__sheets-write,google-workspace__sheets-append
```

### グローバル読み取り専用モード
```bash
GOOGLE_READ_ONLY_MODE=true
```

## 実装の特徴

### 後方互換性
- デフォルトの動作は変更なし（制限なし）
- 既存の設定や動作に影響しない

### 柔軟な設定
- 複数のアクセス制御モードをサポート
- 細かい権限制御が可能

### 共通実装
- ベースクラスとサービスでのロジック共有
- 重複コードの最小化

### 明確なエラーメッセージ
- ユーザーが操作がブロックされた理由を理解できる
- 必要な設定変更のガイダンス

## 実装順序

1. **設定システムの拡張** - 新しい環境変数とバリデーション
2. **アクセス制御サービス** - 中核となるアクセス制御ロジック
3. **ベースツールクラスの拡張** - 共通のアクセス制御機能
4. **ツールの更新** - 各ツールでのアクセス制御実装
5. **サービスモジュールの統合** - サービスレベルでの制御
6. **エラーハンドリング** - 適切なエラー処理とメッセージ
7. **テストの実装** - 包括的なテストカバレッジ
8. **ドキュメントの更新** - CLAUDE.mdとREADMEの更新

この実装により、Google Workspace MCP サーバーに柔軟で強力なアクセス制御機能を追加できます。
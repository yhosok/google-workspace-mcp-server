# Google Drive ファイル検索の修正計画

## 問題分析結果

調査の結果、以下の問題が判明しました：

### 1. **クエリ構文の引用符の誤り（最重要）**
- **問題**: 例やテストで `name contains "Test"` のようにダブルクォートを使用
- **正解**: Google Drive API v3では文字列リテラルにシングルクォート必須: `name contains 'Test'`
- **影響**: ダブルクォートを使うとAPIがクエリを正しく解釈できず、検索結果が0件になる

### 2. **inputSchemaが空**
- **問題**: `ListFilesTool.getToolMetadata()` が `inputSchema: {}` を返している
- **影響**: MCPクライアントが利用可能なパラメータを認識できない

### 3. **ゴミ箱のファイルを除外していない**
- **問題**: デフォルトで `trashed = false` を追加していない
- **影響**: 削除済みファイルも検索結果に含まれる可能性

## 修正内容

### 1. ListFilesTool の inputSchema 修正
```typescript
// src/tools/drive/list-files.tool.ts
public getToolMetadata(): ToolMetadata {
  return {
    title: 'List Drive Files',
    description: 'Lists files in Google Drive with optional filtering and search',
    inputSchema: ListFilesInputSchema.shape, // 空のオブジェクトから修正
  };
}
```

### 2. クエリ例の修正
```typescript
// src/tools/drive/list-files.tool.ts (コメント)
* Usage:
*   query: "name contains 'Report'" // ダブルクォートからシングルクォートへ
*   query: "name = 'Document.docx' and trashed = false"
```

### 3. テストケースの修正
```typescript
// src/tools/drive/list-files.tool.test.ts
query: "name contains 'Test'" // すべてのテストケースで修正
```

### 4. ゴミ箱除外フィルタの自動追加
```typescript
// src/tools/drive/list-files.tool.ts
// Build query string
let queryString = validatedArgs.query || '';

// 自動的に trashed = false を追加（ユーザーが明示的に指定していない場合）
if (queryString && !queryString.includes('trashed')) {
  queryString = `(${queryString}) and trashed = false`;
} else if (!queryString) {
  queryString = 'trashed = false';
}
```

### 5. より親切なクエリ例の追加
```typescript
/**
 * クエリ例:
 * - 部分一致: "name contains '企画書'"
 * - 完全一致: "name = '2025年度計画'"
 * - フォルダ内検索: "'folder-id' in parents and name contains '議事録'"
 * - 拡張子なし検索（Googleドキュメント等）: "name = 'My Document'" (not 'My Document.docx')
 * - MIMEタイプ指定: "mimeType = 'application/vnd.google-apps.document'"
 */
```

## 実装順序（TDDサイクル）

### Phase 1: テストの修正（Red）
1. **既存テストの修正** - ダブルクォートをシングルクォートに修正
2. **新しいテストケースの追加** - trashed=falseフィルタのテスト
3. **テスト実行確認** - 現在のテストが失敗することを確認

### Phase 2: 実装の修正（Green）
1. **ListFilesTool.getToolMetadata() の修正** - inputSchemaを適切に設定
2. **クエリ例とコメントの更新** - シングルクォートの正しい使用法を示す
3. **trashed = false の自動追加** - ユーザビリティ向上
4. **テスト通過確認** - 修正したテストが通ることを確認

### Phase 3: リファクタリング（Refactor）
1. **コードの整理** - 重複排除、可読性向上
2. **エラーハンドリングの強化**
3. **ドキュメントの更新**
4. **統合テストの実行** - 全体が正しく動作することを確認

## チェックリスト

### 実装完了後の必須チェック
- [ ] testが全て通っているか (`npm test`)
- [ ] lintが全て通っているか (`npm run lint`)
- [ ] 実際のGoogle Drive APIでの動作確認
- [ ] 日本語ファイル名での検索テスト
- [ ] エッジケースの確認（空のクエリ、特殊文字等）

### 検証項目
- [ ] シングルクォートでの検索が正しく動作する
- [ ] ダブルクォートでの検索が適切にエラーハンドリングされる（または自動変換される）
- [ ] ゴミ箱のファイルが検索結果から除外される
- [ ] フォルダ内検索が正しく動作する
- [ ] ページネーションが正しく動作する
- [ ] inputSchemaがMCPクライアントに正しく露出される

## 技術調査事項

### Context7で確認する内容
1. Google Drive API v3の最新クエリ構文仕様
2. MCP (Model Context Protocol) の最新inputSchema仕様
3. Zodスキーマの `.shape` プロパティの使用方法

### Gemini調査事項
1. Google Drive API検索クエリのベストプラクティス
2. 日本語ファイル名検索における注意点
3. 共有ドライブでの検索制限事項

## 期待される成果

この修正により以下が実現されます：
1. **正確な検索結果**: ファイル名指定での検索が正しく動作
2. **ユーザビリティ向上**: 削除済みファイルが結果に含まれない
3. **開発者体験向上**: inputSchemaによる適切なパラメータ露出
4. **保守性向上**: 正しい引用符使用による将来的な問題回避
5. **テストカバレッジ向上**: エッジケースを含む包括的なテスト
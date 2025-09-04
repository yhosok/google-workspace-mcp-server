# Google Docs Markdown形式対応 実装計画

## 概要

Google Docsの内容取得にMarkdown形式での出力機能を追加します。Google Drive APIが`text/markdown`をネイティブサポートしていることが判明したため、外部ライブラリを使用せずに直接Markdown形式を取得できます。

## 重要な発見

Google Drive APIは**`text/markdown`をネイティブサポート**しています！これにより、外部ライブラリ（turndown等）を使用せずに、直接Markdown形式でエクスポートできます。

## 実装方針

Google Drive APIの`files.export`メソッドを使用して、`mimeType='text/markdown'`を指定することで直接Markdown形式を取得します。

## 実装タスク

### 1. DriveServiceの拡張

**ファイル**: `src/services/drive.service.ts`

- `getFileContent`メソッドのexportFormatsに`text/markdown`を追加
- Google Docsのエクスポート形式に`markdown: 'text/markdown'`を追加

```typescript
// Google Docsのエクスポート形式に追加
'application/vnd.google-apps.document': {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  rtf: 'application/rtf',
  txt: 'text/plain',
  html: 'text/html',
  epub: 'application/epub+zip',
  markdown: 'text/markdown',  // 新規追加
}
```

### 2. DocsServiceの拡張

**ファイル**: `src/services/docs.service.ts`

- `getDocumentAsMarkdown`メソッドを新規追加
- DriveService.getFileContentを使用（exportFormat='markdown'を指定）
- 取得したMarkdownテキストを返す

```typescript
public async getDocumentAsMarkdown(
  documentId: string
): Promise<GoogleDocsResult<string>> {
  // DriveService.getFileContentを使用してMarkdown形式で取得
  // エラーハンドリング含む実装
}
```

### 3. GetDocumentToolの更新

**ファイル**: `src/tools/docs/get-document.tool.ts`

- 入力スキーマに`format`パラメータを追加（'markdown' | 'json'、デフォルト: 'markdown'）
- format='markdown'の場合：DocsService.getDocumentAsMarkdownを呼び出し
- format='json'の場合：既存のgetDocumentメソッドを使用
- レスポンス構造を更新（Markdown形式とJSON形式の両方に対応）

```typescript
// 入力スキーマの更新
const GetDocumentInputSchema = z.object({
  documentId: z.string().min(1, 'Document ID is required'),
  includeContent: z.boolean().optional().default(false),
  format: z.enum(['markdown', 'json']).optional().default('markdown'), // 新規追加
});
```

### 4. テストの追加

- **DocsService**のMarkdown取得メソッドのユニットテスト
- **GetDocumentTool**のformatパラメータ動作テスト
- エラーハンドリングのテスト
- 既存機能への影響がないことの回帰テスト

### 5. ドキュメントの更新

- **README.md**: Markdown形式取得機能の説明を追加
- **CLAUDE.md**: 実装詳細とアーキテクチャを記載
- 使用例の追加

## 技術詳細

### DriveServiceとの連携

既存のDriveService.getFileContentメソッドを活用：

1. Google DocsのドキュメントIDを指定
2. exportFormat='markdown'を指定
3. Google Drive APIが`text/markdown`形式でエクスポート
4. 取得したMarkdownテキストを返す

### エラーハンドリング

- Markdownエクスポート失敗時の適切なエラー処理
- フォーマット指定エラーのバリデーション
- 大きなドキュメント（10MB制限）への対応
- ドキュメントが存在しない場合の処理

### 後方互換性

- 既存のJSON形式取得機能は維持
- formatパラメータのデフォルト値は'markdown'
- 既存のAPIクライアントへの影響なし

## メリット

### 技術的メリット

- **外部依存なし**: turndownライブラリが不要
- **ネイティブサポート**: Google公式のMarkdown変換を使用
- **シンプルな実装**: 既存のエクスポート機能を拡張するだけ
- **高品質な変換**: Googleが提供する公式のMarkdown変換品質

### ユーザー体験

- デフォルトでMarkdown形式での取得が可能
- 既存のJSON形式取得も引き続き利用可能
- より直接的で使いやすいAPI

## 期待される成果

1. **機能追加**
   - Google DocsからMarkdown形式での直接取得が可能
   - formatパラメータによる形式選択機能

2. **パフォーマンス**
   - 外部ライブラリ不要によるパフォーマンス向上
   - Google公式API使用による信頼性向上

3. **保守性**
   - 依存関係の削減
   - シンプルな実装による保守コスト削減

## 実装スケジュール

1. **Phase 1**: DriveService拡張
2. **Phase 2**: DocsService拡張
3. **Phase 3**: GetDocumentTool更新
4. **Phase 4**: テスト実装
5. **Phase 5**: ドキュメント更新

## リスクと対策

### 想定リスク

1. **API制限**: Google Drive APIの10MB制限
2. **形式制限**: 一部のドキュメント形式でMarkdownサポートなし
3. **品質**: Google公式Markdown変換の品質が期待に満たない場合

### 対策

1. **サイズチェック**: 事前にドキュメントサイズを確認
2. **フォールバック**: JSON形式への自動切り替え機能
3. **テスト**: 様々なドキュメント形式での動作確認

## 技術仕様

### API変更

```typescript
// 新しいレスポンス形式
interface MarkdownDocumentResponse {
  format: 'markdown';
  content: string;
  metadata: {
    documentId: string;
    title: string;
    modifiedTime: string;
  };
}

interface JsonDocumentResponse {
  format: 'json';
  document: DocsDocumentInfo;
}
```

### 設定オプション

```typescript
interface GetDocumentOptions {
  documentId: string;
  format?: 'markdown' | 'json';
  includeContent?: boolean;
}
```

## 完了基準

- [ ] DriveServiceにMarkdownエクスポート機能追加
- [ ] DocsServiceにMarkdown取得メソッド追加
- [ ] GetDocumentToolのformat対応完了
- [ ] すべてのユニットテスト通過
- [ ] 統合テスト通過
- [ ] Lint/Format チェック通過
- [ ] ドキュメント更新完了
- [ ] 既存機能への影響がないことの確認

---

**作成日**: 2025-09-04  
**更新日**: 2025-09-04  
**作成者**: Claude Code
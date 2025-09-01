## 失敗テストと原因マッピング

1. 共通: 401 Unauthorized 系  
   - 対象: create / get / insert-text / replace-text / update-document の各ツール + base-docs-tool.test 「GoogleAuthError を変換」  
   - 期待: errorCode が 'GOOGLE_AUTH_ERROR'  
   - 実装: `handleServiceError` は `GoogleAuthError` を `GoogleDocsError('GOOGLE_DOCS_AUTH_ERROR')` に変換。また既に `GoogleDocsError(GOOGLE_DOCS_AUTH_ERROR)` が返ってきた場合パススルー。  
   - ギャップ: Docs層でも汎用認証エラーコード 'GOOGLE_AUTH_ERROR' を期待するテスト仕様と不一致。

2. CreateDocumentTool フォルダID扱い  
   - 失敗: 「should validate folderId when provided」  
   - 期待: サービス呼び出し引数が ('Test Document', undefined)  
   - 実装: `folderId` が空文字 '' の場合 falsy なのでトリム分岐に入らずそのまま '' が渡る。  
   - ギャップ: 空文字は無視（undefined 扱い）するべきというテスト期待と不一致。スキーマで `.min(1)` していない点も一因。

3. GetDocumentTool の service 呼び出しシグネチャ  
   - 失敗: includeContent true/false/省略の 3 ケースすべて  
   - 期待: `docsService.getDocument(documentId, includeContentFlag)` の 2 引数呼び出し  
   - 実装: 1 引数のみ。includeContent はツール側で body を付ける/付けない判定。  
   - ギャップ: サービス層へフラグ委譲を期待するテストと設計差異。

4. GetDocumentTool 'documentId' 空白のみケース  
   - 失敗: 「should validate documentId format」(期待メッセージに 'Document not found')  
   - 実装: `documentIdValidation` は空白を 'Document ID cannot be empty' (400) としてバリデーションエラー。  
   - ギャップ: テストは 404 Not Found 系（`GoogleDocsNotFoundError`）に近い文言を期待。

5. BaseDocsTools.handleServiceError の Auth 変換  
   - 失敗: base-docs-tool.test の RED PHASE 部分 (本来最初は失敗想定だったが今は関数実装済み)  
   - 期待: GoogleAuthError → errorCode 'GOOGLE_AUTH_ERROR'  
   - 実装: 'GOOGLE_DOCS_AUTH_ERROR'  
   - ギャップ: (1) と同一原因。

6. ReplaceTextTool 空文字許容  
   - 失敗: 「should allow empty searchText and replaceText」  
   - 期待: searchText / replaceText 両方空でも OK（searchText 空許容）  
   - 実装: スキーマが `searchText.min(1)`、さらに実行時も `trim()===''` で明示的にエラー。  
   - ギャップ: 要件（削除や全体参照などのユースケース）とテスト期待 vs 実装の厳しさ。

7. UpdateDocumentTool メタデータ description  
   - 失敗: getToolMetadata の description 文字列不一致  
   - 期待: '... using the batchUpdate API'  
   - 実装: '... using the Google Docs API batch update system'  
   - ギャップ: 文字列差異のみ。

8. UpdateDocumentTool 空 requests 配列許容  
   - 失敗: 「should handle empty requests array」(期待 OK)  
   - 実装: スキーマ `requests.min(1)` + 追加の長さチェックでエラー返却。  
   - ギャップ: 空配列＝何もしない（No-op 成功）を許すテスト仕様と不一致。

9. UpdateDocumentTool 401 Unauthorized  
   - 失敗: Unauthorized テストで (1) と同じエラーコード不一致。

10. UpdateDocumentTool 「documentId 必須」メッセージ  
   - 失敗: 期待 'Document ID is required'  
   - 実装: validateWithSchema → 他サービスエラーを包み直し 'Invalid input data: Found X validation errors' 的メッセージ（validation.utils の変換結果）  
   - ギャップ: 必須エラーの直接的メッセージ透過なし。

11. UpdateDocumentTool requests 構造不正テスト  
   - 失敗: 期待 'validation' を含むメッセージ / 実際 'Cannot read properties of undefined (reading 'isErr')'  
   - 推測: テストが不正 requests を与え、サービス / 後続コードで `updateResult.isErr()` アクセス前に `updateResult` 取得失敗 (例: `docsService.batchUpdate` が undefined を返すモック設定ミス or 例外) か、空配列即エラーで別フローを期待したテストとの競合。 根本は (8) の仕様差異とエラーハンドリング分岐。

12. CreateDocumentTool フォルダ ID 空文字扱い以外のバリデーションメッセージ整合性  
   - スキーマで folderId の最小長未設定 → 空文字通過 → サービス呼び出しで不整合。  
   - テストは “空文字なら未指定扱い” を要求。

13. ReplaceTextTool matchCase デフォルト  
   - 現状: `matchCase = validatedParams.matchCase ?? true`  
   - 一般的にはデフォルト false を期待する可能性。今は failing list に含まれないが将来の不一致リスク。

14. InsertTextTool index 検証の一貫性  
   - スキーマ: index は 0 以上許容 (`min(0)` / 0-based 記述)  
   - `indexValidation` (BaseDocsTools): 0 をエラー（1以上）  
   - 現在失敗には出ていないが潜在的不整合（テストが 0 を使えば失敗する）。

## 問題カテゴリ別まとめ

- エラーコード正規化: Auth エラー ('GOOGLE_DOCS_AUTH_ERROR' vs 'GOOGLE_AUTH_ERROR')
- サービスメソッドシグネチャ差異: `getDocument(documentId, includeContent)` / `createDocument(title, folderId?)`
- バリデーション仕様差異: 空 searchText, 空 requests, 空白 documentId の扱い
- 文字列（定数）差異: ツール metadata description
- デフォルト値ポリシー: matchCase, folderId 空文字, index 0
- エラーメッセージ透過性: 必須項目の required_error をそのまま返さず再ラップ
- エッジケース例外ハンドリング: requests 不正構造時の落とし方

## 優先度順（テスト修復視点）

1. Auth エラーコード統一 (最も多くの失敗を解消)
2. GetDocumentTool の service 呼び出し引数（3件の失敗解消）
3. CreateDocumentTool の folderId 空文字→undefined 正規化
4. ReplaceTextTool の searchText 空許容ポリシー調整
5. UpdateDocumentTool: description 文字列・空 requests 許容・required メッセージ透過
6. documentId 空白時のエラー種別（404 期待なら NotFound 変換）
7. 基底 indexValidation と InsertText スキーマ差異の調整（潜在）
8. matchCase デフォルト仕様確認（潜在）

## 改修の指針（コード変更する場合）

- handleServiceError / もしくは各ツールの Auth エラー捕捉で 'GOOGLE_AUTH_ERROR' にマップ
- DocsService インターフェース（モックとの整合）をテスト期待シグネチャへ合わせるか、テストをツール側実装方針に揃えるか方針決定（後者ならテスト改修）
- validateWithSchema のエラー再ラップ時に元の required_error メッセージを優先採用
- 空 / 空白値の正規化ユーティリティ導入 (folderId, documentId)
- ReplaceText: searchText `.min(0)`（もしくは削除） + 空白のみの場合の扱いをテスト意図に合わせる
- Update: requests 空配列は No-op として success（replies=[] など）返却
- メタデータ description の定数化（テストで厳密一致させるため）

## リスク / 注意点

- エラーコード変更は既存クライアント利用箇所への影響あり（後方互換ポリシー要確認）
- DocsService シグネチャ変更は他利用箇所にも波及（型再生成・モック修正）
- 空 requests 許容は API 上の意味（Google Docs batchUpdate は空配列不可）→ 内部的に即 success ダミー返信を合成するか判断必要
- searchText 空許容は「全文置換」や「挿入」的挙動が未定義になりうる（仕様ドキュメント化要）

## 次のアクション候補（参考）

1. 仕様決定ドキュメントでテスト期待が正か実装方針が正か整理
2. 合意後、一括で:
   - エラーコードマッピング層追加
   - DocsService インターフェース調整
   - Validation ポリシー更新
   - メタデータ文字列修正
   - 追加回帰テスト（index=0, matchCase 省略など）

必要であれば、どこから直すか優先タスク化もお手伝いできます。どの項目から着手したいか教えてください。
ツール命名を PDR (Primary Domain Resource) 方式で再編する実装プランです（今回は計画のみ・コード変更なし）。

## 1. 命名ポリシー（最終）
形式: google-workspace__<service>__<action-or-action-object>
- PDR が単一のサービス:
  - docs: document 固有 → create / get / update
  - calendar: event 固有 → list / get / create / delete / quick-add
- 複数リソース/粒度混在:
  - drive: list-files / get-file / get-file-content
  - sheets: list-spreadsheets / create-spreadsheet / read-range / write-range / append-rows / add-sheet
- 編集系特殊: insert-text / replace-text
- 一覧: list-<plural>
- 単体取得: get-<singular>
- 派生内容: get-<resource>-content
- 追加: add-<unit> / append-<sequence>

## 2. 対象ツール分類
A. PDR 省略適用: docs, calendar  
B. 明示維持: drive, sheets  
C. 編集特殊: insert-text / replace-text

## 3. 変更マッピング（確定）
| 現在 | 変更後 |
| --- | --- |
| google-workspace__docs__create | google-workspace__docs__create |
| google-workspace__docs__get | google-workspace__docs__get |
| google-workspace__docs__update | google-workspace__docs__update |
| google-workspace__docs__insert-text | 変更なし |
| google-workspace__docs__replace-text | 変更なし |
| google-workspace__drive-list | google-workspace__drive__list-files |
| google-workspace__drive-get | google-workspace__drive__get-file |
| google-workspace__drive-get-content | google-workspace__drive__get-file-content |
| google-workspace__calendar-list-events | google-workspace__calendar__list |
| (create-event) | google-workspace__calendar__create |
| (get-event) | google-workspace__calendar__get |
| (delete-event) | google-workspace__calendar__delete |
| (quick-add-event) | google-workspace__calendar__quick-add |
| sheets-list | google-workspace__sheets__list-spreadsheets |
| sheets-create | google-workspace__sheets__create-spreadsheet |
| sheets-read | google-workspace__sheets__read-range |
| sheets-write | google-workspace__sheets__write-range |
| sheets-append | google-workspace__sheets__append-rows |
| sheets-add-sheet | google-workspace__sheets__add-sheet |

※ Calendar は PDR 適用で “events” を外す。Drive は複数リソース前提で明示維持。Docs は “document” 省略。

## 4. 実装ステップ（チェックリスト）
1. 抽出: grep "getToolName()" で全ファイル列挙（確認のみ）
2. 置換: 各 Tool の getToolName() を新名称へ編集
3. テスト更新: 期待値文字列 expect(tool.getToolName()) 修正
4. 依存チェック: 文字列比較 / dispatch / allowlist に旧名がないか grep（drive-list など）
5. ログ/コメント整備: ログ内ハードコードされた旧ツール名を更新
6. README: “Tool Naming Convention” 追加（PDR ルール明記）
7. 検証:
   - npm test
   - grep 旧名称（0 件で完了）
8. 自動検証追加（任意）:
   - scripts/validate-tool-names.ts（正規表現検査）
   - package.json に "lint:tools"
   - CI に組込み
9. ADR 作成: docs/adr/NN-tool-naming.md に背景・決定
10. コミット: feat: normalize tool names (in-dev, no migration)

## 5. 作業順序（最短パス）
- (1)(2)(3) を一括編集 → テスト実行 → (4)(5) → (6) → (8) → (9) → コミット

## 6. バリデーション仕様（スクリプト案）
- 正規表現: ^google-workspace__([a-z0-9]+)__([a-z0-9]+(-[a-z0-9]+)*)$
- PDR 適用許可テーブル:
  - docs: create|get|update|insert-text|replace-text
  - calendar: list|get|create|delete|quick-add
- 非 PDR サービス: action にリソース語必須（例: list-files）

## 7. 想定作業時間
- 編集＋テスト: 45m
- README / ADR / スクリプト: 30–40m
- 合計: 約 1.5h

## 8. 判断基準（完了条件）
- 全ツール新規命名規約適合
- テスト緑
- 旧名称 grep 0 件
- README/ADR 更新済
- バリデーションスクリプト動作

## 9. 備考
- 将来 slides 追加時: 単一 PDR (slide vs presentation) が曖昧 → 常に動詞-リソース方式推奨（list-presentations など）
- 破壊的変更配慮不要のため alias 実装はスキップ

必要なら次に具体的なファイル修正に移行可能。指示ください。
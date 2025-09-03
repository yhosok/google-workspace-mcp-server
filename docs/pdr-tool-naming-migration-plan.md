# PDR命名規則への移行実装プラン

## 概要

MCPツール命名を PDR (Primary Domain Resource) 方式で再編する実装プラン。

## 命名ポリシー（最終）

形式: `google-workspace__<service>__<action-or-action-object>`

### PDR適用パターン
- **PDRが単一のサービス**: 
  - docs: document 固有 → create / get / update
  - calendar: event 固有 → list / get / create / delete / quick-add
- **複数リソース/粒度混在**:
  - drive: list-files / get-file / get-file-content
  - sheets: list-spreadsheets / create-spreadsheet / read-range / write-range / append-rows / add-sheet
- **編集系特殊**: insert-text / replace-text
- **一覧**: list-<plural>
- **単体取得**: get-<singular>
- **派生内容**: get-<resource>-content
- **追加**: add-<unit> / append-<sequence>

## 変更対象ツール一覧

### 1. Drive Tools (3ツール)
| 現在 | 変更後 |
| --- | --- |
| `google-workspace__drive-list` | `google-workspace__drive__list-files` |
| `google-workspace__drive-get` | `google-workspace__drive__get-file` |
| `google-workspace__drive-get-content` | `google-workspace__drive__get-file-content` |

### 2. Calendar Tools (6ツール)
| 現在 | 変更後 |
| --- | --- |
| `google-workspace__calendar-list` | `google-workspace__calendar__list-calendars` |
| `google-workspace__calendar-list-events` | `google-workspace__calendar__list` |
| `google-workspace__calendar-create-event` | `google-workspace__calendar__create` |
| `google-workspace__calendar-get-event` | `google-workspace__calendar__get` |
| `google-workspace__calendar-delete-event` | `google-workspace__calendar__delete` |
| `google-workspace__calendar-quick-add` | `google-workspace__calendar__quick-add` |

### 3. Sheets Tools (6ツール)
| 現在 | 変更後 |
| --- | --- |
| `sheets-list` | `google-workspace__sheets__list-spreadsheets` |
| `sheets-read` | `google-workspace__sheets__read-range` |
| `sheets-write` | `google-workspace__sheets__write-range` |
| `sheets-append` | `google-workspace__sheets__append-rows` |
| `sheets-add-sheet` | `google-workspace__sheets__add-sheet` |
| `sheets-create` | `google-workspace__sheets__create-spreadsheet` |

### 4. Docs Tools (変更なし)
| 現在 | 変更後 |
| --- | --- |
| `google-workspace__docs__create` | 変更なし |
| `google-workspace__docs__get` | 変更なし |
| `google-workspace__docs__update` | 変更なし |
| `google-workspace__docs__insert-text` | 変更なし |
| `google-workspace__docs__replace-text` | 変更なし |

## 実装手順

### Phase 1: Tool実装ファイルの更新
各ツールクラスの`getToolName()`メソッドを新しい命名規則に更新:
- `src/tools/drive/*.tool.ts` (3ファイル)
- `src/tools/calendar/*.tool.ts` (6ファイル)
- `src/tools/sheets/*.tool.ts` (6ファイル)

### Phase 2: テストファイルの更新
期待値の文字列を新しいツール名に更新:
- 各ツールの個別テストファイル (15ファイル)
- `src/tools/base/tool-schema.test.ts`
- `src/config/index.test.ts`
- `src/registry/integration.test.ts`
- `src/registry/sheets/sheets-service-module.test.ts`
- `src/registry/drive/drive-service-module.test.ts`
- `src/services/access-control.service.test.ts`
- `src/resources/sheets-resources.test.ts`
- `src/utils/validation.utils.test.ts`

### Phase 3: AccessControlServiceの検証
`parseToolName`メソッドが新しい命名パターンを正しく処理できることを確認

### Phase 4: 検証とテスト
- `npm test`で全テストが通ることを確認
- `npm run lint`でlintが通ることを確認
- 古いツール名がコードベースに残っていないことをgrep確認

## 対象ファイル詳細

### Tool実装ファイル (15ファイル)
```
src/tools/drive/list-files.tool.ts
src/tools/drive/get-file.tool.ts
src/tools/drive/get-file-content.tool.ts
src/tools/calendar/list-calendars.tool.ts
src/tools/calendar/list-events.tool.ts
src/tools/calendar/create-event.tool.ts
src/tools/calendar/get-event.tool.ts
src/tools/calendar/delete-event.tool.ts
src/tools/calendar/quick-add.tool.ts
src/tools/sheets/list.tool.ts
src/tools/sheets/read.tool.ts
src/tools/sheets/write.tool.ts
src/tools/sheets/append.tool.ts
src/tools/sheets/add-sheet.tool.ts
src/tools/sheets/create-spreadsheet.tool.ts
```

### テストファイル (多数)
- 各ツールの`.test.ts`ファイル
- 統合テストファイル
- 設定テストファイル
- バリデーションテストファイル

## 命名規則の詳細

### PDR省略適用サービス
- **docs**: documentが固有なので省略 → create/get/update
- **calendar**: eventが固有なので省略 → list/get/create/delete/quick-add

### リソース明示サービス
- **drive**: 複数リソース扱うため明示 → list-files/get-file/get-file-content
- **sheets**: 粒度混在のため明示 → list-spreadsheets/read-range/write-range/append-rows

### 特殊ケース
- docs の insert-text/replace-text は編集系特殊操作として維持
- calendar の list-calendars は list だけだと曖昧なため calendars を明示

## 作業見積もり
- Phase 1 (Tool実装): 15分
- Phase 2 (テスト更新): 30分  
- Phase 3 (検証): 10分
- Phase 4 (最終確認): 15分
- **合計: 約1時間10分**

## 完了条件
- [ ] 全ツール新規命名規約適合
- [ ] `npm test` 全テスト通過
- [ ] `npm run lint` lint チェック通過
- [ ] 旧名称 grep 0件
- [ ] AccessControlService の parseToolName が正常動作

## リスク・注意事項
- 破壊的変更のため、既存のツール呼び出しコードへの影響
- テストカバレッジが十分であることの確認
- 設定ファイルやドキュメント内の古い名称の見落とし
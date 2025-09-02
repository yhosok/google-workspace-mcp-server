## サマリ
失敗: 5スイート / 75テスト（Access Control “RED PHASE” 系）。  
根本原因は「新しいアクセス制御統合インタフェース（executeWithAccessControl / validateAccessControl 拡張 / フォルダ抽出 / operation 判定 / context 付与）」がテスト期待仕様と不一致なため。  
既存実装は一部（isWriteOperation, getRequiredFolderIds 等）があるが、テストが想定する契約・戻り値・引数構造とズレている。

## 主要な修正ポイント（優先順）
1. executeWithAccessControl メソッド未実装（Drive / Sheets / Docs 共通）  
   - 例: drive: TypeError: testTool.executeWithAccessControl is not a function  
   - 期待: executeImpl をラップし (a) アクセス制御実行 (b) Result<T,E> を返却 (c) read/write 判定 (d) context 構築。
2. validateAccessControl の引数契約不一致  
   - テストは「既に operation / serviceName / toolName / context を含む request オブジェクト」を渡している（例: base-drive-tool.test.ts: lines 977, 1000 付近）。  
   - 現行実装は (params, requestId) を受け取り toolName や operation を内部推測。  
   - 解決案:  
     a) オーバーロード: validateAccessControl(requestObj, requestId) と validateAccessControl(params, requestId) を両立  
     b) もしくは内部で request.shape を判別し context / operation を抽出。  
3. AccessControlService.validateAccess 呼び出し時の渡し方不足  
   - テスト期待: validateAccess({ operation, serviceName, toolName, resourceType, targetFolderId, context })  
   - 現行: Drive/Sheets/Docs 実装では context が含まれていない（resourceType は Drive で不一致、後述）。  
4. Drive の resourceType 値不一致  
   - 期待: 'drive_file'  
   - 実装: 'file'（base-drive-tool.ts 約 line 480 付近）。  
5. エラーハンドリング / エラー整形  
   - validateAccessControl 内で AccessControlService 側が例外（例: TypeError）を投げるケースで GoogleAccessControlError に正しくラップしつつ「元インスタンス保持 & stack/context 保存」期待（tests: base-drive-tool.test.ts lines 901, 924 など）。  
   - 現行は wrap するが request/context 情報が不足。  
6. getRequiredFolderIds の抽出ロジック差分  
   - テスト期待フィールド: parentFolderId, targetFolderId, nested オブジェクト内の folder / folderId / targetFolderId など（例: Docs: 1221–1223 で "target-789" 期待 / Sheets: 1335–1337 で target など）。  
   - 現行:  
     - Drive: folderId / parentFolderId / parents[] / metadata.folderId / file.parents のみ。  
     - Sheets/Docs: folderId / parentFolderId / metadata.folderId のみ。  
   - 追加候補: targetFolderId, destinationFolderId, nested.*.folderId, nested.*.targetFolderId 走査（深さ 1–2）  
7. isWriteOperation 判定パターン不足（特に Sheets）  
   - 失敗例（Sheets）: add-sheet / add のような操作 → patterns に 'add' 未登録（base-sheets-tool.ts）。  
   - 追加候補: 'add', 'move', 'insert', 'replace'（サービス横断で統一）。  
8. executeWithAccessControl の read オペレーション処理  
   - テスト名称 “should skip access control validation for read operations” だが実際には validateAccess 呼び出しを検証している（drive test lines 820–840 付近で呼び出し期待）。  
   - 期待仕様: read でも validateAccess は実行（=「skip」は “書き込み用追加検証をスキップ” 程度の意味）。  
9. requestId / logging 情報  
   - executeWithAccessControl で requestId 生成 or 受け渡し後 validateAccessControl に同一 ID を渡す必要。  
10. Drive/Sheets/Docs の validateAccessControl 返却型  
    - Result<void, GoogleWorkspaceError> はテストが isOk/isErr を期待しているので継続で可。ただし request オブジェクト受領時も同型で返す。
11. Backward Compatibility  
    - 既存 registerTool が直接 executeImpl を呼ぶため、executeWithAccessControl を組み込むなら registerTool 内の実行経路を切り替え（ただし既存ツールへの影響を最小化するため feature flag 的分岐推奨）。  
12. Drive テストで context 内に fileId / name / mimeType 等が含まれることを期待  
    - 現行 validateAccessControl は raw params から folderId 抽出だけで context 未構築。  
    - 対応: context = (params as object) を sanitize（不要フィールドマスク）してそのまま渡す。

## 失敗カテゴリ別詳細

### Drive (base-drive-tool.test.ts)
- executeWithAccessControl 不在 ⇒ TypeError（lines 832, 859 など）
- validateAccessControl 引数ミスマッチ（テストは request オブジェクト渡し）⇒ context/targetFolderId 解析失敗（lines 1058, 1090, 1121）
- resourceType 期待 'drive_file' vs 実装 'file'
- context プロパティ欠落 ⇒ validateAccess 呼び出しカウント 0 or shape 不一致
- エラー変換/保持テスト失敗（lines 903, 926）
- getRequiredFolderIds：request.context.parentFolderId に対応しておらず targetFolderId 抽出失敗

### Sheets (base-sheets-tool.test.ts)
- 同様に executeWithAccessControl 欠如
- isWriteOperation が 'add' を write と判定できず（line 1265, 1300）
- validateAccessControl 呼び出し自体されず（calls: 0）→ accessControlService を渡すインスタンス未使用 or executeWithAccessControl 経路未実装
- getRequiredFolderIds: targetFolderId / ネスト探索不足（lines 1337, 1391）
- エラー系（lines 1122, 1153, 1175, 1197, 1214, 1557, 1580）: validateAccessControl のシグネチャ / エラーラップ不一致

### Docs (base-docs-tool.test.ts)
- executeWithAccessControl 不在（lines 1352, 1371, 1398, 1425）
- validateAccessControl の context / targetFolderId 欠落（lines 932, 956, 980 など）
- getRequiredFolderIds: targetFolderId 抽出失敗（lines 1223, 1277）
- エラーラップ（lines 1007, 1038, 1060, 1082, 1099, 1469, 1492）同様

## 推奨実装方針（概要）
(1) 型定義 AccessControlRequest（operation, serviceName, toolName, context, targetFolderId?, resourceType）を共通化。  
(2) validateAccessControl オーバーロード:  
    - A: (params: unknown, requestId: string)  
    - B: (request: Partial<AccessControlRequest> & { operation?: string }, requestId: string)  
    内部で正規化 → 完全な AccessControlRequest。  
(3) getRequiredFolderIds を拡張:  
    - 走査対象キー: folderId, parentFolderId, targetFolderId, destinationFolderId  
    - 浅いネスト (context / metadata / file / payload など) を 1–2 階層探索  
(4) isWriteOperation パターン統一: ['create','update','append','write','clear','delete','set','add','insert','replace','move','copy','modify','edit']  
(5) executeWithAccessControl:  
    - requestId 生成  
    - params から context 構築（浅いコピー）  
    - operation 推定（上記 isWriteOperation / あるいはツール名 prefix 'create' など）  
    - AccessControlService 有効なら validateAccessControl → isErr ならそのまま err  
    - 成功後 executeImpl 呼び出し  
    - Result<T,E> で返却  
(6) Drive の resourceType を 'drive_file' に変更  
(7) AccessControlService.validateAccess 呼び出し引数に context を含める  
(8) 例外捕捉: 予期せぬ例外は GoogleAccessControlError へラップし originalError 保持  
(9) registerTool 内で executeImpl 直接呼出 → executeWithAccessControl に切替（後方互換のため fallback）  

## 影響とリスク
- registerTool 実行経路変更で既存ツール挙動が変わる可能性 → feature flag or optional enable フィールド推奨。  
- フォルダ ID 抽出ロジック拡張により従来不要だったアクセス制限が新たに掛かる可能性 → リリースノート要。  
- isWriteOperation 拡張で従来 read と扱っていた一部ツールが write 判定に変わるリスク。

## 検証ステップ（修正後）
1. 全 base-* ツールに executeWithAccessControl 実装  
2. registerTool が executeWithAccessControl を使用  
3. npm test 実行で 75 failing → 0 を確認  
4. 新規ユニットテスト（追加）:  
   - add-sheet → isWriteOperation = true  
   - getRequiredFolderIds ネスト抽出（context.metadata.inner.targetFolderId）  

## 追加改善候補（任意）
- 共通アクセ制御ヘルパ (access-control.utils.ts) 作成し重複ロジック削減  
- Zod で AccessControlRequest Schema を定義し内部正規化前に型検証  
- ログに accessControlRequest.hash（安易な JSON ハッシュ）追加で追跡性向上

## まとめ（最小修正セット）
- executeWithAccessControl 追加（3クラス）  
- validateAccessControl インタフェース整合 + context/targetFolderId/resourceType 修正  
- isWriteOperation パターン拡張（特に 'add'）  
- getRequiredFolderIds 拡張（targetFolderId 等）  
- Drive resourceType を 'drive_file' に変更  
- 例外ラップ強化と context 付与

上記対応で今回 5 失敗スイートの通過が見込まれます。追加で詳細コード例が必要なら指示ください。
Google Workspace MCP Server 実装プラン

1. プロジェクト初期化とセットアップ

- package.json作成: TypeScriptプロジェクトとして初期化
  - 必要な依存関係: @modelcontextprotocol/sdk, googleapis, @google-cloud/local-auth, zod
  - 開発依存関係: typescript, @types/node, jest, @types/jest, tsx
- TypeScript設定: tsconfig.jsonの作成（ES modules, strict mode有効）
- プロジェクト構造:
/src
  /services   # Google APIサービス層
  /tools     # MCPツール実装
  /resources # MCPリソース実装
  /config    # 設定管理
  /types     # 型定義
  index.ts   # エントリポイント
/tests # テストファイル

1. TDDサイクル - Red Phase（テストファースト）

2.1 認証テスト作成

- サービスアカウント認証のテスト
- 環境変数からの設定読み込みテスト
- Google APIクライアント初期化テスト

2.2 Google Sheets APIテスト作成

- スプレッドシート一覧取得テスト
- スプレッドシートデータ読み取りテスト
- スプレッドシートデータ書き込みテスト
- 範囲指定での読み書きテスト

2.3 MCPサーバーテスト作成

- ツール登録テスト
- リソース登録テスト
- リクエストハンドリングテスト

3. Green Phase - 実装

3.1 設定管理層 (/src/config/)

- 環境変数管理:
- GOOGLE_SERVICE_ACCOUNT_KEY_PATH: サービスアカウントキーのパス
- GOOGLE_DRIVE_FOLDER_ID: アクセス対象のDriveフォルダID
- GOOGLE_WORKSPACE_SCOPES: 必要なAPIスコープ
- Zodスキーマ: 環境変数のバリデーション

3.2 認証サービス (/src/services/auth.ts)

- サービスアカウント認証の実装
- Google APIクライアントの初期化
- 認証トークンの管理

3.3 Google Sheets サービス (/src/services/sheets.ts)

- Sheets APIクライアントのラッパー実装
- 基本操作メソッド:
  - listSpreadsheets(): フォルダ内のスプレッドシート一覧
  - getSpreadsheet(): スプレッドシート情報取得
  - readRange(): 範囲データ読み取り
  - writeRange(): 範囲データ書き込み
  - appendData(): データ追加

3.4 MCPツール実装 (/src/tools/)

- sheets-list: Drive内のスプレッドシート一覧取得
- sheets-read: スプレッドシートデータ読み取り
  - パラメータ: spreadsheetId, range
- sheets-write: スプレッドシートデータ書き込み
  - パラメータ: spreadsheetId, range, values
- sheets-append: スプレッドシートへのデータ追加
  - パラメータ: spreadsheetId, range, values

3.5 MCPリソース実装 (/src/resources/)

- spreadsheet-schema: スプレッドシートの構造情報
- spreadsheet-data: スプレッドシートの静的データ参照

3.6 メインサーバー (/src/index.ts)

- McpServerインスタンスの作成
- ツールとリソースの登録
- StdioServerTransportでの接続
- エラーハンドリング

4. Refactor Phase - リファクタリング

4.1 拡張性の確保

- 抽象化: Google Service基底クラスの作成
abstract class GoogleService {
  protected auth: OAuth2Client
  abstract getServiceName(): string
}
- プラグイン構造: 新サービス追加を容易にする設計
- インターフェース定義: 各サービスの共通インターフェース

4.2 エラーハンドリング改善

- カスタムエラークラスの実装
- リトライロジックの追加
- 詳細なエラーメッセージ

4.3 ロギングとモニタリング

- 構造化ログの実装
- デバッグモードの追加

5. 将来の拡張に向けた設計

5.1 サービス追加の準備

- Google Drive API: ファイル管理機能
- Google Docs API: ドキュメント操作
- Google Calendar API: カレンダー管理
- 各サービスは独立したモジュールとして実装

5.2 設定の柔軟性

- サービスごとの有効/無効切り替え
- スコープの動的管理
- 複数のサービスアカウント対応

6. ドキュメントとテスト

- README.md: セットアップ手順、使用方法
- 各ツールの使用例
- 統合テストの実装
- CI/CD設定（GitHub Actions）

実装順序

1. プロジェクト初期化と基本設定
2. 認証サービスのテストと実装
3. Google Sheets APIの基本機能（read/write）
4. MCPサーバーとツール統合
5. リファクタリングと最適化
6. ドキュメント作成
7. 追加機能の実装

この設計により、TDDアプローチで品質を保ちながら、将来的な拡張にも対応できる柔軟な構造を実現します。

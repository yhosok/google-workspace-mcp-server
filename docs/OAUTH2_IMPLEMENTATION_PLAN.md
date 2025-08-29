# OAuth2ユーザー認証実装計画

## 概要
現在のサービスアカウント認証に加えて、ユーザーが自分のGoogle Workspaceアカウントで認証できるOAuth2認証機能を実装します。

## アーキテクチャ設計

### 1. 認証タイプの追加
- 環境変数で認証タイプを選択可能にする（`GOOGLE_AUTH_TYPE`: "service-account" | "oauth2"）
- 既存のサービスアカウント認証との互換性を維持

### 2. OAuth2フロー実装
- **Installed Application Flow**（デスクトップアプリ向けフロー）を採用
- ローカルHTTPサーバーを立ち上げて認可コードを受け取る
- アクセストークンとリフレッシュトークンを取得・管理

### 3. トークン管理戦略
- **keytar**ライブラリを使用してOSのセキュアストレージに保存
  - macOS: Keychain
  - Windows: Credential Manager
  - Linux: Secret Service API
- フォールバック: 暗号化されたファイルストレージ（`~/.config/google-workspace-mcp/`）

## 実装手順（TDD Red-Green-Refactorサイクル）

### Phase 1: 基盤準備とテスト作成 (Red)
1. **依存ライブラリのインストール**
   - `keytar`: セキュアストレージ用
   - `open`: ブラウザ起動用
   - `server-destroy`: HTTPサーバー管理用

2. **型定義とインターフェース追加**
   - `AuthType`列挙型の追加
   - `OAuth2Config`インターフェースの追加
   - `TokenStorage`インターフェースの定義

3. **テストファイル作成**
   - `oauth2.service.test.ts`: OAuth2サービスのユニットテスト
   - `token-storage.service.test.ts`: トークンストレージのテスト
   - `auth-factory.test.ts`: 認証ファクトリーのテスト

### Phase 2: OAuth2実装 (Green)

1. **TokenStorageServiceの実装**
   ```typescript
   src/services/token-storage.service.ts
   - saveTokens(tokens): セキュアストレージに保存
   - getTokens(): 保存されたトークンを取得
   - deleteTokens(): トークンを削除
   ```

2. **OAuth2Serviceの実装**
   ```typescript
   src/services/oauth2.service.ts
   - authenticate(): OAuth2フロー実行
   - refreshAccessToken(): トークン更新
   - getAuthClient(): 認証済みクライアント取得
   ```

3. **AuthFactoryの実装**
   ```typescript
   src/services/auth-factory.ts
   - createAuthService(type): 認証タイプに応じたサービス作成
   ```

4. **設定の拡張**
   ```typescript
   src/config/index.ts
   - GOOGLE_AUTH_TYPE環境変数の追加
   - OAuth2クライアントID/シークレットの設定
   ```

### Phase 3: 統合とリファクタリング (Refactor)

1. **AuthServiceの拡張**
   - 基底クラス化して共通機能を抽出
   - ServiceAccountAuthServiceとOAuth2AuthServiceに分離

2. **ServiceRegistryの更新**
   - 認証タイプに応じた適切なAuthServiceを初期化

3. **エラーハンドリングの強化**
   - OAuth2特有のエラークラス追加
   - トークン期限切れの自動リトライ

4. **ユーザーエクスペリエンスの改善**
   - 初回認証時のガイダンス表示
   - トークンの有効期限表示
   - 再認証が必要な場合の通知

## テスト戦略

### 1. ユニットテスト
- 各サービスクラスの個別機能テスト
- モックを使用したOAuth2フロー検証
- トークン管理ロジックのテスト

### 2. 統合テスト
- ServiceRegistryとの統合テスト
- 認証切り替えのテスト
- エンドツーエンドのフロー検証

### 3. 手動テスト項目
- 実際のGoogle OAuth2認証フロー
- トークンの自動更新
- 各OSでのセキュアストレージ動作確認

## セキュリティ考慮事項

### 1. トークン保護
- リフレッシュトークンは必ずセキュアストレージに保存
- ファイル保存時は権限を600に設定
- メモリ内のトークンも適切にクリア

### 2. スコープ管理
- 必要最小限のスコープのみ要求
- スコープは設定で変更可能に

### 3. エラー処理
- 認証エラーの詳細をログに記録しない
- ユーザーに適切なエラーメッセージを表示

## 実装優先順位

### 1. 必須機能（Phase 1-2）
- OAuth2基本フロー
- トークン管理
- 認証切り替え機能

### 2. 推奨機能（Phase 3）
- セキュアストレージ統合
- 自動トークン更新
- エラーリカバリー

### 3. オプション機能（将来）
- 複数アカウント管理
- トークンの手動インポート/エクスポート
- Web UIでの認証オプション

## 調査結果

### 現在の認証実装
- `AuthService`クラスでサービスアカウント認証のみ実装
- `google.auth.GoogleAuth`を使用してJSONキーファイルから認証情報を読み込み
- リトライ機能とタイムアウト制御を実装済み
- `ServiceRegistry`パターンでサービス管理

### Google Auth Library (Node.js) の機能
- OAuth2Clientクラスで完全なOAuth2フロー対応
- トークンの自動更新機能
- Installed Application Flow のサンプルコード豊富
- アクセストークンとリフレッシュトークンの管理機能

### ベストプラクティス (Gemini調査結果)
- CLIツールでは「Installed Application Flow」が標準
- リフレッシュトークンはOSのセキュアストレージに保存
- `access_type: 'offline'`でリフレッシュトークンを確実に取得
- 最小権限の原則でスコープを制限

この計画に従って実装を進めることで、既存の実装パターンを維持しながら、セキュアで使いやすいOAuth2ユーザー認証を追加できます。
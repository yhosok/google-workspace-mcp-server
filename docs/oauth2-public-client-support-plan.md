# OAuth2認証のPublic Client対応改善実装計画

## 背景
Google Workspace MCP ServerのOAuth2実装において、Public Client（client secretなし + PKCE利用）のサポートに不整合があることが判明しました。現在の実装はPKCE対応済みですが、設定バリデーション層で制限されています。

## 問題点の分析結果

### 1. 設計と環境変数バリデーションの不整合
- `OAuth2AuthProvider` はPKCE実装済みでpublic client（client secretなし）対応設計
- しかし `validateAuthConfig` が `GOOGLE_OAUTH_CLIENT_SECRET` を必須化して矛盾
- `AuthFactory.extractOAuth2Config` も `clientSecret!` で非null前提

### 2. デフォルト値の部分的実装
- redirectUri: ✅ 既にフォールバック実装済み
- scopes: ✅ 既にフォールバック実装済み（DEFAULT_SCOPES使用）
- ただし、これらのフォールバックが効果的に使われていない

### 3. 最低要件判定の問題
- 現状: 「service-account もしくは (clientId + secret)」のどちらか必須
- 期待: 「service-account か (clientId + secret) か (clientId 単独 + PKCE)」を許容

## 実装計画（TDD Red-Green-Refactorサイクル）

### Phase 1: Red - テスト作成

#### 1.1 config/index.test.ts に以下のテストケースを追加：
- Public client（client IDのみ）での起動成功テスト
- Client secretなしでのOAuth2モード動作テスト
- デフォルト値適用の検証テスト

#### 1.2 auth-factory.test.ts に追加：
- Public clientでのprovider作成成功テスト
- Client secretなしでの認証フロー検証

### Phase 2: Green - 実装修正

#### 2.1 src/config/index.ts の validateAuthConfig 修正：
- OAuth2モードでclientSecretをoptionalに変更
- 最低要件判定ロジックを更新（clientIDのみでもOK）

#### 2.2 src/services/auth/auth-factory.ts の修正：
- `determineAuthType`: clientIDのみでもoauth2と判定
- `validateConfig`: public client対応の検証ロジック追加
- `extractOAuth2Config`: clientSecretをundefinedで扱える実装

#### 2.3 ログとエラーメッセージの改善：
- 起動時にpublic/confidentialクライアント種別を明示
- エラーメッセージでPKCE対応を説明

### Phase 3: Refactor - コード品質改善

#### 3.1 型定義の整理：
- OAuth2Configでoptional client secretを明確化
- Public/Confidentialクライアントの型分離

#### 3.2 ドキュメント更新：
- CLAUDE.mdにpublic client設定例を追加
- .env.exampleにPKCE使用時の設定コメント追加
- READMEにセキュリティベストプラクティスを記載

#### 3.3 統合テストの追加：
- End-to-endでのpublic client認証フロー検証
- Token refresh動作確認

## 修正ポイント詳細

### 1. validateAuthConfig（src/config/index.ts:223-224）
```typescript
// 現在: clientSecretを必須化
if (!GOOGLE_OAUTH_CLIENT_SECRET) {
  throw new Error('GOOGLE_OAUTH_CLIENT_SECRET is required...')
}
// 修正後: clientSecretをoptionalに
// この条件を削除
```

### 2. 最低要件判定（src/config/index.ts:268-269）
```typescript
// 現在
const hasOAuth2 = !!(GOOGLE_OAUTH_CLIENT_ID && GOOGLE_OAUTH_CLIENT_SECRET);
// 修正後
const hasOAuth2 = !!GOOGLE_OAUTH_CLIENT_ID;
```

### 3. AuthFactory.extractOAuth2Config（src/services/auth/auth-factory.ts:420-421）
```typescript
// 現在
clientSecret: config.GOOGLE_OAUTH_CLIENT_SECRET!,
// 修正後
clientSecret: config.GOOGLE_OAUTH_CLIENT_SECRET,
```

## セキュリティ考慮事項

### Public Client vs Confidential Client
- **Public Client**: デスクトップアプリ、CLIツール等でclient secretを安全に保存できない場合
- **Confidential Client**: サーバーサイドアプリケーションでclient secretを安全に保存できる場合

### PKCE (Proof Key for Code Exchange)
- OAuth2のセキュリティ拡張（RFC 7636）
- Authorization Code Intercepteion Attack の防止
- Public Client使用時は必須、Confidential Clientでも推奨

## 実装優先順位

1. **必須**: config validation修正（Phase 1-2）
2. **必須**: AuthFactory修正（Phase 2）
3. **推奨**: ログ改善・ドキュメント更新（Phase 3）
4. **オプション**: 型定義の詳細整理

## 期待される結果

この計画により、既存のPKCE実装を活かしながら、以下を実現します：

1. Public ClientでのOAuth2認証が正常に動作
2. Confidential Clientとの互換性を維持
3. セキュアなデフォルト設定の提供
4. 明確なエラーメッセージとドキュメント

## テスト戦略

### ユニットテスト
- Config validation層のテスト
- AuthFactory層のテスト
- OAuth2AuthProvider層のテスト（既存）

### 統合テスト
- End-to-end認証フローのテスト
- Token refresh動作のテスト

### 手動テスト
- 実際のGoogle OAuth2との連携テスト
- 各種エラーケースの動作確認
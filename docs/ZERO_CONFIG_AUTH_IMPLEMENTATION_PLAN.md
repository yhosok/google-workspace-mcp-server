# Zero-Config / Progressive OAuth2 認証実装計画 (Proposal)

> 本ドキュメントは README の "(Proposal) Simplified Zero-Config Authentication Flow" セクションに対応する詳細な実装計画です。まだ未実装であり、ここに記載された API / CLI は将来案です。コード変更の導入は段階的に行い、既存の Service Account / 既存 OAuth2 フローとの 100% 後方互換を維持します。

---
## 1. 目的 / ゴール
### 1.1 最終 UX ゴール
ユーザが **環境変数や設定ファイルを一切事前準備せず**:
```
npx google-workspace-mcp-server
```
を初回実行 → ブラウザが自動で開き承認 → トークンが安全にキャッシュ → 以後は完全自動リフレッシュ / 再認証不要。

### 1.2 成功基準 (Success Criteria)
| カテゴリ | 指標 | 基準 |
|----------|------|------|
| 初回セットアップ時間 | 手動入力/設定数 | クライアント ID 埋め込みのみ (ユーザ0) |
| 再認証頻度 | 通常利用 | 90日以内に追加スコープ要求 or トークン失効時のみ |
| 後方互換 | 既存 env モード | 既存スクリプト/CI 変更不要 |
| セキュリティ | 秘匿情報漏えい | リフレッシュトークン非ログ化 & 暗号化保存 |
| テスト | カバレッジ | 新規コンポーネント ≥ 90% 行カバレッジ |

### 1.3 非ゴール (Out of Scope 初期フェーズ)
- 複数 Google アカウントの同時並行プロファイル切替 (Phase 5+ 案)
- Web UI (ブラウザ外) でのトークン管理 GUI
- 組織内マルチユーザ共有（サービスアカウントや Identity Federation で別途カバー）

---
## 2. 全体アーキテクチャ
```
┌─────────────────────────────────────┐
│         CredentialResolver Chain     │
│  (resolveCredentials(): AuthContext) │
└─────────────────────────────────────┘
        │ 優先度順
        ▼
 1. TokenCache (Keychain / Encrypted File)
 2. ADC (gcloud / Metadata Server)
 3. PKCE Loopback Flow (Local ephemeral server)
 4. Device Code Flow (fallback / --no-browser)
 5. Service Account (明示指定 / legacy env)

AuthContext {
  accessToken,
  refreshToken?,
  expiry,
  scopes[],
  clientId,
  source: 'cache' | 'adc' | 'pkce' | 'device' | 'service-account'
}
```

### 2.1 追加/変更コンポーネント概要
| コンポーネント | 役割 | 新規 / 変更 |
|---------------|------|-------------|
| `CredentialResolver` | 優先度チェーン組立 & 実行 | 新規 |
| `TokenCache` | TokenStorageService をラップしメタデータ保持 | 新規 (ラッパ) |
| `PkceLoopbackServer` | 一時 HTTP サーバ + state/PKCE 実装 | 新規 |
| `DeviceCodeFlow` | デバイスコードポーリング実装 | 新規 |
| `AuthModeDetector` | 環境変数 / CLI フラグ解析 | 新規 |
| `AuthCLI` | `auth status/reauth/logout` サブコマンド | 新規 (Phase 4) |
| 既存 `TokenStorageService` | そのまま再利用 | 変更なし or 小改修 |
| 既存 OAuth2 Provider | 内部で PKCE / リフレッシュ抽象利用 | 拡張 |

### 2.2 データモデル (Token Cache)
```jsonc
// ~/.config/google-workspace-mcp/credentials.json (fallback 時)
{
  "version": 1,
  "tokens": {
    "access_token": "ya29...",
    "refresh_token": "1//0g...",
    "expiry": 1735555555000 // epoch ms
  },
  "scopes": ["https://www.googleapis.com/auth/spreadsheets"],
  "clientId": "12345-abc.apps.googleusercontent.com",
  "source": "pkce", // pkce | device | adc | service-account
  "storedAt": 1731234567890,
  "lastRefreshAttempt": 1731234567890
}
```
Keychain 保存時は値は同等 JSON シリアライズ (暗号化不要 / OS に依存)。

### 2.3 リフレッシュポリシー
- `expiry - now <= 5分` で proactive refresh
- 401 / invalid_grant 受領 → 1 回即 refresh → 失敗なら再認可誘導
- Refresh レート制限対策: 連続失敗時指数バックオフ (例: 1s, 2s, 4s 最大 30s)

### 2.4 PKCE フロー要点
| 項目 | 詳細 |
|------|------|
| Code Verifier | 128 文字ランダム URL-safe base64 |
| Code Challenge | SHA256 → base64url |
| Redirect URI | `http://127.0.0.1:<ephemeralPort>/oauth2callback` |
| State | CSRF 防止: 32 bytes ランダム + scope ハッシュ含意 (オプション) |
| ポート確保 | Node `server.listen(0)` → `server.address().port` |
| ブラウザ起動 | `open` ライブラリ (失敗時手動 URL 表示) |

### 2.5 Device Code Flow 要点
| 項目 | 詳細 |
|------|------|
| Endpoint | `https://oauth2.googleapis.com/device/code` |
| Poll Interval | 応答 `interval` (min 5s) |
| Timeout | 15 分 (Google 側 expiry 前) |
| 中断 | Ctrl+C 捕捉でクリーンアップ |

---
## 3. 実装フェーズ (現行コード整合版)

> 既に `AuthProvider` / `AuthFactory` / `OAuth2AuthProvider` / `TokenStorageService` が存在するため、当初案の抽象導入フェーズは不要。差分最小で Zero-Config を組み込みます。

### Phase 1: 下準備 & 整合性
| タスク | 詳細 | 備考 |
|--------|------|------|
| P1-1 | 環境変数名称統一 (`GOOGLE_AUTH_MODE`) | ドキュメント整備中心 |
| P1-2 | `TokenStorageService` に isExpiringSoon 追加 | proactive refresh 下地 |
| P1-3 | `OAuth2AuthProvider.validateAuth` に残 5 分判定 & refresh 呼び出し | 既存ロジック拡張 |
| P1-4 | テスト: expiry 境界 / refresh 成功失敗 | 既存テスト拡張 |

### Phase 2: PKCE 対応
| タスク | 詳細 | 備考 |
|--------|------|------|
| P2-1 | `pkce-utils.ts` 追加 (verifier/challenge) | 128 chars S256 |
| P2-2 | 認可URL code_challenge 追加 (flag で disable 可) | 後方互換維持 |
| P2-3 | code_verifier 使用してトークン交換 | |
| P2-4 | テスト: challenge 含有 / 非 PKCE モード | |

### Phase 3: Device Code Flow Fallback
| タスク | 詳細 | 備考 |
|--------|------|------|
| P3-1 | `device-code-flow.ts` 実装 | start/poll/cancel |
| P3-2 | ブラウザ失敗 / `--no-browser` / ポート連続失敗で切替 | 失敗閾値=5 |
| P3-3 | rate_limit_slowdown 対応ポーリング | interval 尊守 |
| P3-4 | テスト: cancel / expired / slowdown | モック API |

### Phase 4: ADC 統合
| タスク | 詳細 | 備考 |
|--------|------|------|
| P4-1 | `adc-resolver.ts` 追加 (`GoogleAuth`) | scopes 指定 |
| P4-2 | 順序: Cache → ADC → (PKCE/Device) | if チェーン |
| P4-3 | ADC 成功時 source="adc" で保存 | refresh 無し対応 |
| P4-4 | テスト: gcloud 模擬 / fallback | |

### Phase 5: CLI & Quick Start
| タスク | 詳細 | 備考 |
|--------|------|------|
| P5-1 | `src/cli/auth.ts` (status/reauth/logout) | |
| P5-2 | status 出力: source / scopes / expiry | snapshot |
| P5-3 | reauth: 強制再承認 (scope 追加) | |
| P5-4 | logout: トークン削除 | |
| P5-5 | README Quick Start (Zero Config Beta) | |
| P5-6 | 統合テスト: 初回→再起動 | |

### Phase 6: オプション拡張
| タスク | 詳細 |
|--------|------|
| P6-1 | スコープインクリメンタル再承認 |
| P6-2 | マルチプロファイル (アカウント切替) |
| P6-3 | KDF 強化 (PBKDF2/Argon2) |
| P6-4 | Telemetry (オプトイン) |

---
## 4. 変更予定ファイル (更新ロードマップ)
| ファイル | アクション | フェーズ |
|----------|-----------|---------|
| `src/services/auth/token-storage.service.ts` | isExpiringSoon 追加 | P1 |
| `src/services/auth/oauth2-auth.provider.ts` | PKCE / refresh / fallback hook | P2-P3 |
| `src/services/auth/pkce-utils.ts` | 新規 | P2 |
| `src/services/auth/device-code-flow.ts` | 新規 | P3 |
| `src/services/auth/adc-resolver.ts` | 新規 | P4 |
| `src/cli/auth.ts` | 新規 | P5 |
| `src/index.ts` | CLI ディスパッチ (任意) | P5 |
| `README.md` | Quick Start 更新 | P5 |

---
## 5. テスト戦略 (更新)
### 5.1 ユニット
- token-storage: isExpiringSoon 境界 4:59 / 5:01
- pkce-utils: verifier 長さ & challenge ハッシュ検証
- oauth2-auth.provider: proactive refresh / PKCE on/off
- device-code-flow: poll interval / cancel / expired / slowdown
- adc-resolver: 成功 / 失敗 fallback

### 5.2 インテグレーション
- Cache 命中 → 即利用 (PKCE 未発火)
- Cache miss + ADC 成功
- Cache + ADC miss → PKCE 成功
- PKCE 強制失敗 → Device Code 成功

### 5.3 CLI (P5)
- status 出力フォーマット (snapshot)
- reauth で scope 追加再承認
- logout 後初回再認可

### 5.4 手動確認
| シナリオ | 手順 | 期待 |
|----------|------|------|
| 初回 (PKCE) | CLI 実行→ブラウザ承認 | 次回無認可 |
| --no-browser | CLI `--no-browser` | デバイスコード表示 |
| 期限前刷新 | expiry を短縮→操作 | 自動 refresh ログ |
| logout 後再起動 | `auth logout` → 起動 | 再承認要求 |

---
## 6. セキュリティ / プライバシー
| 項目 | 対策 |
|------|------|
| 秘匿情報ログ混入 | トークン/コード/refresh_token をログ出力禁止 (mask) |
| CSRF (PKCE state) | ランダム state + strict 比較 |
| 秘密鍵不要化 | PKCE 採用で client secret 埋め込み不要 |
| Token 保護 | Keychain 優先 / Fallback AES-256 (現行) |
| 破棄 | logout / invalid_grant 時に確実削除 |
| Scope 最小化 | 初回最小スコープ → 追加要求時再認可 (Phase 6+) |

---
## 7. CLI UX 案 (Phase 5)
```
$ google-workspace-mcp-server auth status
Auth Source : pkce (cached)
Scopes      : spreadsheets.readonly
Expiry      : 2025-01-04T12:34:56Z (in 53m)
Cache Path  : Keychain (fallback file: ~/.config/google-workspace-mcp/credentials.json)

$ google-workspace-mcp-server auth reauth --scopes spreadsheets,calendar
(Re-auth flow begins... browser opened)

$ google-workspace-mcp-server auth logout
Tokens removed.
```

---
## 8. 失敗/エラー分類
| コード/分類 | 発生源 | 対処 |
|-------------|--------|------|
| `auth.browser_open_failed` | PKCE | Device Code fallback 提示 |
| `auth.port_conflict` | PKCE | 連続 5 回失敗で Device Code |
| `auth.state_mismatch` | PKCE | 再試行 (1回) → 中断 |
| `auth.device_code_expired` | Device | 再実行案内 |
| `auth.refresh_invalid_grant` | Refresh | キャッシュ削除 & 再認可要求 |
| `auth.network_timeout` | 共通 | リトライ (指数) + 最終エラーメッセージ |

---
## 9. マイグレーション戦略 (更新)
| フェーズ | 既存影響 | アクション |
|---------|----------|-----------|
| P1 | なし | ドキュメント整合のみ |
| P2 | なし | PKCE 有効 (無効化 flag) |
| P3 | なし | fallback 条件追加 |
| P4 | なし | ADC 利用時ログ明示 |
| P5 | なし | CLI 追加 |
| P6+ | 任意 | デフォルトモード再検討 |

- `GOOGLE_AUTH_MODE` 正規名称統一。
- 未指定時 Zero-Config 起動は P5 以降検討。

---
## 10. リスクと軽減策 (更新)
| リスク | 影響 | 軽減策 |
|--------|------|--------|
| keytar インストール失敗 | fallback 依存 | 明示ログ + fallback 暗号化維持 |
| ポート競合 (PKCE) | UX 低下 | 最大5回試行→Device Code |
| Refresh 連鎖失敗 | 過剰呼び出し | バックオフ + 上限3 + 再認可案内 |
| 複数プロセス競合 | キャッシュ破損 | 原子的書込 + リトライ |
| スコープ追加混乱 | 権限不足 | status で現行スコープ表示 + reauth 誘導 |
| Device Code Poll 過多 | 429 slow_down | interval 観察 + slowdown 遵守 |
| ADC 誤利用 | 意図しない資格 | ログに source=adc 明示 + 無効化 flag |

---
## 11. 観測性 (Observability)
| 指標 | 収集方法 | 目的 |
|------|----------|------|
| auth.source 分布 | info ログ (集計可能フォーマット) | 利用経路把握 |
| refresh 成功/失敗数 | debug ログ | 安定性監視 |
| fallback 発生数 (PKCE→Device) | warn ログ | UX 問題検知 |

例: `AUTH_METRIC source=pkce refresh=success fallback=0` 形式。

---
## 12. 導入スケジュール (目安)
| 週 | フェーズ | 主タスク |
|----|----------|----------|
| 1 | P1-P2 | 抽象 & Cache/ADC | 
| 2 | P3 | PKCE 実装 + テスト |
| 3 | P4 | Device Code + フォールバック | 
| 4 | P5 | CLI サブコマンド + README | 
| 5 | Stabilize | 追加テスト / ドキュメント / 監査 |

---
## 13. 導入後フォロー (Phase >5)
- マルチアカウント: `credentials.<profile>.json` 分離 or Keychain アカウント名分岐
- スコープインクリメンタル: 追加要求時 consent へ誘導する差分同意
- Telemetry プラグイン化: オプトインで匿名統計

---
## 14. まとめ
段階的拡張 (Resolver 抽象 → Cache/ADC → PKCE → Device → CLI) により、既存ユーザへ影響を与えず Zero-Config なシームレス認証体験を構築する。セキュリティ要件 (トークン秘匿 / PKCE / 最小スコープ) を維持しつつ UX と運用性を改善する計画である。

> Feedback: Issue で **Simplified Auth Proposal** ラベルを付けてコメントください。
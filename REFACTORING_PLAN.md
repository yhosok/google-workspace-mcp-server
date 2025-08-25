# Google Workspace MCP Server - リファクタリング計画

## 目的
将来のGoogle Workspace サービス拡張に向けた、モジュール化された拡張可能なアーキテクチャの構築

## 主な改善点

### 1. ツール構造のモジュール化
**現状の問題:**
- すべてのツール登録が `index.ts` にハードコード
- インラインでスキーマ定義
- サービス間の明確な分離なし

**解決策:**
```
src/tools/
├── base/
│   ├── tool-registry.ts    # ツール登録基底クラス
│   └── tool-schema.ts       # スキーマ定義ヘルパー
├── sheets/
│   ├── index.ts            # Sheets ツールエクスポート
│   ├── list.tool.ts        # リスト操作ツール
│   ├── read.tool.ts        # 読み取りツール
│   ├── write.tool.ts       # 書き込みツール
│   └── append.tool.ts      # 追加ツール
└── drive/ (将来)
    └── ...
```

### 2. スキーマ管理の改善
**新規構造:**
```
src/schemas/
├── base/
│   └── schema-factory.ts   # スキーマ生成ファクトリー
├── sheets/
│   ├── input/             # 入力スキーマ
│   │   ├── list.schema.ts
│   │   ├── read.schema.ts
│   │   └── write.schema.ts
│   └── output/            # 出力スキーマ
│       └── responses.ts
└── validation/
    └── common.ts           # 共通バリデーション
```

### 3. 型定義の整理
**新規構造:**
```
src/types/
├── base/
│   ├── mcp.types.ts       # MCP共通型
│   └── service.types.ts   # サービス共通型
├── sheets/
│   ├── operations.ts      # Sheets操作型
│   ├── responses.ts       # レスポンス型
│   └── errors.ts          # エラー型
└── drive/ (将来)
    └── ...
```

### 4. リソース構造の改善
```
src/resources/
├── base/
│   └── resource-registry.ts
├── sheets/
│   ├── index.ts
│   ├── schema.resource.ts
│   └── data.resource.ts
└── drive/ (将来)
```

### 5. サービス登録パターンの導入
```typescript
// src/registry/service-registry.ts
interface ServiceModule {
  name: string;
  registerTools(server: McpServer): void;
  registerResources(server: McpServer): void;
  initialize(auth: AuthService): Promise<void>;
}

// src/registry/sheets/index.ts
export class SheetsServiceModule implements ServiceModule {
  registerTools(server: McpServer) {
    this.tools.forEach(tool => tool.register(server));
  }
}
```

## 実装手順

### Phase 1: 基底構造の作成
1. `src/tools/base/` ディレクトリ作成
2. `ToolRegistry` 抽象クラス実装
3. `SchemaFactory` ヘルパークラス実装

### Phase 2: Sheetsツールのリファクタリング
1. 既存の `SheetsTools` クラスを個別ツールに分割
2. 各ツールを独立したクラスとして実装
3. 共通スキーマバリデーションの抽出

### Phase 3: 型定義の再構成
1. 型定義をサービス別にディレクトリ分割
2. 共通型を `base/` に移動
3. サービス固有型を各ディレクトリに配置

### Phase 4: サービスレジストリの実装
1. `ServiceModule` インターフェース作成
2. `SheetsServiceModule` 実装
3. `index.ts` をレジストリパターンに更新

### Phase 5: テストの更新
1. 新構造に合わせたテストファイル更新
2. モックの調整
3. 統合テストの実行

## 期待される効果
- **拡張性:** 新しいGoogleサービスの追加が容易
- **保守性:** 各ツールが独立し、変更の影響範囲が限定的
- **テスタビリティ:** 個別ツールの単体テストが容易
- **型安全性:** サービス別の型定義で厳密な型チェック
- **再利用性:** 共通パターンの抽出により、コード重複を削減

## 注意事項
- 既存のAPIインターフェースは維持（後方互換性）
- TDDアプローチで各変更をテストファースト実装
- Result パターンは維持し、エラーハンドリングの一貫性確保
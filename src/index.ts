import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AuthService } from './services/auth.service.js';
import { ServiceRegistry, SheetsServiceModule } from './registry/index.js';
import { loadConfig } from './config/index.js';
import type { EnvironmentConfig } from './types/index.js';

// Service registry and authentication
let authService: AuthService;
let serviceRegistry: ServiceRegistry;

// MCPサーバーの作成
const server = new McpServer({
  name: 'google-workspace-mcp-server',
  version: '1.0.0'
});

async function initializeServices(): Promise<void> {
  // 設定の読み込み
  const config: EnvironmentConfig = loadConfig();
  
  // 認証サービスの初期化
  authService = new AuthService(config);
  const authResult = await authService.initialize();
  if (authResult.isErr()) {
    throw authResult.error;
  }
  
  // サービスレジストリの初期化
  serviceRegistry = new ServiceRegistry();
  
  // Sheets サービスモジュールの登録
  const sheetsModule = new SheetsServiceModule();
  const registerResult = serviceRegistry.registerModule(sheetsModule);
  if (registerResult.isErr()) {
    throw registerResult.error;
  }
  
  // 全サービスモジュールの初期化
  const initResult = await serviceRegistry.initializeAll(authService);
  if (initResult.isErr()) {
    throw initResult.error;
  }
}

function registerToolsAndResources(): void {
  // ツールの登録
  const toolsResult = serviceRegistry.registerAllTools(server);
  if (toolsResult.isErr()) {
    console.error('Failed to register tools:', toolsResult.error.toJSON());
    throw toolsResult.error;
  }

  // リソースの登録  
  const resourcesResult = serviceRegistry.registerAllResources(server);
  if (resourcesResult.isErr()) {
    console.error('Failed to register resources:', resourcesResult.error.toJSON());
    throw resourcesResult.error;
  }
}

async function main(): Promise<void> {
  try {
    // サービスの初期化
    await initializeServices();
    console.log('Services initialized successfully');
    
    // ヘルスステータスのログ出力
    const healthStatus = serviceRegistry.getOverallHealthStatus();
    console.log('Service registry health status:', {
      status: healthStatus.status,
      summary: healthStatus.summary
    });
    
    // ツールとリソースの登録
    registerToolsAndResources();
    console.log('Tools and resources registered successfully');
    
    // トランスポートの設定と接続
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.log('Google Workspace MCP Server is running...');
    
  } catch (error) {
    console.error('Failed to start server:', error);
    
    // クリーンアップの実行
    if (serviceRegistry) {
      try {
        await serviceRegistry.cleanup();
        console.log('Cleanup completed successfully');
      } catch (cleanupError) {
        console.error('Cleanup failed:', cleanupError);
      }
    }
    
    process.exit(1);
  }
}

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  
  if (serviceRegistry) {
    try {
      await serviceRegistry.cleanup();
      console.log('Cleanup completed successfully');
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  }
  
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  
  if (serviceRegistry) {
    try {
      await serviceRegistry.cleanup();
      console.log('Cleanup completed successfully'); 
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  }
  
  process.exit(0);
});

main().catch(console.error);
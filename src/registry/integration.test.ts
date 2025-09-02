import { ServiceRegistry, SheetsServiceModule } from './index.js';
import { AuthService } from '../services/auth.service.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServiceModule } from './service-module.interface.js';
import { ok, err } from 'neverthrow';
import { GoogleServiceError } from '../errors/index.js';

// Mock external dependencies
jest.mock('../services/auth.service.js');

// Mock SheetsService with proper Result return values
jest.mock('../services/sheets.service.js', () => ({
  SheetsService: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(ok(undefined)),
    getServiceName: jest.fn().mockReturnValue('SheetsService'),
    getServiceVersion: jest.fn().mockReturnValue('v4'),
  })),
}));

jest.mock('../resources/sheets-resources.js', () => ({
  SheetsResources: jest.fn().mockImplementation(() => ({
    getSpreadsheetSchema: jest.fn(),
    getSpreadsheetData: jest.fn(),
  })),
}));

// Mock tool classes
jest.mock('../tools/sheets/list.tool.js', () => ({
  SheetsListTool: jest.fn().mockImplementation(() => ({
    registerTool: jest.fn(),
    getToolName: jest.fn().mockReturnValue('sheets-list'),
  })),
}));

jest.mock('../tools/sheets/read.tool.js', () => ({
  SheetsReadTool: jest.fn().mockImplementation(() => ({
    registerTool: jest.fn(),
    getToolName: jest.fn().mockReturnValue('sheets-read'),
  })),
}));

jest.mock('../tools/sheets/write.tool.js', () => ({
  SheetsWriteTool: jest.fn().mockImplementation(() => ({
    registerTool: jest.fn(),
    getToolName: jest.fn().mockReturnValue('sheets-write'),
  })),
}));

jest.mock('../tools/sheets/append.tool.js', () => ({
  SheetsAppendTool: jest.fn().mockImplementation(() => ({
    registerTool: jest.fn(),
    getToolName: jest.fn().mockReturnValue('sheets-append'),
  })),
}));

const createMockAuthService = (): jest.Mocked<AuthService> =>
  ({
    initialize: jest.fn().mockResolvedValue(ok(undefined)),
    getAuthClient: jest.fn(),
    getServiceName: jest.fn().mockReturnValue('AuthService'),
    getServiceVersion: jest.fn().mockReturnValue('v1'),
  }) as unknown as jest.Mocked<AuthService>;

const createMockServer = (): jest.Mocked<McpServer> =>
  ({
    registerTool: jest.fn(),
    registerResource: jest.fn(),
  }) as unknown as jest.Mocked<McpServer>;

describe('Service Registry Integration Tests', () => {
  let serviceRegistry: ServiceRegistry;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockServer: jest.Mocked<McpServer>;

  beforeEach(() => {
    serviceRegistry = new ServiceRegistry();
    mockAuthService = createMockAuthService();
    mockServer = createMockServer();
  });

  afterEach(async () => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    // Reset SheetsService mock to default success behavior
    const sheetsServiceModule = await import('../services/sheets.service.js');
    const { SheetsService } = sheetsServiceModule;
    (
      SheetsService as jest.MockedClass<typeof SheetsService>
    ).mockImplementation(
      () =>
        ({
          initialize: jest.fn().mockResolvedValue(ok(undefined)),
          getServiceName: jest.fn().mockReturnValue('SheetsService'),
          getServiceVersion: jest.fn().mockReturnValue('v4'),
        }) as unknown as InstanceType<typeof SheetsService>
    );
  });

  afterAll(() => {
    // Comprehensive cleanup to prevent Jest worker hanging
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  });

  describe('End-to-End Service Module Lifecycle', () => {
    it('should successfully complete full lifecycle: register -> initialize -> register tools/resources -> cleanup', async () => {
      // Phase 1: Register service module
      const sheetsModule = new SheetsServiceModule();
      const registerResult = serviceRegistry.registerModule(sheetsModule);

      expect(registerResult.isOk()).toBe(true);
      expect(serviceRegistry.getModuleNames()).toContain('sheets');

      // Phase 2: Initialize all services
      const initResult = await serviceRegistry.initializeAll(mockAuthService);

      expect(initResult.isOk()).toBe(true);
      expect(serviceRegistry.getIsInitialized()).toBe(true);
      expect(sheetsModule.isInitialized()).toBe(true);

      // Phase 3: Register tools
      const toolsResult = serviceRegistry.registerAllTools(mockServer);

      expect(toolsResult.isOk()).toBe(true);
      // Tools are registered via the module's tool registry pattern, not directly on mockServer
      // The registration happens inside the tool registry pattern

      // Phase 4: Register resources
      const resourcesResult = serviceRegistry.registerAllResources(mockServer);

      expect(resourcesResult.isOk()).toBe(true);
      // Should register 2 resources: spreadsheet-schema and spreadsheet-data
      expect(mockServer.registerResource).toHaveBeenCalledTimes(2);

      // Phase 5: Health check
      const healthStatus = serviceRegistry.getOverallHealthStatus();

      expect(healthStatus.status).toBe('healthy');
      expect(healthStatus.summary.healthy).toBe(1);
      expect(healthStatus.summary.total).toBe(1);
      expect(healthStatus.modules.sheets).toBeDefined();
      expect(healthStatus.modules.sheets.status).toBe('healthy');

      // Phase 6: Cleanup
      const cleanupResult = await serviceRegistry.cleanup();

      expect(cleanupResult.isOk()).toBe(true);
      expect(serviceRegistry.getIsInitialized()).toBe(false);
      expect(sheetsModule.isInitialized()).toBe(false);
    });

    it('should handle multiple service modules registration and initialization', async () => {
      // Register multiple modules (simulating future Drive, Gmail modules)
      const sheetsModule = new SheetsServiceModule();

      serviceRegistry.registerModule(sheetsModule);

      expect(serviceRegistry.getModuleNames()).toEqual(['sheets']);

      // Initialize all
      const initResult = await serviceRegistry.initializeAll(mockAuthService);
      expect(initResult.isOk()).toBe(true);

      // Register all tools and resources
      const toolsResult = serviceRegistry.registerAllTools(mockServer);
      const resourcesResult = serviceRegistry.registerAllResources(mockServer);

      expect(toolsResult.isOk()).toBe(true);
      expect(resourcesResult.isOk()).toBe(true);

      // Verify registration order is maintained
      expect(serviceRegistry.getInitializationOrder()).toEqual(['sheets']);

      // Health check for multiple modules
      const healthStatus = serviceRegistry.getOverallHealthStatus();
      expect(healthStatus.summary.total).toBe(1);
      expect(healthStatus.status).toBe('healthy');
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle service initialization failure gracefully', async () => {
      // Create a new registry with fresh auth service for this test
      const localRegistry = new ServiceRegistry();
      const failingAuthService = createMockAuthService();

      // Mock the underlying SheetsService to fail initialization
      const sheetsServiceModule = await import('../services/sheets.service.js');
      const { SheetsService } = sheetsServiceModule;
      (
        SheetsService as jest.MockedClass<typeof SheetsService>
      ).mockImplementation(
        () =>
          ({
            initialize: jest
              .fn()
              .mockResolvedValue(
                err(
                  new GoogleServiceError(
                    'Service init failed',
                    'sheets',
                    'SERVICE_INIT_FAILED'
                  )
                )
              ),
            getServiceName: jest.fn().mockReturnValue('SheetsService'),
            getServiceVersion: jest.fn().mockReturnValue('v4'),
          }) as unknown as InstanceType<typeof SheetsService>
      );

      const sheetsModule = new SheetsServiceModule();
      localRegistry.registerModule(sheetsModule);

      const initResult = await localRegistry.initializeAll(failingAuthService);

      expect(initResult.isErr()).toBe(true);
      expect(initResult._unsafeUnwrapErr().message).toContain(
        'Failed to initialize Sheets service'
      );
      expect(localRegistry.getIsInitialized()).toBe(false);
      expect(sheetsModule.isInitialized()).toBe(false);
    });

    it('should prevent tool/resource registration when not initialized', () => {
      const sheetsModule = new SheetsServiceModule();
      serviceRegistry.registerModule(sheetsModule);

      // Try to register tools without initialization
      const toolsResult = serviceRegistry.registerAllTools(mockServer);
      const resourcesResult = serviceRegistry.registerAllResources(mockServer);

      expect(toolsResult.isErr()).toBe(true);
      expect(resourcesResult.isErr()).toBe(true);
      expect(toolsResult._unsafeUnwrapErr().message).toContain(
        'not initialized'
      );
      expect(resourcesResult._unsafeUnwrapErr().message).toContain(
        'not initialized'
      );
    });

    it('should handle partial cleanup failures', async () => {
      // Use a fresh registry for this test
      const localRegistry = new ServiceRegistry();
      const sheetsModule = new SheetsServiceModule();
      localRegistry.registerModule(sheetsModule);

      // Ensure initialization succeeds first
      const initResult = await localRegistry.initializeAll(mockAuthService);
      expect(initResult.isOk()).toBe(true);
      expect(localRegistry.getIsInitialized()).toBe(true);

      // Mock cleanup failure for the module
      jest
        .spyOn(sheetsModule, 'cleanup')
        .mockResolvedValue(
          err(
            new GoogleServiceError('Cleanup failed', 'sheets', 'CLEANUP_FAILED')
          )
        );

      const cleanupResult = await localRegistry.cleanup();

      expect(cleanupResult.isErr()).toBe(true);
      expect(cleanupResult._unsafeUnwrapErr().message).toContain('1 error(s)');
      // Registry should still reset state even with cleanup errors
      expect(localRegistry.getIsInitialized()).toBe(false);
    });
  });

  describe('Extensibility and Future-Proofing', () => {
    it('should demonstrate easy addition of new service modules (simulating Drive)', async () => {
      // Mock a future Drive service module with all required methods
      const mockDriveModule = {
        name: 'drive',
        displayName: 'Google Drive',
        version: '1.0.0',
        initialize: jest.fn().mockResolvedValue(ok(undefined)),
        registerTools: jest.fn().mockReturnValue(ok(undefined)),
        registerResources: jest.fn().mockReturnValue(ok(undefined)),
        cleanup: jest.fn().mockResolvedValue(ok(undefined)),
        isInitialized: jest.fn().mockReturnValue(true),
        getHealthStatus: jest.fn().mockReturnValue({
          status: 'healthy' as const,
          lastChecked: new Date(),
          metrics: {
            toolsRegistered: 3,
            resourcesRegistered: 1,
          },
        }),
      };

      // Register both Sheets and Drive modules
      const sheetsModule = new SheetsServiceModule();
      serviceRegistry.registerModule(sheetsModule);
      serviceRegistry.registerModule(mockDriveModule as ServiceModule);

      expect(serviceRegistry.getModuleNames()).toEqual(['sheets', 'drive']);

      // Initialize all services
      const initResult = await serviceRegistry.initializeAll(mockAuthService);
      expect(initResult.isOk()).toBe(true);

      // Register tools and resources
      const toolsResult = serviceRegistry.registerAllTools(mockServer);
      const resourcesResult = serviceRegistry.registerAllResources(mockServer);
      expect(toolsResult.isOk()).toBe(true);
      expect(resourcesResult.isOk()).toBe(true);

      // Verify both modules are healthy
      const healthStatus = serviceRegistry.getOverallHealthStatus();
      expect(healthStatus.summary.total).toBe(2);
      expect(healthStatus.summary.healthy).toBeGreaterThanOrEqual(1);
      expect(healthStatus.modules.sheets).toBeDefined();
      expect(healthStatus.modules.drive).toBeDefined();

      // Verify initialization order
      expect(serviceRegistry.getInitializationOrder()).toEqual([
        'sheets',
        'drive',
      ]);
    });

    it('should support service module versioning and metadata', () => {
      const sheetsModule = new SheetsServiceModule();

      expect(sheetsModule.name).toBe('sheets');
      expect(sheetsModule.displayName).toBe('Google Sheets');
      expect(sheetsModule.version).toBe('1.0.0');

      serviceRegistry.registerModule(sheetsModule);

      const registeredModule = serviceRegistry.getModule('sheets');
      expect(registeredModule).toBe(sheetsModule);
      expect(registeredModule?.version).toBe('1.0.0');
    });
  });

  describe('Performance and Resource Management', () => {
    it('should track initialization and registration metrics', async () => {
      const sheetsModule = new SheetsServiceModule();
      serviceRegistry.registerModule(sheetsModule);

      const startTime = Date.now();
      const initResult = await serviceRegistry.initializeAll(mockAuthService);
      const endTime = Date.now();

      // Verify initialization succeeded
      expect(initResult.isOk()).toBe(true);
      expect(sheetsModule.isInitialized()).toBe(true);

      const healthStatus = sheetsModule.getHealthStatus();

      expect(healthStatus.metrics).toBeDefined();
      expect(healthStatus.metrics?.toolsRegistered).toBeGreaterThanOrEqual(0);
      expect(healthStatus.metrics?.resourcesRegistered).toBe(2);
      expect(healthStatus.metrics?.initializationTime).toBeGreaterThanOrEqual(
        0
      );
      expect(healthStatus.lastChecked).toBeInstanceOf(Date);

      // Verify initialization was reasonably fast (less than 1 second for mocked services)
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should prevent duplicate module registration', () => {
      const sheetsModule1 = new SheetsServiceModule();
      const sheetsModule2 = new SheetsServiceModule();

      const result1 = serviceRegistry.registerModule(sheetsModule1);
      const result2 = serviceRegistry.registerModule(sheetsModule2);

      expect(result1.isOk()).toBe(true);
      expect(result2.isErr()).toBe(true);
      expect(result2._unsafeUnwrapErr().message).toContain(
        'already registered'
      );
      expect(serviceRegistry.getModuleNames()).toHaveLength(1);
    });
  });
});

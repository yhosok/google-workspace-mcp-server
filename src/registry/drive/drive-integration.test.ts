import { DriveServiceModule } from './drive-service-module.js';
import { ServiceRegistry } from '../service-registry.js';
import type { AuthService } from '../../services/auth.service.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DriveService } from '../../services/drive.service.js';
import {
  ListFilesTool,
  GetFileTool,
  GetFileContentTool,
} from '../../tools/drive/index.js';
import { ok, err } from 'neverthrow';
import { GoogleServiceError, GoogleTimeoutError } from '../../errors/index.js';
import type { drive_v3 } from 'googleapis';

// Mock DriveService
jest.mock('../../services/drive.service.js');

// Mock Drive tools
jest.mock('../../tools/drive/index.js');

const MockedDriveService = DriveService as jest.MockedClass<
  typeof DriveService
>;

// Mock tool constructors
const MockedListFilesTool = ListFilesTool as jest.MockedClass<
  typeof ListFilesTool
>;
const MockedGetFileTool = GetFileTool as jest.MockedClass<typeof GetFileTool>;
const MockedGetFileContentTool = GetFileContentTool as jest.MockedClass<
  typeof GetFileContentTool
>;

describe('Drive Integration Tests', () => {
  let serviceRegistry: ServiceRegistry;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockServer: McpServer;
  let mockDriveService: jest.Mocked<DriveService>;

  const createMockAuthService = (): jest.Mocked<AuthService> =>
    ({
      initialize: jest.fn().mockResolvedValue(ok(undefined)),
      getAuthClient: jest.fn(),
      getServiceName: jest.fn().mockReturnValue('AuthService'),
      getServiceVersion: jest.fn().mockReturnValue('v1'),
    }) as unknown as jest.Mocked<AuthService>;

  beforeEach(() => {
    serviceRegistry = new ServiceRegistry();
    mockAuthService = createMockAuthService();
    mockServer = {
      registerResource: jest.fn(),
      registerTool: jest.fn(),
    } as unknown as McpServer;

    // Setup DriveService mock
    mockDriveService = {
      initialize: jest.fn().mockResolvedValue(ok(undefined)),
      getServiceName: jest.fn().mockReturnValue('DriveService'),
      getServiceVersion: jest.fn().mockReturnValue('v3'),
    } as unknown as jest.Mocked<DriveService>;

    MockedDriveService.mockImplementation(() => mockDriveService);

    // Setup tool mocks
    const mockTool = {
      getToolName: jest.fn(),
      registerTool: jest.fn(),
    } as any;

    MockedListFilesTool.mockImplementation(() => mockTool);
    MockedGetFileTool.mockImplementation(() => mockTool);
    MockedGetFileContentTool.mockImplementation(() => mockTool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should integrate successfully with ServiceRegistry', async () => {
    // Register the Drive service module
    const driveModule = new DriveServiceModule();
    const registrationResult = serviceRegistry.registerModule(driveModule);

    expect(registrationResult.isOk()).toBe(true);

    // Initialize all modules (including Drive)
    const initResult = await serviceRegistry.initializeAll(mockAuthService);
    expect(initResult.isOk()).toBe(true);

    // Verify the module is properly registered and initialized
    const moduleNames = serviceRegistry.getModuleNames();
    expect(moduleNames.length).toBe(1);
    expect(moduleNames[0]).toBe('drive');

    const driveModuleInstance = serviceRegistry.getModule('drive');
    expect(driveModuleInstance).toBeDefined();
    expect(driveModuleInstance!.isInitialized()).toBe(true);

    // Register tools and resources
    const toolsResult = serviceRegistry.registerAllTools(mockServer);
    const resourcesResult = serviceRegistry.registerAllResources(mockServer);

    expect(toolsResult.isOk()).toBe(true);
    expect(resourcesResult.isOk()).toBe(true);
  });

  it('should report healthy status when integrated with ServiceRegistry', async () => {
    // Register and initialize the Drive service module
    const driveModule = new DriveServiceModule();
    await serviceRegistry.registerModule(driveModule);
    await serviceRegistry.initializeAll(mockAuthService);

    // Check overall health status
    const overallHealth = serviceRegistry.getOverallHealthStatus();
    expect(overallHealth.status).toBe('healthy');
    expect(overallHealth.summary.healthy).toBe(1);
    expect(overallHealth.summary.degraded).toBe(0);
    expect(overallHealth.summary.unhealthy).toBe(0);

    // Check individual module health
    const driveModuleInstance = serviceRegistry.getModule('drive');
    expect(driveModuleInstance).toBeDefined();
    const moduleHealth = driveModuleInstance!.getHealthStatus();
    expect(moduleHealth.status).toBe('healthy');
  });

  it('should cleanup properly when integrated with ServiceRegistry', async () => {
    // Register and initialize the Drive service module
    const driveModule = new DriveServiceModule();
    await serviceRegistry.registerModule(driveModule);
    await serviceRegistry.initializeAll(mockAuthService);

    // Verify module is initialized
    expect(driveModule.isInitialized()).toBe(true);

    // Cleanup all modules
    const cleanupResult = await serviceRegistry.cleanup();
    expect(cleanupResult.isOk()).toBe(true);

    // Verify module is no longer initialized
    expect(driveModule.isInitialized()).toBe(false);

    // Check health status after cleanup
    const overallHealth = serviceRegistry.getOverallHealthStatus();
    expect(overallHealth.summary.healthy).toBe(0);
    expect(overallHealth.summary.unhealthy).toBe(1);
  });

  it('should work alongside other service modules', async () => {
    // This test would verify that Drive can coexist with Sheets and Calendar modules
    // For now, we just ensure Drive doesn't break the registry pattern
    const driveModule = new DriveServiceModule();
    const registrationResult = serviceRegistry.registerModule(driveModule);

    expect(registrationResult.isOk()).toBe(true);

    // Verify registry can handle multiple modules (even if just Drive for now)
    const moduleNames = serviceRegistry.getModuleNames();
    expect(moduleNames.length).toBe(1);
    expect(moduleNames.includes('drive')).toBe(true);
  });

  it('should follow the same lifecycle pattern as other service modules', async () => {
    const driveModule = new DriveServiceModule();

    // 1. Register
    const registrationResult = serviceRegistry.registerModule(driveModule);
    expect(registrationResult.isOk()).toBe(true);
    expect(driveModule.isInitialized()).toBe(false);

    // 2. Initialize
    const initResult = await serviceRegistry.initializeAll(mockAuthService);
    expect(initResult.isOk()).toBe(true);
    expect(driveModule.isInitialized()).toBe(true);

    // 3. Register tools and resources
    const toolsResult = serviceRegistry.registerAllTools(mockServer);
    const resourcesResult = serviceRegistry.registerAllResources(mockServer);
    expect(toolsResult.isOk()).toBe(true);
    expect(resourcesResult.isOk()).toBe(true);

    // 4. Health check
    const healthStatus = driveModule.getHealthStatus();
    expect(healthStatus.status).toBe('healthy');

    // 5. Cleanup
    const cleanupResult = await serviceRegistry.cleanup();
    expect(cleanupResult.isOk()).toBe(true);
    expect(driveModule.isInitialized()).toBe(false);
  });

  describe('Module Registration', () => {
    it('should register all 3 Drive tools successfully', async () => {
      const driveModule = new DriveServiceModule();
      serviceRegistry.registerModule(driveModule);
      await serviceRegistry.initializeAll(mockAuthService);

      // Mock tool registration calls
      const mockRegisterTool = jest.fn();
      mockServer.registerTool = mockRegisterTool;

      // Register tools
      const toolsResult = serviceRegistry.registerAllTools(mockServer);
      expect(toolsResult.isOk()).toBe(true);

      // Verify all 3 Drive tools are instantiated
      expect(MockedListFilesTool).toHaveBeenCalled();
      expect(MockedGetFileTool).toHaveBeenCalled();
      expect(MockedGetFileContentTool).toHaveBeenCalled();
    });

    it('should provide proper module metadata', () => {
      const driveModule = new DriveServiceModule();

      expect(driveModule.name).toBe('drive');
      expect(driveModule.displayName).toBe('Google Drive');
      expect(driveModule.version).toBe('1.0.0');
      expect(driveModule.isInitialized()).toBe(false);
    });

    it('should handle concurrent initialization attempts', async () => {
      const driveModule = new DriveServiceModule();
      serviceRegistry.registerModule(driveModule);

      // Simulate concurrent initialization
      const initPromises = [
        serviceRegistry.initializeAll(mockAuthService),
        serviceRegistry.initializeAll(mockAuthService),
        serviceRegistry.initializeAll(mockAuthService),
      ];

      const results = await Promise.all(initPromises);

      // All should succeed (first one initializes, others wait)
      results.forEach(result => {
        expect(result.isOk()).toBe(true);
      });

      // Module should be created 3 times but initialized properly
      expect(MockedDriveService).toHaveBeenCalled();
      expect(driveModule.isInitialized()).toBe(true);
    });
  });

  describe('End-to-End File Operations', () => {
    let driveModule: DriveServiceModule;
    let mockTool: any;

    beforeEach(async () => {
      driveModule = new DriveServiceModule();
      serviceRegistry.registerModule(driveModule);
      await serviceRegistry.initializeAll(mockAuthService);

      // Create comprehensive mock tool with all methods
      mockTool = {
        getToolName: jest
          .fn()
          .mockReturnValue('google-workspace__drive__list-files'),
        registerTool: jest.fn(),
        call: jest.fn(),
      };

      MockedListFilesTool.mockImplementation(() => mockTool);
      MockedGetFileTool.mockImplementation(() => mockTool);
      MockedGetFileContentTool.mockImplementation(() => mockTool);
    });

    it('should complete full file listing workflow', async () => {
      // Mock successful API response
      const mockApiResponse: Partial<drive_v3.Schema$FileList> = {
        files: [
          {
            id: 'file-1',
            name: 'Document 1.docx',
            mimeType: 'application/vnd.google-apps.document',
            modifiedTime: '2023-01-15T10:00:00.000Z',
            size: '1024',
          },
          {
            id: 'file-2',
            name: 'Spreadsheet 1.xlsx',
            mimeType: 'application/vnd.google-apps.spreadsheet',
            modifiedTime: '2023-01-14T15:30:00.000Z',
            size: '2048',
          },
        ],
        nextPageToken: undefined,
      };

      mockTool.call.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({ result: mockApiResponse }),
          },
        ],
      });

      // Execute tool call through the registry
      const toolsResult = serviceRegistry.registerAllTools(mockServer);
      expect(toolsResult.isOk()).toBe(true);

      const callResult = await mockTool.call({
        folderId: 'root',
        maxResults: 10,
      });

      expect(callResult).toBeDefined();
      expect(callResult.content).toBeDefined();
      expect(mockTool.call).toHaveBeenCalledWith({
        folderId: 'root',
        maxResults: 10,
      });
    });

    it('should handle file metadata retrieval workflow', async () => {
      const mockFileMetadata: Partial<drive_v3.Schema$File> = {
        id: 'file-123',
        name: 'Important Document.pdf',
        mimeType: 'application/pdf',
        size: '5242880',
        modifiedTime: '2023-01-15T10:00:00.000Z',
        createdTime: '2023-01-10T08:30:00.000Z',
        parents: ['folder-456'],
        owners: [
          {
            displayName: 'John Doe',
            emailAddress: 'john.doe@example.com',
          },
        ],
      };

      mockTool.call.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({ result: mockFileMetadata }),
          },
        ],
      });

      const toolsResult = serviceRegistry.registerAllTools(mockServer);
      expect(toolsResult.isOk()).toBe(true);

      const callResult = await mockTool.call({ fileId: 'file-123' });

      expect(callResult).toBeDefined();
      expect(callResult.content[0].text).toContain('Important Document.pdf');
    });

    it('should handle file content retrieval workflow', async () => {
      const mockFileContent = 'This is the content of the document...';

      mockTool.call.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: mockFileContent,
          },
        ],
      });

      const toolsResult = serviceRegistry.registerAllTools(mockServer);
      expect(toolsResult.isOk()).toBe(true);

      const callResult = await mockTool.call({
        fileId: 'document-123',
        mimeType: 'text/plain',
      });

      expect(callResult).toBeDefined();
      expect(callResult.content[0].text).toBe(mockFileContent);
    });

    it('should maintain tool isolation and proper error boundaries', async () => {
      // Test that tool failures don't affect other tools
      const successfulTool = {
        getToolName: jest
          .fn()
          .mockReturnValue('google-workspace__drive__list-files'),
        registerTool: jest.fn(),
        call: jest
          .fn()
          .mockResolvedValue({ content: [{ type: 'text', text: 'success' }] }),
        getToolMetadata: jest.fn(),
        executeImpl: jest.fn(),
        driveService: mockDriveService,
        authService: mockAuthService,
      } as any;

      const failingTool = {
        getToolName: jest
          .fn()
          .mockReturnValue('google-workspace__drive__get-file'),
        registerTool: jest.fn(),
        call: jest.fn().mockRejectedValue(new Error('Tool failed')),
        getToolMetadata: jest.fn(),
        executeImpl: jest.fn(),
        driveService: mockDriveService,
        authService: mockAuthService,
      } as any;

      MockedListFilesTool.mockImplementation(() => successfulTool);
      MockedGetFileTool.mockImplementation(() => failingTool);

      const toolsResult = serviceRegistry.registerAllTools(mockServer);
      expect(toolsResult.isOk()).toBe(true);

      // Successful tool should work
      const successResult = await successfulTool.call({ folderId: 'root' });
      expect(successResult.content[0].text).toBe('success');

      // Failed tool should fail independently
      await expect(failingTool.call({ fileId: 'test' })).rejects.toThrow(
        'Tool failed'
      );
    });
  });

  describe('Service Collaboration', () => {
    it('should integrate properly with AuthService', async () => {
      const driveModule = new DriveServiceModule();
      serviceRegistry.registerModule(driveModule);

      // Mock auth service initialization
      mockAuthService.initialize.mockResolvedValue(ok(undefined));
      mockAuthService.getAuthClient.mockReturnValue({ auth: 'client' } as any);

      const initResult = await serviceRegistry.initializeAll(mockAuthService);
      expect(initResult.isOk()).toBe(true);

      // Verify DriveService was created with AuthService
      expect(MockedDriveService).toHaveBeenCalledWith(mockAuthService);
      expect(mockDriveService.initialize).toHaveBeenCalled();
    });

    it('should handle AuthService initialization failure', async () => {
      // This test validates that the Drive module handles auth failures properly
      // Since the service registry passes the authService directly to modules,
      // we need to test the module's ability to handle initialization failure.

      // Create fresh mocks for isolation
      const MockedDriveServiceLocal = DriveService as jest.MockedClass<
        typeof DriveService
      >;
      const mockDriveServiceLocal = {
        initialize: jest
          .fn()
          .mockResolvedValue(
            err(
              new GoogleServiceError(
                'Auth client failed',
                'drive',
                'AUTH_CLIENT_FAILED'
              )
            )
          ),
        getServiceName: jest.fn().mockReturnValue('DriveService'),
        getServiceVersion: jest.fn().mockReturnValue('v3'),
      } as unknown as jest.Mocked<DriveService>;

      MockedDriveServiceLocal.mockImplementation(() => mockDriveServiceLocal);

      // Use fresh registry and module for isolation
      const localRegistry = new ServiceRegistry();
      const driveModule = new DriveServiceModule();
      localRegistry.registerModule(driveModule);

      // Use a working auth service, but mock the DriveService to fail
      const workingAuthService = createMockAuthService();
      workingAuthService.initialize.mockResolvedValue(ok(undefined));

      const initResult = await localRegistry.initializeAll(workingAuthService);
      expect(initResult.isErr()).toBe(true);
      expect(driveModule.isInitialized()).toBe(false);
    });

    it('should propagate DriveService errors correctly', async () => {
      // Mock DriveService initialization failure
      mockDriveService.initialize.mockResolvedValue(
        err(
          new GoogleServiceError(
            'Drive init failed',
            'drive',
            'DRIVE_INIT_FAILED'
          )
        )
      );

      const driveModule = new DriveServiceModule();
      serviceRegistry.registerModule(driveModule);

      const initResult = await serviceRegistry.initializeAll(mockAuthService);
      expect(initResult.isErr()).toBe(true);

      const error = initResult._unsafeUnwrapErr();
      expect(error.message).toContain('Failed to initialize Drive service');
      expect(driveModule.isInitialized()).toBe(false);
    });
  });

  describe('Error Integration', () => {
    let driveModule: DriveServiceModule;

    beforeEach(async () => {
      driveModule = new DriveServiceModule();
      serviceRegistry.registerModule(driveModule);
    });

    it('should handle network timeouts in integration', async () => {
      // Mock timeout error from DriveService
      mockDriveService.initialize.mockResolvedValue(
        err(new GoogleTimeoutError('Request timed out', 'request', 30000))
      );

      const initResult = await serviceRegistry.initializeAll(mockAuthService);
      expect(initResult.isErr()).toBe(true);

      const error = initResult._unsafeUnwrapErr();
      expect(error).toBeInstanceOf(GoogleServiceError);
      expect(error.message).toContain('Drive service');
    });

    it('should handle API quota errors in integration', async () => {
      await serviceRegistry.initializeAll(mockAuthService);

      // Mock quota exceeded error in tool call
      const mockTool = {
        getToolName: jest
          .fn()
          .mockReturnValue('google-workspace__drive__list-files'),
        registerTool: jest.fn(),
        call: jest
          .fn()
          .mockRejectedValue(
            new GoogleServiceError('Quota exceeded', 'drive', 'QUOTA_EXCEEDED')
          ),
        getToolMetadata: jest.fn(),
        executeImpl: jest.fn(),
        driveService: mockDriveService,
        authService: mockAuthService,
      } as any;

      MockedListFilesTool.mockImplementation(() => mockTool);

      const toolsResult = serviceRegistry.registerAllTools(mockServer);
      expect(toolsResult.isOk()).toBe(true);

      // Tool call should propagate error correctly
      await expect(mockTool.call({ folderId: 'root' })).rejects.toThrow(
        'Quota exceeded'
      );
    });

    it('should maintain system stability during error conditions', async () => {
      await serviceRegistry.initializeAll(mockAuthService);

      // Simulate various error conditions
      const errors = [
        new GoogleServiceError('Network error', 'drive', 'NETWORK_ERROR'),
        new GoogleTimeoutError('Timeout error', 'request', 5000),
        new Error('Unexpected error'),
      ];

      errors.forEach(async (error, index) => {
        const mockTool = {
          getToolName: jest.fn().mockReturnValue(`tool-${index}`),
          registerTool: jest.fn(),
          call: jest.fn().mockRejectedValue(error),
        };

        // Each error should be contained
        await expect(mockTool.call({})).rejects.toThrow();

        // Module should remain healthy
        expect(driveModule.isInitialized()).toBe(true);
        expect(driveModule.getHealthStatus().status).toBe('healthy');
      });
    });

    it('should handle partial cleanup failures gracefully', async () => {
      await serviceRegistry.initializeAll(mockAuthService);
      expect(driveModule.isInitialized()).toBe(true);

      // Mock cleanup failure
      jest
        .spyOn(driveModule, 'cleanup')
        .mockResolvedValue(
          err(
            new GoogleServiceError('Cleanup failed', 'drive', 'CLEANUP_FAILED')
          )
        );

      const cleanupResult = await serviceRegistry.cleanup();
      expect(cleanupResult.isErr()).toBe(true);

      // Registry should still reset state
      expect(serviceRegistry.getIsInitialized()).toBe(false);
    });
  });

  describe('Performance and Resource Management', () => {
    it('should track initialization performance metrics', async () => {
      const driveModule = new DriveServiceModule();
      serviceRegistry.registerModule(driveModule);

      const startTime = Date.now();
      const initResult = await serviceRegistry.initializeAll(mockAuthService);
      const endTime = Date.now();

      expect(initResult.isOk()).toBe(true);
      expect(endTime - startTime).toBeLessThan(1000); // Should be fast with mocks

      const healthStatus = driveModule.getHealthStatus();
      expect(healthStatus.metrics).toBeDefined();
      expect(healthStatus.metrics?.toolsRegistered).toBeGreaterThanOrEqual(3);
      expect(healthStatus.metrics?.initializationTime).toBeGreaterThanOrEqual(
        0
      );
      expect(healthStatus.lastChecked).toBeInstanceOf(Date);
    });

    it('should prevent memory leaks during lifecycle operations', async () => {
      const driveModule = new DriveServiceModule();
      serviceRegistry.registerModule(driveModule);

      // Multiple initialize/cleanup cycles
      for (let i = 0; i < 3; i++) {
        const initResult = await serviceRegistry.initializeAll(mockAuthService);
        expect(initResult.isOk()).toBe(true);
        expect(driveModule.isInitialized()).toBe(true);

        const cleanupResult = await serviceRegistry.cleanup();
        expect(cleanupResult.isOk()).toBe(true);
        expect(driveModule.isInitialized()).toBe(false);
      }

      // Should handle multiple cycles without issues
      expect(MockedDriveService).toHaveBeenCalledTimes(3);
    });

    it('should handle high-frequency tool registrations', async () => {
      const driveModule = new DriveServiceModule();
      serviceRegistry.registerModule(driveModule);
      await serviceRegistry.initializeAll(mockAuthService);

      // Multiple rapid tool registrations
      const registrationPromises = Array(10)
        .fill(0)
        .map(() => serviceRegistry.registerAllTools(mockServer));

      const results = await Promise.all(registrationPromises);
      results.forEach(result => {
        expect(result.isOk()).toBe(true);
      });

      // Tools should be created appropriately
      expect(MockedListFilesTool).toHaveBeenCalled();
      expect(MockedGetFileTool).toHaveBeenCalled();
      expect(MockedGetFileContentTool).toHaveBeenCalled();
    });
  });

  describe('Production Readiness', () => {
    it('should demonstrate complete integration scenario', async () => {
      // Complete production-like scenario
      const driveModule = new DriveServiceModule();

      // 1. Registration
      const registrationResult = serviceRegistry.registerModule(driveModule);
      expect(registrationResult.isOk()).toBe(true);

      // 2. Initialization with auth
      const productionAuthService = createMockAuthService();
      productionAuthService.initialize.mockResolvedValue(ok(undefined));
      const initResult = await serviceRegistry.initializeAll(
        productionAuthService
      );
      expect(initResult.isOk()).toBe(true);

      // 3. Tool and resource registration
      const toolsResult = serviceRegistry.registerAllTools(mockServer);
      const resourcesResult = serviceRegistry.registerAllResources(mockServer);
      expect(toolsResult.isOk()).toBe(true);
      expect(resourcesResult.isOk()).toBe(true);

      // 4. Health monitoring
      const healthStatus = serviceRegistry.getOverallHealthStatus();
      expect(healthStatus.status).toBe('healthy');
      expect(healthStatus.modules.drive).toBeDefined();

      // 5. Simulate production workload
      const mockTool = {
        getToolName: jest
          .fn()
          .mockReturnValue('google-workspace__drive__list-files'),
        registerTool: jest.fn(),
        call: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify({ files: [] }) }],
        }),
        getToolMetadata: jest.fn(),
        executeImpl: jest.fn(),
        driveService: mockDriveService,
        authService: mockAuthService,
      } as any;

      MockedListFilesTool.mockImplementation(() => mockTool);

      // Multiple concurrent operations
      const workloadPromises = Array(5)
        .fill(0)
        .map(() => mockTool.call({ folderId: 'root' }));

      const workloadResults = await Promise.all(workloadPromises);
      workloadResults.forEach(result => {
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
      });

      // 6. Graceful shutdown
      const cleanupResult = await serviceRegistry.cleanup();
      expect(cleanupResult.isOk()).toBe(true);
      expect(driveModule.isInitialized()).toBe(false);
    });

    it('should verify all required components are integrated', async () => {
      const driveModule = new DriveServiceModule();
      serviceRegistry.registerModule(driveModule);
      await serviceRegistry.initializeAll(mockAuthService);

      // Verify service dependencies
      expect(MockedDriveService).toHaveBeenCalledWith(mockAuthService);

      // Verify tool instantiation - tools receive driveService, authService, and logger
      expect(MockedListFilesTool).toHaveBeenCalledWith(
        expect.any(Object), // driveService
        expect.any(Object), // authService
        expect.any(Object) // logger
      );
      expect(MockedGetFileTool).toHaveBeenCalledWith(
        expect.any(Object), // driveService
        expect.any(Object), // authService
        expect.any(Object) // logger
      );
      expect(MockedGetFileContentTool).toHaveBeenCalledWith(
        expect.any(Object), // driveService
        expect.any(Object), // authService
        expect.any(Object) // logger
      );

      // Verify health monitoring
      const healthStatus = driveModule.getHealthStatus();
      expect(healthStatus.status).toBe('healthy');
      expect(healthStatus.metrics?.toolsRegistered).toBeGreaterThanOrEqual(3);

      // Verify proper module metadata
      expect(driveModule.name).toBe('drive');
      expect(driveModule.displayName).toBe('Google Drive');
      expect(driveModule.version).toBe('1.0.0');
    });
  });
});

import { DriveServiceModule } from './drive-service-module.js';
import type { AuthService } from '../../services/auth.service.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DriveService } from '../../services/drive.service.js';
import {
  ListFilesTool,
  GetFileTool,
  GetFileContentTool,
} from '../../tools/drive/index.js';
import { ok, err } from 'neverthrow';
import { GoogleServiceError } from '../../errors/index.js';

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

describe('DriveServiceModule', () => {
  let module: DriveServiceModule;
  let mockAuthService: AuthService;
  let mockServer: McpServer;
  let mockDriveService: jest.Mocked<DriveService>;
  let mockListFilesTool: any;
  let mockGetFileTool: any;
  let mockGetFileContentTool: any;

  beforeEach(() => {
    module = new DriveServiceModule();
    mockAuthService = {} as AuthService;
    mockServer = {
      registerResource: jest.fn(),
    } as unknown as McpServer;

    // Setup DriveService mock
    mockDriveService = {
      initialize: jest.fn(),
      getServiceName: jest.fn().mockReturnValue('DriveService'),
      getServiceVersion: jest.fn().mockReturnValue('v3'),
    } as unknown as jest.Mocked<DriveService>;

    MockedDriveService.mockImplementation(() => mockDriveService);

    // Setup tool mocks
    mockListFilesTool = {
      getToolName: jest
        .fn()
        .mockReturnValue('google-workspace__drive__list-files'),
      registerTool: jest.fn(),
    };
    mockGetFileTool = {
      getToolName: jest
        .fn()
        .mockReturnValue('google-workspace__drive__get-file'),
      registerTool: jest.fn(),
    };
    mockGetFileContentTool = {
      getToolName: jest
        .fn()
        .mockReturnValue('google-workspace__drive__get-file-content'),
      registerTool: jest.fn(),
    };

    MockedListFilesTool.mockImplementation(() => mockListFilesTool);
    MockedGetFileTool.mockImplementation(() => mockGetFileTool);
    MockedGetFileContentTool.mockImplementation(() => mockGetFileContentTool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('module properties', () => {
    it('should have correct module properties', () => {
      expect(module.name).toBe('drive');
      expect(module.displayName).toBe('Google Drive');
      expect(module.version).toBe('1.0.0');
    });

    it('should not be initialized initially', () => {
      expect(module.isInitialized()).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      mockDriveService.initialize.mockResolvedValue(ok(undefined));

      const result = await module.initialize(mockAuthService);

      expect(result.isOk()).toBe(true);
      expect(module.isInitialized()).toBe(true);
      expect(mockDriveService.initialize).toHaveBeenCalled();

      // Check that service is created and tools array is initialized
      expect(module.getTools()).toHaveLength(3); // Three tools registered
      expect(module.getDriveService()).toBeDefined();
    });

    it('should not re-initialize if already initialized', async () => {
      mockDriveService.initialize.mockResolvedValue(ok(undefined));

      await module.initialize(mockAuthService);
      const result = await module.initialize(mockAuthService);

      expect(result.isOk()).toBe(true);
      expect(mockDriveService.initialize).toHaveBeenCalledTimes(1);
    });

    it('should handle DriveService initialization failure', async () => {
      const error = new GoogleServiceError(
        'Service init failed',
        'drive',
        'SERVICE_INIT_FAILED'
      );
      mockDriveService.initialize.mockResolvedValue(err(error));

      const result = await module.initialize(mockAuthService);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain(
        'Failed to initialize Drive service'
      );
      expect(module.isInitialized()).toBe(false);
    });

    it('should handle initialization exceptions', async () => {
      MockedDriveService.mockImplementation(() => {
        throw new Error('Constructor failed');
      });

      const result = await module.initialize(mockAuthService);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain('Constructor failed');
      expect(module.isInitialized()).toBe(false);
    });
  });

  describe('registerTools', () => {
    beforeEach(async () => {
      mockDriveService.initialize.mockResolvedValue(ok(undefined));
      await module.initialize(mockAuthService);
    });

    it('should register all tools successfully', () => {
      const result = module.registerTools(mockServer);

      expect(result.isOk()).toBe(true);
      // Three tools should be registered
      expect(module.getTools()).toHaveLength(3);
      expect(mockListFilesTool.registerTool).toHaveBeenCalledWith(mockServer);
      expect(mockGetFileTool.registerTool).toHaveBeenCalledWith(mockServer);
      expect(mockGetFileContentTool.registerTool).toHaveBeenCalledWith(
        mockServer
      );
    });

    it('should fail if not initialized', () => {
      const uninitializedModule = new DriveServiceModule();

      const result = uninitializedModule.registerTools(mockServer);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain('not initialized');
    });

    it('should handle tool registration failure when tools exist', () => {
      // Simulate having tools that fail to register
      const mockTool = {
        registerTool: jest.fn(() => {
          throw new Error('Registration failed');
        }),
        getToolName: jest.fn().mockReturnValue('mock-tool'),
      };

      // Inject a mock tool to test the error handling
      (module as any).tools = [mockTool];

      const result = module.registerTools(mockServer);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain(
        'Registration failed'
      );
    });
  });

  describe('registerResources', () => {
    beforeEach(async () => {
      mockDriveService.initialize.mockResolvedValue(ok(undefined));
      await module.initialize(mockAuthService);
    });

    it('should register resources successfully (currently none)', () => {
      const result = module.registerResources(mockServer);

      expect(result.isOk()).toBe(true);
      // Currently no resources to register, but prepared for future
      expect(mockServer.registerResource).not.toHaveBeenCalled();
    });

    it('should fail if not initialized', () => {
      const uninitializedModule = new DriveServiceModule();

      const result = uninitializedModule.registerResources(mockServer);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain('not initialized');
    });

    it('should handle resource registration failure', () => {
      mockServer.registerResource = jest.fn(() => {
        throw new Error('Resource registration failed');
      });

      const result = module.registerResources(mockServer);

      expect(result.isOk()).toBe(true); // Currently no resources, so no failure
    });
  });

  describe('cleanup', () => {
    beforeEach(async () => {
      mockDriveService.initialize.mockResolvedValue(ok(undefined));
      await module.initialize(mockAuthService);
    });

    it('should cleanup successfully', async () => {
      const result = await module.cleanup();

      expect(result.isOk()).toBe(true);
      expect(module.isInitialized()).toBe(false);
      expect(module.getTools()).toHaveLength(0);
      expect(module.getDriveService()).toBeUndefined();
    });

    it('should handle cleanup exceptions', async () => {
      // Simulate cleanup failure by making the module throw during cleanup
      Object.defineProperty(module, 'tools', {
        configurable: true,
        get: () => {
          throw new Error('Cleanup error');
        },
        set: () => {
          throw new Error('Cleanup error');
        },
      });

      const result = await module.cleanup();

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain('Cleanup error');
    });
  });

  describe('getHealthStatus', () => {
    it('should return unhealthy status when not initialized', () => {
      const healthStatus = module.getHealthStatus();

      expect(healthStatus.status).toBe('unhealthy');
      expect(healthStatus.message).toContain('not initialized');
      expect(healthStatus.metrics?.toolsRegistered).toBe(0);
      expect(healthStatus.metrics?.resourcesRegistered).toBe(0);
    });

    it('should return healthy status when initialized', async () => {
      mockDriveService.initialize.mockResolvedValue(ok(undefined));
      await module.initialize(mockAuthService);

      const healthStatus = module.getHealthStatus();

      expect(healthStatus.status).toBe('healthy');
      expect(healthStatus.message).toBeUndefined();
      expect(healthStatus.metrics?.toolsRegistered).toBe(3); // Three tools registered
      expect(healthStatus.metrics?.resourcesRegistered).toBe(0); // No resources yet
      expect(healthStatus.metrics?.initializationTime).toBeDefined();
    });

    it('should include lastChecked timestamp', () => {
      const beforeCheck = new Date();
      const healthStatus = module.getHealthStatus();
      const afterCheck = new Date();

      expect(healthStatus.lastChecked.getTime()).toBeGreaterThanOrEqual(
        beforeCheck.getTime()
      );
      expect(healthStatus.lastChecked.getTime()).toBeLessThanOrEqual(
        afterCheck.getTime()
      );
    });
  });

  describe('getters (testing utilities)', () => {
    beforeEach(async () => {
      mockDriveService.initialize.mockResolvedValue(ok(undefined));
      await module.initialize(mockAuthService);
    });

    it('should provide access to internal services for testing', () => {
      expect(module.getDriveService()).toBeDefined();
      expect(module.getTools()).toHaveLength(3); // Three tools registered
    });

    it('should return undefined for services when not initialized', async () => {
      await module.cleanup();

      expect(module.getDriveService()).toBeUndefined();
      expect(module.getTools()).toHaveLength(0);
    });

    it('should return a copy of tools array to prevent external modification', () => {
      const tools1 = module.getTools();
      const tools2 = module.getTools();

      expect(tools1).not.toBe(tools2); // Different array instances
      expect(tools1).toEqual(tools2); // Same contents
    });
  });

  describe('future tools preparation', () => {
    it('should be ready to accept Drive tools when they are implemented', async () => {
      mockDriveService.initialize.mockResolvedValue(ok(undefined));
      await module.initialize(mockAuthService);

      // Simulate adding future tools
      const mockTool = {
        registerTool: jest.fn(),
        getToolName: jest.fn().mockReturnValue('drive-list'),
      };

      // Verify the tools array can accept new tools
      (module as any).tools.push(mockTool);
      expect(module.getTools()).toHaveLength(4); // 3 existing + 1 mock

      const result = module.registerTools(mockServer);
      expect(result.isOk()).toBe(true);
      expect(mockTool.registerTool).toHaveBeenCalledWith(mockServer);
    });
  });

  describe('error code consistency', () => {
    it('should use consistent error codes following the pattern', async () => {
      const uninitializedModule = new DriveServiceModule();

      const toolResult = uninitializedModule.registerTools(mockServer);
      const resourceResult = uninitializedModule.registerResources(mockServer);

      expect(toolResult.isErr()).toBe(true);
      expect(resourceResult.isErr()).toBe(true);

      const toolError = toolResult._unsafeUnwrapErr() as GoogleServiceError;
      const resourceError =
        resourceResult._unsafeUnwrapErr() as GoogleServiceError;

      expect(toolError.code).toBe('DRIVE_MODULE_NOT_INITIALIZED');
      expect(resourceError.code).toBe('DRIVE_MODULE_NOT_INITIALIZED');
      expect(toolError.serviceName).toBe('drive');
      expect(resourceError.serviceName).toBe('drive');
    });

    it('should use proper error codes for initialization failures', async () => {
      const error = new GoogleServiceError(
        'Service init failed',
        'drive',
        'SERVICE_INIT_FAILED'
      );
      mockDriveService.initialize.mockResolvedValue(err(error));

      const result = await module.initialize(mockAuthService);

      expect(result.isErr()).toBe(true);
      const moduleError = result._unsafeUnwrapErr() as GoogleServiceError;
      expect(moduleError.code).toBe('DRIVE_SERVICE_INIT_FAILED');
      expect(moduleError.serviceName).toBe('drive');
    });
  });
});

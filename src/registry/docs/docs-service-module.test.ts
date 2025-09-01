import { DocsServiceModule } from './docs-service-module.js';
import type { AuthService } from '../../services/auth.service.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DocsService } from '../../services/docs.service.js';
import { DriveService } from '../../services/drive.service.js';
import {
  CreateDocumentTool,
  GetDocumentTool,
  UpdateDocumentTool,
  InsertTextTool,
  ReplaceTextTool,
} from '../../tools/docs/index.js';
import { ok, err } from 'neverthrow';
import { GoogleServiceError } from '../../errors/index.js';

// Mock DocsService and DriveService
jest.mock('../../services/docs.service.js');
jest.mock('../../services/drive.service.js');

// Mock Docs tools
jest.mock('../../tools/docs/index.js');

const MockedDocsService = DocsService as jest.MockedClass<typeof DocsService>;
const MockedDriveService = DriveService as jest.MockedClass<
  typeof DriveService
>;

// Mock tool constructors
const MockedCreateDocumentTool = CreateDocumentTool as jest.MockedClass<
  typeof CreateDocumentTool
>;
const MockedGetDocumentTool = GetDocumentTool as jest.MockedClass<
  typeof GetDocumentTool
>;
const MockedUpdateDocumentTool = UpdateDocumentTool as jest.MockedClass<
  typeof UpdateDocumentTool
>;
const MockedInsertTextTool = InsertTextTool as jest.MockedClass<
  typeof InsertTextTool
>;
const MockedReplaceTextTool = ReplaceTextTool as jest.MockedClass<
  typeof ReplaceTextTool
>;

describe('DocsServiceModule', () => {
  let module: DocsServiceModule;
  let mockAuthService: AuthService;
  let mockServer: McpServer;
  let mockDocsService: jest.Mocked<DocsService>;
  let mockDriveService: jest.Mocked<DriveService>;
  let mockCreateDocumentTool: any;
  let mockGetDocumentTool: any;
  let mockUpdateDocumentTool: any;
  let mockInsertTextTool: any;
  let mockReplaceTextTool: any;

  beforeEach(() => {
    module = new DocsServiceModule();
    mockAuthService = {} as AuthService;
    mockServer = {
      registerResource: jest.fn(),
    } as unknown as McpServer;

    // Setup DocsService mock
    mockDocsService = {
      initialize: jest.fn(),
      getServiceName: jest.fn().mockReturnValue('DocsService'),
      getServiceVersion: jest.fn().mockReturnValue('v1'),
    } as unknown as jest.Mocked<DocsService>;

    // Setup DriveService mock
    mockDriveService = {
      initialize: jest.fn(),
      getServiceName: jest.fn().mockReturnValue('DriveService'),
      getServiceVersion: jest.fn().mockReturnValue('v3'),
    } as unknown as jest.Mocked<DriveService>;

    MockedDocsService.mockImplementation(() => mockDocsService);
    MockedDriveService.mockImplementation(() => mockDriveService);

    // Setup tool mocks
    mockCreateDocumentTool = {
      getToolName: jest.fn().mockReturnValue('google-workspace__docs__create'),
      registerTool: jest.fn(),
    };
    mockGetDocumentTool = {
      getToolName: jest.fn().mockReturnValue('google-workspace__docs__get'),
      registerTool: jest.fn(),
    };
    mockUpdateDocumentTool = {
      getToolName: jest.fn().mockReturnValue('google-workspace__docs__update'),
      registerTool: jest.fn(),
    };
    mockInsertTextTool = {
      getToolName: jest
        .fn()
        .mockReturnValue('google-workspace__docs__insert-text'),
      registerTool: jest.fn(),
    };
    mockReplaceTextTool = {
      getToolName: jest
        .fn()
        .mockReturnValue('google-workspace__docs__replace-text'),
      registerTool: jest.fn(),
    };

    MockedCreateDocumentTool.mockImplementation(() => mockCreateDocumentTool);
    MockedGetDocumentTool.mockImplementation(() => mockGetDocumentTool);
    MockedUpdateDocumentTool.mockImplementation(() => mockUpdateDocumentTool);
    MockedInsertTextTool.mockImplementation(() => mockInsertTextTool);
    MockedReplaceTextTool.mockImplementation(() => mockReplaceTextTool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('module properties', () => {
    it('should have correct module properties', () => {
      expect(module.name).toBe('docs');
      expect(module.displayName).toBe('Google Docs');
      expect(module.version).toBe('1.0.0');
    });

    it('should not be initialized initially', () => {
      expect(module.isInitialized()).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should initialize successfully with DriveService', async () => {
      mockDriveService.initialize.mockResolvedValue(ok(undefined));
      mockDocsService.initialize.mockResolvedValue(ok(undefined));

      const result = await module.initialize(mockAuthService);

      expect(result.isOk()).toBe(true);
      expect(module.isInitialized()).toBe(true);
      expect(mockDriveService.initialize).toHaveBeenCalled();
      expect(mockDocsService.initialize).toHaveBeenCalled();

      // Check that service is created and tools array is initialized
      expect(module.getTools()).toHaveLength(5); // Five tools registered
      expect(module.getDocsService()).toBeDefined();
      expect(module.getDriveService()).toBeDefined();
    });

    it('should initialize successfully without DriveService when it fails', async () => {
      mockDriveService.initialize.mockResolvedValue(
        err(
          new GoogleServiceError(
            'Drive init failed',
            'drive',
            'INIT_FAILED',
            500,
            {}
          )
        )
      );
      mockDocsService.initialize.mockResolvedValue(ok(undefined));

      const result = await module.initialize(mockAuthService);

      expect(result.isOk()).toBe(true);
      expect(module.isInitialized()).toBe(true);
      expect(mockDriveService.initialize).toHaveBeenCalled();
      expect(mockDocsService.initialize).toHaveBeenCalled();

      // Check that service is created and tools array is initialized
      expect(module.getTools()).toHaveLength(5); // Five tools still registered
      expect(module.getDocsService()).toBeDefined();
      expect(module.getDriveService()).toBeUndefined(); // DriveService should be undefined
    });

    it('should return the same result if already initialized', async () => {
      mockDriveService.initialize.mockResolvedValue(ok(undefined));
      mockDocsService.initialize.mockResolvedValue(ok(undefined));

      const result1 = await module.initialize(mockAuthService);
      const result2 = await module.initialize(mockAuthService);

      expect(result1.isOk()).toBe(true);
      expect(result2.isOk()).toBe(true);
      expect(mockDocsService.initialize).toHaveBeenCalledTimes(1); // Only called once
    });

    it('should fail when DocsService initialization fails', async () => {
      mockDriveService.initialize.mockResolvedValue(ok(undefined));
      mockDocsService.initialize.mockResolvedValue(
        err(
          new GoogleServiceError('Init failed', 'docs', 'INIT_FAILED', 500, {})
        )
      );

      const result = await module.initialize(mockAuthService);

      expect(result.isErr()).toBe(true);
      expect(module.isInitialized()).toBe(false);

      if (result.isErr()) {
        expect(result.error.message).toContain(
          'Failed to initialize Docs service'
        );
        expect(result.error.code).toBe('DOCS_SERVICE_INIT_FAILED');
      }
    });

    it('should handle unexpected errors during initialization', async () => {
      mockDriveService.initialize.mockRejectedValue(
        new Error('Unexpected error')
      );

      const result = await module.initialize(mockAuthService);

      expect(result.isErr()).toBe(true);
      expect(module.isInitialized()).toBe(false);

      if (result.isErr()) {
        expect(result.error.message).toContain(
          'Docs service module initialization failed'
        );
        expect(result.error.code).toBe('DOCS_MODULE_INIT_FAILED');
      }
    });
  });

  describe('registerTools', () => {
    beforeEach(async () => {
      mockDriveService.initialize.mockResolvedValue(ok(undefined));
      mockDocsService.initialize.mockResolvedValue(ok(undefined));
      await module.initialize(mockAuthService);
    });

    it('should register all tools successfully', () => {
      const result = module.registerTools(mockServer);

      expect(result.isOk()).toBe(true);
      expect(mockCreateDocumentTool.registerTool).toHaveBeenCalledWith(
        mockServer
      );
      expect(mockGetDocumentTool.registerTool).toHaveBeenCalledWith(mockServer);
      expect(mockUpdateDocumentTool.registerTool).toHaveBeenCalledWith(
        mockServer
      );
      expect(mockInsertTextTool.registerTool).toHaveBeenCalledWith(mockServer);
      expect(mockReplaceTextTool.registerTool).toHaveBeenCalledWith(mockServer);
    });

    it('should fail if module is not initialized', () => {
      const uninitializedModule = new DocsServiceModule();

      const result = uninitializedModule.registerTools(mockServer);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('DOCS_MODULE_NOT_INITIALIZED');
      }
    });

    it('should fail if tool registration throws error', () => {
      mockCreateDocumentTool.registerTool.mockImplementation(() => {
        throw new Error('Registration failed');
      });

      const result = module.registerTools(mockServer);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('TOOL_REGISTRATION_FAILED');
        expect(result.error.message).toContain(
          'Failed to register tool google-workspace__docs__create'
        );
      }
    });

    it('should handle individual tool registration failures', () => {
      // Mock one of the tools to throw during registration
      const mockTool = {
        getToolName: jest.fn().mockReturnValue('test-tool'),
        registerTool: jest.fn().mockImplementation(() => {
          throw new Error('Unexpected error');
        }),
      };

      // Replace the tools array with a mock that has a failing tool
      (module as any).tools = [mockTool];

      const result = module.registerTools(mockServer);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('TOOL_REGISTRATION_FAILED');
      }
    });
  });

  describe('registerResources', () => {
    beforeEach(async () => {
      mockDriveService.initialize.mockResolvedValue(ok(undefined));
      mockDocsService.initialize.mockResolvedValue(ok(undefined));
      await module.initialize(mockAuthService);
    });

    it('should register resources successfully (placeholder implementation)', () => {
      const result = module.registerResources(mockServer);

      expect(result.isOk()).toBe(true);
      // Currently no resources are registered, so just verify it doesn't throw
    });

    it('should fail if module is not initialized', () => {
      const uninitializedModule = new DocsServiceModule();

      const result = uninitializedModule.registerResources(mockServer);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('DOCS_MODULE_NOT_INITIALIZED');
      }
    });
  });

  describe('cleanup', () => {
    beforeEach(async () => {
      mockDriveService.initialize.mockResolvedValue(ok(undefined));
      mockDocsService.initialize.mockResolvedValue(ok(undefined));
      await module.initialize(mockAuthService);
    });

    it('should cleanup successfully', async () => {
      const result = await module.cleanup();

      expect(result.isOk()).toBe(true);
      expect(module.isInitialized()).toBe(false);
      expect(module.getTools()).toHaveLength(0);
      expect(module.getDocsService()).toBeUndefined();
      expect(module.getDriveService()).toBeUndefined();
    });

    it('should handle errors during cleanup', async () => {
      // Mock the logger to throw an error during cleanup
      const mockLogger = {
        info: jest.fn().mockImplementation(() => {
          throw new Error('Cleanup error');
        }),
        error: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
      };
      (module as any).logger = mockLogger;

      const result = await module.cleanup();

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('CLEANUP_FAILED');
      }
    });
  });

  describe('getHealthStatus', () => {
    it('should return unhealthy status when not initialized', () => {
      const status = module.getHealthStatus();

      expect(status.status).toBe('unhealthy');
      expect(status.message).toBe('Service module not initialized');
      expect(status.metrics?.toolsRegistered).toBe(0);
      expect(status.metrics?.resourcesRegistered).toBe(0);
      expect(status.lastChecked).toBeInstanceOf(Date);
    });

    it('should return healthy status when initialized', async () => {
      mockDriveService.initialize.mockResolvedValue(ok(undefined));
      mockDocsService.initialize.mockResolvedValue(ok(undefined));
      await module.initialize(mockAuthService);

      const status = module.getHealthStatus();

      expect(status.status).toBe('healthy');
      expect(status.message).toBeUndefined();
      expect(status.metrics?.toolsRegistered).toBe(5);
      expect(status.metrics?.resourcesRegistered).toBe(0);
      expect(status.metrics?.initializationTime).toBeGreaterThanOrEqual(0);
      expect(status.lastChecked).toBeInstanceOf(Date);
    });
  });

  describe('service getters', () => {
    it('should return undefined services when not initialized', () => {
      expect(module.getDocsService()).toBeUndefined();
      expect(module.getDriveService()).toBeUndefined();
      expect(module.getTools()).toHaveLength(0);
    });

    it('should return initialized services', async () => {
      mockDriveService.initialize.mockResolvedValue(ok(undefined));
      mockDocsService.initialize.mockResolvedValue(ok(undefined));
      await module.initialize(mockAuthService);

      expect(module.getDocsService()).toBeDefined();
      expect(module.getDriveService()).toBeDefined();
      expect(module.getTools()).toHaveLength(5);

      // Test that getTools returns a copy (defensive copy)
      const tools1 = module.getTools();
      const tools2 = module.getTools();
      expect(tools1).not.toBe(tools2); // Different array instances
      expect(tools1).toEqual(tools2); // Same content
    });
  });
});

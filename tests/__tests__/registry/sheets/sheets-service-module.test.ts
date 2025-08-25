import { SheetsServiceModule } from '../../../../src/registry/sheets/sheets-service-module.js';
import type { AuthService } from '../../../../src/services/auth.service.js';
import type { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SheetsService } from '../../../../src/services/sheets.service.js';
import { SheetsResources } from '../../../../src/resources/sheets-resources.js';
import { ok, err } from 'neverthrow';
import { GoogleServiceError } from '../../../../src/errors/index.js';

// Mock SheetsService
jest.mock('../../../../src/services/sheets.service.js');
jest.mock('../../../../src/resources/sheets-resources.js');

// Mock tool classes
jest.mock('../../../../src/tools/sheets/list.tool.js', () => ({
  SheetsListTool: jest.fn().mockImplementation(() => ({
    registerTool: jest.fn(),
    getToolName: jest.fn().mockReturnValue('sheets-list')
  }))
}));

jest.mock('../../../../src/tools/sheets/read.tool.js', () => ({
  SheetsReadTool: jest.fn().mockImplementation(() => ({
    registerTool: jest.fn(),
    getToolName: jest.fn().mockReturnValue('sheets-read')
  }))
}));

jest.mock('../../../../src/tools/sheets/write.tool.js', () => ({
  SheetsWriteTool: jest.fn().mockImplementation(() => ({
    registerTool: jest.fn(),
    getToolName: jest.fn().mockReturnValue('sheets-write')
  }))
}));

jest.mock('../../../../src/tools/sheets/append.tool.js', () => ({
  SheetsAppendTool: jest.fn().mockImplementation(() => ({
    registerTool: jest.fn(),
    getToolName: jest.fn().mockReturnValue('sheets-append')
  }))
}));

const MockedSheetsService = SheetsService as jest.MockedClass<typeof SheetsService>;
const MockedSheetsResources = SheetsResources as jest.MockedClass<typeof SheetsResources>;

describe('SheetsServiceModule', () => {
  let module: SheetsServiceModule;
  let mockAuthService: AuthService;
  let mockServer: McpServer;
  let mockSheetsService: jest.Mocked<SheetsService>;
  let mockSheetsResources: jest.Mocked<SheetsResources>;

  beforeEach(() => {
    module = new SheetsServiceModule();
    mockAuthService = {} as AuthService;
    mockServer = {
      registerResource: jest.fn()
    } as unknown as McpServer;

    // Setup SheetsService mock
    mockSheetsService = {
      initialize: jest.fn(),
      getServiceName: jest.fn().mockReturnValue('SheetsService'),
      getServiceVersion: jest.fn().mockReturnValue('v4')
    } as unknown as jest.Mocked<SheetsService>;

    // Setup SheetsResources mock
    mockSheetsResources = {
      getSpreadsheetSchema: jest.fn(),
      getSpreadsheetData: jest.fn()
    } as unknown as jest.Mocked<SheetsResources>;

    MockedSheetsService.mockImplementation(() => mockSheetsService);
    MockedSheetsResources.mockImplementation(() => mockSheetsResources);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('module properties', () => {
    it('should have correct module properties', () => {
      expect(module.name).toBe('sheets');
      expect(module.displayName).toBe('Google Sheets');
      expect(module.version).toBe('1.0.0');
    });

    it('should not be initialized initially', () => {
      expect(module.isInitialized()).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      mockSheetsService.initialize.mockResolvedValue(ok(undefined));

      const result = await module.initialize(mockAuthService);

      expect(result.isOk()).toBe(true);
      expect(module.isInitialized()).toBe(true);
      expect(mockSheetsService.initialize).toHaveBeenCalled();
      
      // Check that tools and resources are created
      expect(module.getTools()).toHaveLength(4); // List, Read, Write, Append
      expect(module.getSheetsService()).toBeDefined();
      expect(module.getSheetsResources()).toBeDefined();
    });

    it('should not re-initialize if already initialized', async () => {
      mockSheetsService.initialize.mockResolvedValue(ok(undefined));

      await module.initialize(mockAuthService);
      const result = await module.initialize(mockAuthService);

      expect(result.isOk()).toBe(true);
      expect(mockSheetsService.initialize).toHaveBeenCalledTimes(1);
    });

    it('should handle SheetsService initialization failure', async () => {
      const error = new GoogleServiceError('Service init failed', 'sheets', {});
      mockSheetsService.initialize.mockResolvedValue(err(error));

      const result = await module.initialize(mockAuthService);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain('Failed to initialize Sheets service');
      expect(module.isInitialized()).toBe(false);
    });

    it('should handle initialization exceptions', async () => {
      MockedSheetsService.mockImplementation(() => {
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
      mockSheetsService.initialize.mockResolvedValue(ok(undefined));
      await module.initialize(mockAuthService);
    });

    it('should register all tools successfully', () => {
      const tools = module.getTools();
      tools.forEach(tool => {
        tool.registerTool = jest.fn();
      });

      const result = module.registerTools(mockServer);

      expect(result.isOk()).toBe(true);
      tools.forEach(tool => {
        expect(tool.registerTool).toHaveBeenCalledWith(mockServer);
      });
    });

    it('should fail if not initialized', () => {
      const uninitializedModule = new SheetsServiceModule();
      
      const result = uninitializedModule.registerTools(mockServer);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain('not initialized');
    });

    it('should handle tool registration failure', () => {
      const tools = module.getTools();
      tools[0].registerTool = jest.fn(() => {
        throw new Error('Registration failed');
      });

      const result = module.registerTools(mockServer);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain('Registration failed');
    });
  });

  describe('registerResources', () => {
    beforeEach(async () => {
      mockSheetsService.initialize.mockResolvedValue(ok(undefined));
      await module.initialize(mockAuthService);
    });

    it('should register all resources successfully', () => {
      const result = module.registerResources(mockServer);

      expect(result.isOk()).toBe(true);
      expect(mockServer.registerResource).toHaveBeenCalledTimes(2);
      
      // Verify spreadsheet-schema resource registration
      expect(mockServer.registerResource).toHaveBeenCalledWith(
        'spreadsheet-schema',
        'schema://spreadsheets',
        expect.objectContaining({
          title: 'Spreadsheet Schema',
          mimeType: 'application/json'
        }),
        expect.any(Function)
      );

      // Verify spreadsheet-data resource registration - check the call arguments
      const calls = (mockServer.registerResource as jest.Mock).mock.calls;
      const spreadsheetDataCall = calls.find(call => call[0] === 'spreadsheet-data');
      expect(spreadsheetDataCall).toBeDefined();
      expect(spreadsheetDataCall[2]).toMatchObject({
        title: 'Spreadsheet Data',
        mimeType: 'application/json'
      });
    });

    it('should fail if not initialized', () => {
      const uninitializedModule = new SheetsServiceModule();
      
      const result = uninitializedModule.registerResources(mockServer);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain('not initialized');
    });

    it('should handle resource registration failure', () => {
      mockServer.registerResource = jest.fn(() => {
        throw new Error('Resource registration failed');
      });

      const result = module.registerResources(mockServer);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain('Resource registration failed');
    });
  });

  describe('cleanup', () => {
    beforeEach(async () => {
      mockSheetsService.initialize.mockResolvedValue(ok(undefined));
      await module.initialize(mockAuthService);
    });

    it('should cleanup successfully', async () => {
      const result = await module.cleanup();

      expect(result.isOk()).toBe(true);
      expect(module.isInitialized()).toBe(false);
      expect(module.getTools()).toHaveLength(0);
      expect(module.getSheetsService()).toBeUndefined();
      expect(module.getSheetsResources()).toBeUndefined();
    });

    it('should handle cleanup exceptions', async () => {
      // Simulate cleanup failure by making the module throw during cleanup
      const originalTools = (module as any).tools;
      Object.defineProperty(module, 'tools', {
        configurable: true,
        get: () => {
          throw new Error('Cleanup error');
        },
        set: () => {
          throw new Error('Cleanup error');
        }
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
      expect(healthStatus.metrics?.resourcesRegistered).toBe(2);
    });

    it('should return healthy status when initialized', async () => {
      mockSheetsService.initialize.mockResolvedValue(ok(undefined));
      await module.initialize(mockAuthService);

      const healthStatus = module.getHealthStatus();

      expect(healthStatus.status).toBe('healthy');
      expect(healthStatus.message).toBeUndefined();
      expect(healthStatus.metrics?.toolsRegistered).toBe(4);
      expect(healthStatus.metrics?.resourcesRegistered).toBe(2);
      expect(healthStatus.metrics?.initializationTime).toBeDefined();
    });

    it('should include lastChecked timestamp', () => {
      const beforeCheck = new Date();
      const healthStatus = module.getHealthStatus();
      const afterCheck = new Date();

      expect(healthStatus.lastChecked.getTime()).toBeGreaterThanOrEqual(beforeCheck.getTime());
      expect(healthStatus.lastChecked.getTime()).toBeLessThanOrEqual(afterCheck.getTime());
    });
  });

  describe('getters (testing utilities)', () => {
    beforeEach(async () => {
      mockSheetsService.initialize.mockResolvedValue(ok(undefined));
      await module.initialize(mockAuthService);
    });

    it('should provide access to internal services for testing', () => {
      expect(module.getSheetsService()).toBeDefined();
      expect(module.getSheetsResources()).toBeDefined();
      expect(module.getTools()).toHaveLength(4);
    });

    it('should return undefined for services when not initialized', async () => {
      await module.cleanup();
      
      expect(module.getSheetsService()).toBeUndefined();
      expect(module.getSheetsResources()).toBeUndefined();
      expect(module.getTools()).toHaveLength(0);
    });
  });
});
import { DocsServiceModule } from './docs-service-module.js';
import { ServiceRegistry } from '../service-registry.js';
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
import { GoogleServiceError, GoogleTimeoutError } from '../../errors/index.js';
import type { docs_v1 } from 'googleapis';

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

describe('Docs Integration Tests', () => {
  let serviceRegistry: ServiceRegistry;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockServer: McpServer;
  let mockDocsService: jest.Mocked<DocsService>;
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

    // Setup DocsService mock
    mockDocsService = {
      initialize: jest.fn().mockResolvedValue(ok(undefined)),
      getServiceName: jest.fn().mockReturnValue('DocsService'),
      getServiceVersion: jest.fn().mockReturnValue('v1'),
    } as unknown as jest.Mocked<DocsService>;

    // Setup DriveService mock
    mockDriveService = {
      initialize: jest.fn().mockResolvedValue(ok(undefined)),
      getServiceName: jest.fn().mockReturnValue('DriveService'),
      getServiceVersion: jest.fn().mockReturnValue('v3'),
    } as unknown as jest.Mocked<DriveService>;

    MockedDocsService.mockImplementation(() => mockDocsService);
    MockedDriveService.mockImplementation(() => mockDriveService);

    // Setup tool mocks
    const mockTool = {
      getToolName: jest.fn(),
      registerTool: jest.fn(),
    } as any;

    MockedCreateDocumentTool.mockImplementation(() => mockTool);
    MockedGetDocumentTool.mockImplementation(() => mockTool);
    MockedUpdateDocumentTool.mockImplementation(() => mockTool);
    MockedInsertTextTool.mockImplementation(() => mockTool);
    MockedReplaceTextTool.mockImplementation(() => mockTool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should integrate successfully with ServiceRegistry', async () => {
    // Register the Docs service module
    const docsModule = new DocsServiceModule();
    const registrationResult = serviceRegistry.registerModule(docsModule);

    expect(registrationResult.isOk()).toBe(true);

    // Initialize all modules (including Docs)
    const initResult = await serviceRegistry.initializeAll(mockAuthService);
    expect(initResult.isOk()).toBe(true);

    // Verify the module is properly registered and initialized
    const moduleNames = serviceRegistry.getModuleNames();
    expect(moduleNames.length).toBe(1);
    expect(moduleNames[0]).toBe('docs');

    const docsModuleInstance = serviceRegistry.getModule('docs');
    expect(docsModuleInstance).toBeDefined();
    expect(docsModuleInstance!.isInitialized()).toBe(true);

    // Register tools and resources
    const toolsResult = serviceRegistry.registerAllTools(mockServer);
    const resourcesResult = serviceRegistry.registerAllResources(mockServer);

    expect(toolsResult.isOk()).toBe(true);
    expect(resourcesResult.isOk()).toBe(true);
  });

  it('should handle initialization failure gracefully', async () => {
    const docsModule = new DocsServiceModule();
    serviceRegistry.registerModule(docsModule);

    // Mock DocsService initialization failure
    mockDocsService.initialize.mockResolvedValue(
      err(
        new GoogleServiceError(
          'Docs init failed',
          'docs',
          'INIT_FAILED',
          500,
          {}
        )
      )
    );

    const initResult = await serviceRegistry.initializeAll(mockAuthService);
    expect(initResult.isErr()).toBe(true);

    const docsModuleInstance = serviceRegistry.getModule('docs');
    expect(docsModuleInstance).toBeDefined();
    expect(docsModuleInstance!.isInitialized()).toBe(false);
  });

  it('should work without DriveService when Drive initialization fails', async () => {
    const docsModule = new DocsServiceModule();
    serviceRegistry.registerModule(docsModule);

    // Mock DriveService initialization failure
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

    const initResult = await serviceRegistry.initializeAll(mockAuthService);
    expect(initResult.isOk()).toBe(true); // Should still succeed without Drive

    const docsModuleInstance = serviceRegistry.getModule('docs');
    expect(docsModuleInstance).toBeDefined();
    expect(docsModuleInstance!.isInitialized()).toBe(true);
  });

  it('should handle tool registration failures', async () => {
    const docsModule = new DocsServiceModule();
    serviceRegistry.registerModule(docsModule);

    await serviceRegistry.initializeAll(mockAuthService);

    // Mock tool registration failure by making the module's registerTools method fail
    jest
      .spyOn(docsModule, 'registerTools')
      .mockReturnValue(
        err(
          new GoogleServiceError(
            'Tool registration failed',
            'docs',
            'TOOL_REGISTRATION_FAILED',
            500,
            {}
          )
        )
      );

    const toolsResult = serviceRegistry.registerAllTools(mockServer);
    expect(toolsResult.isErr()).toBe(true);
  });

  it('should provide health status information', async () => {
    const docsModule = new DocsServiceModule();
    serviceRegistry.registerModule(docsModule);

    await serviceRegistry.initializeAll(mockAuthService);

    const healthStatus = serviceRegistry.getOverallHealthStatus();
    expect(healthStatus.status).toBe('healthy');
    expect(healthStatus.modules.docs).toBeDefined();
    expect(healthStatus.modules.docs.status).toBe('healthy');
    expect(healthStatus.modules.docs.metrics?.toolsRegistered).toBe(5);
  });

  it('should cleanup properly', async () => {
    const docsModule = new DocsServiceModule();
    serviceRegistry.registerModule(docsModule);

    await serviceRegistry.initializeAll(mockAuthService);

    const cleanupResult = await serviceRegistry.cleanup();
    expect(cleanupResult.isOk()).toBe(true);

    // Verify the module is no longer initialized
    const docsModuleInstance = serviceRegistry.getModule('docs');
    expect(docsModuleInstance!.isInitialized()).toBe(false);
  });

  it('should handle timeout errors during initialization', async () => {
    const docsModule = new DocsServiceModule();
    serviceRegistry.registerModule(docsModule);

    // Mock timeout error
    mockDocsService.initialize.mockResolvedValue(
      err(new GoogleTimeoutError('Initialization timeout', 'request', 30000))
    );

    const initResult = await serviceRegistry.initializeAll(mockAuthService);
    expect(initResult.isErr()).toBe(true);

    if (initResult.isErr()) {
      expect(initResult.error.message).toContain(
        'Failed to initialize Docs service'
      );
    }
  });

  it('should support multiple concurrent tool executions', async () => {
    const docsModule = new DocsServiceModule();
    serviceRegistry.registerModule(docsModule);

    await serviceRegistry.initializeAll(mockAuthService);
    await serviceRegistry.registerAllTools(mockServer);

    // Verify all tools are registered
    const docsModuleInstance = serviceRegistry.getModule(
      'docs'
    ) as DocsServiceModule;
    expect(docsModuleInstance!.getTools()).toHaveLength(5);

    // Simulate concurrent tool usage
    const tools = docsModuleInstance!.getTools();
    const toolExecutions = tools.map(tool =>
      Promise.resolve(tool.getToolName())
    );

    const results = await Promise.all(toolExecutions);
    expect(results).toHaveLength(5);
  });

  it('should integrate with existing Drive and Sheets modules', async () => {
    // This test simulates a multi-service environment
    const docsModule = new DocsServiceModule();
    serviceRegistry.registerModule(docsModule);

    // Mock additional services that might be present
    const mockOtherModule = {
      name: 'sheets',
      displayName: 'Google Sheets',
      version: '1.0.0',
      initialize: jest.fn().mockResolvedValue(ok(undefined)),
      registerTools: jest.fn().mockReturnValue(ok(undefined)),
      registerResources: jest.fn().mockReturnValue(ok(undefined)),
      isInitialized: jest.fn().mockReturnValue(true),
      getHealthStatus: jest.fn().mockReturnValue({
        status: 'healthy',
        lastChecked: new Date(),
        metrics: { toolsRegistered: 6, resourcesRegistered: 2 },
      }),
    };

    serviceRegistry.registerModule(mockOtherModule as any);

    const initResult = await serviceRegistry.initializeAll(mockAuthService);
    expect(initResult.isOk()).toBe(true);

    const moduleNames = serviceRegistry.getModuleNames();
    expect(moduleNames).toContain('docs');
    expect(moduleNames).toContain('sheets');
    expect(moduleNames).toHaveLength(2);
  });
});

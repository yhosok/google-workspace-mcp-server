import { DriveServiceModule } from './drive-service-module.js';
import { ServiceRegistry } from '../service-registry.js';
import type { AuthService } from '../../services/auth.service.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DriveService } from '../../services/drive.service.js';
import { ok } from 'neverthrow';

// Mock DriveService
jest.mock('../../services/drive.service.js');

const MockedDriveService = DriveService as jest.MockedClass<
  typeof DriveService
>;

describe('DriveServiceModule Integration', () => {
  let serviceRegistry: ServiceRegistry;
  let mockAuthService: AuthService;
  let mockServer: McpServer;
  let mockDriveService: jest.Mocked<DriveService>;

  beforeEach(() => {
    serviceRegistry = new ServiceRegistry();
    mockAuthService = {} as AuthService;
    mockServer = {
      registerResource: jest.fn(),
    } as unknown as McpServer;

    // Setup DriveService mock
    mockDriveService = {
      initialize: jest.fn().mockResolvedValue(ok(undefined)),
      getServiceName: jest.fn().mockReturnValue('DriveService'),
      getServiceVersion: jest.fn().mockReturnValue('v3'),
    } as unknown as jest.Mocked<DriveService>;

    MockedDriveService.mockImplementation(() => mockDriveService);
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
});

import { ServiceRegistry } from '../../../src/registry/service-registry.js';
import type { ServiceModule, ServiceModuleHealthStatus } from '../../../src/registry/service-module.interface.js';
import type { AuthService } from '../../../src/services/auth.service.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ok, err } from 'neverthrow';
import { GoogleServiceError } from '../../../src/errors/index.js';

// Mock implementations
class MockServiceModule implements ServiceModule {
  public readonly name: string;
  public readonly displayName: string;
  public readonly version = '1.0.0';
  private initialized = false;
  private shouldFailInitialization = false;
  private shouldFailToolRegistration = false;
  private shouldFailResourceRegistration = false;

  constructor(
    name: string, 
    displayName?: string,
    options: {
      failInitialization?: boolean;
      failToolRegistration?: boolean;
      failResourceRegistration?: boolean;
    } = {}
  ) {
    this.name = name;
    this.displayName = displayName || name;
    this.shouldFailInitialization = options.failInitialization || false;
    this.shouldFailToolRegistration = options.failToolRegistration || false;
    this.shouldFailResourceRegistration = options.failResourceRegistration || false;
  }

  async initialize(authService: AuthService) {
    if (this.shouldFailInitialization) {
      return err(new GoogleServiceError(
        `Initialization failed for ${this.name}`,
        this.name,
        'INITIALIZATION_FAILED'
      ));
    }
    this.initialized = true;
    return ok(undefined);
  }

  registerTools(server: McpServer) {
    if (this.shouldFailToolRegistration) {
      return err(new GoogleServiceError(
        `Tool registration failed for ${this.name}`,
        this.name,
        'TOOL_REGISTRATION_FAILED'
      ));
    }
    return ok(undefined);
  }

  registerResources(server: McpServer) {
    if (this.shouldFailResourceRegistration) {
      return err(new GoogleServiceError(
        `Resource registration failed for ${this.name}`,
        this.name,
        'RESOURCE_REGISTRATION_FAILED'
      ));
    }
    return ok(undefined);
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getHealthStatus(): ServiceModuleHealthStatus {
    return {
      status: this.initialized ? 'healthy' : 'unhealthy',
      lastChecked: new Date(),
      metrics: {
        toolsRegistered: 2,
        resourcesRegistered: 1,
        initializationTime: 100
      }
    };
  }

  async cleanup() {
    this.initialized = false;
    return ok(undefined);
  }
}

const createMockAuthService = (): AuthService => ({} as AuthService);
const createMockServer = (): McpServer => ({} as McpServer);

describe('ServiceRegistry', () => {
  let registry: ServiceRegistry;
  let mockAuthService: AuthService;
  let mockServer: McpServer;

  beforeEach(() => {
    registry = new ServiceRegistry();
    mockAuthService = createMockAuthService();
    mockServer = createMockServer();
  });

  describe('registerModule', () => {
    it('should register a service module successfully', () => {
      const module = new MockServiceModule('test-service');
      const result = registry.registerModule(module);

      expect(result.isOk()).toBe(true);
      expect(registry.getModule('test-service')).toBe(module);
      expect(registry.getModuleNames()).toContain('test-service');
    });

    it('should prevent duplicate module registration', () => {
      const module1 = new MockServiceModule('test-service');
      const module2 = new MockServiceModule('test-service');

      registry.registerModule(module1);
      const result = registry.registerModule(module2);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain('already registered');
    });

    it('should maintain module registration order', () => {
      const modules = [
        new MockServiceModule('service1'),
        new MockServiceModule('service2'),
        new MockServiceModule('service3')
      ];

      modules.forEach(module => {
        const result = registry.registerModule(module);
        expect(result.isOk()).toBe(true);
      });

      const names = registry.getModuleNames();
      expect(names).toEqual(['service1', 'service2', 'service3']);
    });
  });

  describe('unregisterModule', () => {
    it('should unregister a module successfully', async () => {
      const module = new MockServiceModule('test-service');
      registry.registerModule(module);

      const result = await registry.unregisterModule('test-service');

      expect(result.isOk()).toBe(true);
      expect(registry.getModule('test-service')).toBeUndefined();
      expect(registry.getModuleNames()).not.toContain('test-service');
    });

    it('should return error for non-existent module', async () => {
      const result = await registry.unregisterModule('non-existent');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain('not found');
    });

    it('should call cleanup on module if available', async () => {
      const module = new MockServiceModule('test-service');
      const cleanupSpy = jest.spyOn(module, 'cleanup');
      
      registry.registerModule(module);
      await registry.unregisterModule('test-service');

      expect(cleanupSpy).toHaveBeenCalled();
    });
  });

  describe('initializeAll', () => {
    it('should initialize all registered modules', async () => {
      const modules = [
        new MockServiceModule('service1'),
        new MockServiceModule('service2')
      ];

      modules.forEach(module => registry.registerModule(module));

      const result = await registry.initializeAll(mockAuthService);

      expect(result.isOk()).toBe(true);
      expect(registry.getIsInitialized()).toBe(true);
      
      modules.forEach(module => {
        expect(module.isInitialized()).toBe(true);
      });

      expect(registry.getInitializationOrder()).toEqual(['service1', 'service2']);
    });

    it('should fail fast on module initialization failure', async () => {
      const modules = [
        new MockServiceModule('service1'),
        new MockServiceModule('service2', undefined, { failInitialization: true }),
        new MockServiceModule('service3')
      ];

      modules.forEach(module => registry.registerModule(module));

      const result = await registry.initializeAll(mockAuthService);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain('service2');
      expect(registry.getIsInitialized()).toBe(false);
    });

    it('should not re-initialize if already initialized', async () => {
      const module = new MockServiceModule('service1');
      const initSpy = jest.spyOn(module, 'initialize');
      
      registry.registerModule(module);
      
      await registry.initializeAll(mockAuthService);
      await registry.initializeAll(mockAuthService);

      expect(initSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('registerAllTools', () => {
    it('should register tools from all initialized modules', async () => {
      const modules = [
        new MockServiceModule('service1'),
        new MockServiceModule('service2')
      ];

      modules.forEach(module => {
        registry.registerModule(module);
        jest.spyOn(module, 'registerTools');
      });

      await registry.initializeAll(mockAuthService);
      const result = registry.registerAllTools(mockServer);

      expect(result.isOk()).toBe(true);
      
      modules.forEach(module => {
        expect(module.registerTools).toHaveBeenCalledWith(mockServer);
      });
    });

    it('should fail if registry is not initialized', () => {
      const module = new MockServiceModule('service1');
      registry.registerModule(module);

      const result = registry.registerAllTools(mockServer);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain('not initialized');
    });

    it('should fail fast on tool registration error', async () => {
      const modules = [
        new MockServiceModule('service1'),
        new MockServiceModule('service2', undefined, { failToolRegistration: true })
      ];

      modules.forEach(module => registry.registerModule(module));
      await registry.initializeAll(mockAuthService);

      const result = registry.registerAllTools(mockServer);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain('service2');
    });
  });

  describe('registerAllResources', () => {
    it('should register resources from all initialized modules', async () => {
      const modules = [
        new MockServiceModule('service1'),
        new MockServiceModule('service2')
      ];

      modules.forEach(module => {
        registry.registerModule(module);
        jest.spyOn(module, 'registerResources');
      });

      await registry.initializeAll(mockAuthService);
      const result = registry.registerAllResources(mockServer);

      expect(result.isOk()).toBe(true);
      
      modules.forEach(module => {
        expect(module.registerResources).toHaveBeenCalledWith(mockServer);
      });
    });

    it('should fail if registry is not initialized', () => {
      const module = new MockServiceModule('service1');
      registry.registerModule(module);

      const result = registry.registerAllResources(mockServer);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain('not initialized');
    });

    it('should fail fast on resource registration error', async () => {
      const modules = [
        new MockServiceModule('service1'),
        new MockServiceModule('service2', undefined, { failResourceRegistration: true })
      ];

      modules.forEach(module => registry.registerModule(module));
      await registry.initializeAll(mockAuthService);

      const result = registry.registerAllResources(mockServer);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain('service2');
    });
  });

  describe('getOverallHealthStatus', () => {
    it('should return overall health status', async () => {
      const modules = [
        new MockServiceModule('service1'),
        new MockServiceModule('service2')
      ];

      modules.forEach(module => registry.registerModule(module));
      await registry.initializeAll(mockAuthService);

      const healthStatus = registry.getOverallHealthStatus();

      expect(healthStatus.status).toBe('healthy');
      expect(healthStatus.summary.healthy).toBe(2);
      expect(healthStatus.summary.total).toBe(2);
      expect(healthStatus.modules).toHaveProperty('service1');
      expect(healthStatus.modules).toHaveProperty('service2');
    });
  });

  describe('cleanup', () => {
    it('should cleanup all modules in reverse order', async () => {
      const modules = [
        new MockServiceModule('service1'),
        new MockServiceModule('service2'),
        new MockServiceModule('service3')
      ];

      const cleanupOrder: string[] = [];
      modules.forEach(module => {
        registry.registerModule(module);
        const originalCleanup = module.cleanup;
        module.cleanup = jest.fn(async () => {
          cleanupOrder.push(module.name);
          return originalCleanup?.call(module) || ok(undefined);
        });
      });

      await registry.initializeAll(mockAuthService);
      await registry.cleanup();

      expect(cleanupOrder).toEqual(['service3', 'service2', 'service1']);
      expect(registry.getIsInitialized()).toBe(false);
    });

    it('should continue cleanup even if some modules fail', async () => {
      const modules = [
        new MockServiceModule('service1'),
        new MockServiceModule('service2'),
        new MockServiceModule('service3')
      ];

      // Make middle service fail cleanup
      (modules[1] as any).cleanup = jest.fn(async () => err(new GoogleServiceError(
        'Cleanup failed',
        'service2',
        'CLEANUP_FAILED'
      )));

      modules.forEach(module => registry.registerModule(module));
      await registry.initializeAll(mockAuthService);

      const result = await registry.cleanup();

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().message).toContain('1 error(s)');
      
      // Should still reset state
      expect(registry.getIsInitialized()).toBe(false);
    });
  });
});
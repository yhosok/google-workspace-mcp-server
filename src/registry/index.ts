// Core registry interfaces and classes
export type {
  ServiceModule,
  ServiceModuleHealthStatus,
  ServiceModuleConfig,
} from './service-module.interface.js';
export { ServiceRegistry } from './service-registry.js';

// Service module implementations
export { SheetsServiceModule } from './sheets/sheets-service-module.js';

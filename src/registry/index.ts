// Core registry interfaces and classes
export type {
  ServiceModule,
  ServiceModuleHealthStatus,
  ServiceModuleConfig,
} from './service-module.interface.js';
export { ServiceRegistry } from './service-registry.js';

// Service module implementations
export { SheetsServiceModule } from './sheets/sheets-service-module.js';
export { CalendarServiceModule } from './calendar/calendar-service-module.js';
export { DriveServiceModule } from './drive/drive-service-module.js';
export { DocsServiceModule } from './docs/docs-service-module.js';

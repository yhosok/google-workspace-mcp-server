import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Result, ok, err } from 'neverthrow';
import { ToolRegistry } from './tool-registry.js';
import {
  GoogleWorkspaceError,
  GoogleServiceError,
} from '../../errors/index.js';
import type { Logger } from '../../utils/logger.js';
import type { MCPToolResult } from '../../types/index.js';

// Mock concrete implementation for testing
class TestToolRegistry extends ToolRegistry<
  { testParam: string },
  MCPToolResult
> {
  public getToolName(): string {
    return 'test-tool';
  }

  public getToolMetadata() {
    return {
      title: 'Test Tool',
      description: 'A test tool for unit testing',
      inputSchema: {
        testParam: z.string().describe('A test parameter'),
      },
    };
  }

  public async executeImpl(params: {
    testParam: string;
  }): Promise<Result<MCPToolResult, GoogleWorkspaceError>> {
    return ok({
      content: [
        {
          type: 'text',
          text: `Test executed with param: ${params.testParam}`,
        },
      ],
    });
  }
}

// Mock classes
const mockMcpServer = {
  registerTool: jest.fn(),
} as unknown as McpServer;

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
} as unknown as Logger;

describe('ToolRegistry', () => {
  let toolRegistry: TestToolRegistry;

  beforeEach(() => {
    jest.clearAllMocks();
    toolRegistry = new TestToolRegistry(mockLogger);
  });

  describe('Abstract class structure', () => {
    it('should require getToolName to be implemented', () => {
      expect(toolRegistry.getToolName()).toBe('test-tool');
    });

    it('should require getToolMetadata to be implemented', () => {
      const metadata = toolRegistry.getToolMetadata();
      expect(metadata.title).toBe('Test Tool');
      expect(metadata.description).toBe('A test tool for unit testing');
      expect(metadata.inputSchema).toBeDefined();
    });

    it('should require executeImpl to be implemented', async () => {
      const result = await toolRegistry.executeImpl({ testParam: 'test' });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.content).toHaveLength(1);
        expect(result.value.content[0].text).toBe(
          'Test executed with param: test'
        );
      }
    });
  });

  describe('registerTool method', () => {
    it('should register tool with server using tool name and metadata', () => {
      toolRegistry.registerTool(mockMcpServer);

      expect(mockMcpServer.registerTool).toHaveBeenCalledWith(
        'test-tool',
        {
          title: 'Test Tool',
          description: 'A test tool for unit testing',
          inputSchema: expect.any(Object),
        },
        expect.any(Function)
      );
    });

    it('should create handler function that calls executeImpl', async () => {
      toolRegistry.registerTool(mockMcpServer);

      // Get the handler function that was passed to registerTool
      const registerCallArgs = (
        mockMcpServer.registerTool as jest.MockedFunction<any>
      ).mock.calls[0];
      const handler = registerCallArgs[2];

      const result = await handler({ testParam: 'test-value' });
      expect(result.content[0].text).toBe(
        'Test executed with param: test-value'
      );
    });

    it('should log tool registration', () => {
      toolRegistry.registerTool(mockMcpServer);

      expect(mockLogger.info).toHaveBeenCalledWith('Registering tool', {
        toolName: 'test-tool',
        title: 'Test Tool',
      });
    });
  });

  describe('Error handling', () => {
    it('should handle errors in executeImpl gracefully', async () => {
      class FailingToolRegistry extends ToolRegistry<unknown, MCPToolResult> {
        getToolName(): string {
          return 'failing-tool';
        }

        getToolMetadata() {
          return {
            title: 'Failing Tool',
            description: 'A tool that fails',
            inputSchema: {},
          };
        }

        async executeImpl(): Promise<
          Result<MCPToolResult, GoogleWorkspaceError>
        > {
          const error = new GoogleServiceError(
            'Test error',
            'test-service',
            'TEST_ERROR',
            500
          );
          return err(error);
        }
      }

      const failingTool = new FailingToolRegistry(mockLogger);
      failingTool.registerTool(mockMcpServer);

      const registerCallArgs = (
        mockMcpServer.registerTool as jest.MockedFunction<any>
      ).mock.calls[0];
      const handler = registerCallArgs[2];

      await expect(handler({})).rejects.toThrow(GoogleServiceError);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Tool execution failed',
        expect.objectContaining({
          toolName: 'failing-tool',
          error: expect.any(Object),
          requestId: expect.any(String),
          executionTime: expect.any(Number),
        })
      );
    });
  });

  describe('Parameter validation integration', () => {
    it('should work with zod schema validation', async () => {
      interface ValidatingParams {
        requiredParam: string;
        optionalParam?: number;
      }

      class ValidatingToolRegistry extends ToolRegistry<
        ValidatingParams,
        MCPToolResult
      > {
        getToolName(): string {
          return 'validating-tool';
        }

        getToolMetadata() {
          return {
            title: 'Validating Tool',
            description: 'A tool with validation',
            inputSchema: {
              requiredParam: z.string().min(1).describe('A required parameter'),
              optionalParam: z
                .number()
                .optional()
                .describe('An optional parameter'),
            },
          };
        }

        async executeImpl(
          params: ValidatingParams
        ): Promise<Result<MCPToolResult, GoogleWorkspaceError>> {
          return ok({
            content: [
              {
                type: 'text',
                text: `Validated params: ${params.requiredParam}, ${params.optionalParam || 'none'}`,
              },
            ],
          });
        }
      }

      const validatingTool = new ValidatingToolRegistry(mockLogger);
      validatingTool.registerTool(mockMcpServer);

      const registerCallArgs = (
        mockMcpServer.registerTool as jest.MockedFunction<any>
      ).mock.calls[0];
      const handler = registerCallArgs[2];

      // Valid parameters
      const result = await handler({
        requiredParam: 'test',
        optionalParam: 42,
      });
      expect(result.content[0].text).toBe('Validated params: test, 42');

      // Only required parameters
      const result2 = await handler({ requiredParam: 'test' });
      expect(result2.content[0].text).toBe('Validated params: test, none');
    });
  });

  describe('Logger integration', () => {
    it('should use provided logger', () => {
      expect(toolRegistry['logger']).toBe(mockLogger);
    });

    it('should create default logger if none provided', () => {
      const toolWithoutLogger = new TestToolRegistry();
      expect(toolWithoutLogger['logger']).toBeDefined();
    });
  });

  describe('Tool registration patterns', () => {
    it('should support complex input schemas', () => {
      interface ComplexParams {
        spreadsheetId: string;
        range: string;
        values: string[][];
        options?: {
          majorDimension?: 'ROWS' | 'COLUMNS';
          valueInputOption?: 'RAW' | 'USER_ENTERED';
        };
      }

      class ComplexToolRegistry extends ToolRegistry<
        ComplexParams,
        MCPToolResult
      > {
        getToolName(): string {
          return 'complex-tool';
        }

        getToolMetadata() {
          return {
            title: 'Complex Tool',
            description: 'A tool with complex schema',
            inputSchema: {
              spreadsheetId: z.string().describe('The spreadsheet ID'),
              range: z.string().describe('The range to operate on'),
              values: z
                .array(z.array(z.string()))
                .describe('2D array of values'),
              options: z
                .object({
                  majorDimension: z.enum(['ROWS', 'COLUMNS']).optional(),
                  valueInputOption: z.enum(['RAW', 'USER_ENTERED']).optional(),
                })
                .optional(),
            },
          };
        }

        async executeImpl(
          params: ComplexParams
        ): Promise<Result<MCPToolResult, GoogleWorkspaceError>> {
          return ok({
            content: [
              {
                type: 'text',
                text: 'Complex tool executed',
              },
            ],
          });
        }
      }

      const complexTool = new ComplexToolRegistry(mockLogger);
      complexTool.registerTool(mockMcpServer);

      expect(mockMcpServer.registerTool).toHaveBeenCalledWith(
        'complex-tool',
        expect.objectContaining({
          title: 'Complex Tool',
          description: 'A tool with complex schema',
        }),
        expect.any(Function)
      );
    });
  });

  describe('Tool registry lifecycle', () => {
    it('should maintain tool state across multiple calls', async () => {
      class StatefulToolRegistry extends ToolRegistry<unknown, MCPToolResult> {
        private callCount = 0;

        getToolName(): string {
          return 'stateful-tool';
        }

        getToolMetadata() {
          return {
            title: 'Stateful Tool',
            description: 'A tool that maintains state',
            inputSchema: {},
          };
        }

        async executeImpl(): Promise<
          Result<MCPToolResult, GoogleWorkspaceError>
        > {
          this.callCount++;
          return ok({
            content: [
              {
                type: 'text',
                text: `Call count: ${this.callCount}`,
              },
            ],
          });
        }
      }

      const statefulTool = new StatefulToolRegistry(mockLogger);
      statefulTool.registerTool(mockMcpServer);

      const registerCallArgs = (
        mockMcpServer.registerTool as jest.MockedFunction<any>
      ).mock.calls[0];
      const handler = registerCallArgs[2];

      const result1 = await handler({});
      expect(result1.content[0].text).toBe('Call count: 1');

      const result2 = await handler({});
      expect(result2.content[0].text).toBe('Call count: 2');
    });
  });
});

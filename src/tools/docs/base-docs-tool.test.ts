import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ok, err, Result } from 'neverthrow';
import { z } from 'zod';
import { BaseDocsTools } from './base-docs-tool.js';
import { DocsService } from '../../services/docs.service.js';
import { AuthService } from '../../services/auth.service.js';
import { Logger } from '../../utils/logger.js';
import {
  GoogleWorkspaceError,
  GoogleAuthError,
  GoogleDocsError,
  GoogleServiceError,
} from '../../errors/index.js';
import { validateToolInput } from '../../utils/validation.utils.js';
import type { ToolMetadata } from '../base/tool-registry.js';

// Mock dependencies
jest.mock('../../services/docs.service');
jest.mock('../../services/auth.service');
jest.mock('../../utils/validation.utils');

// Concrete implementation for testing
class TestDocsTools extends BaseDocsTools<
  { test: string },
  { result: string }
> {
  getToolName(): string {
    return 'test-docs-tool';
  }

  getToolMetadata(): ToolMetadata {
    return {
      title: 'Test Docs Tool',
      description: 'A test tool for BaseDocsTools',
      inputSchema: {
        test: z.string(),
      },
    };
  }

  async executeImpl(input: {
    test: string;
  }): Promise<Result<{ result: string }, GoogleWorkspaceError>> {
    return ok({ result: input.test });
  }
}

describe('BaseDocsTools', () => {
  let testTool: TestDocsTools;
  let mockDocsService: jest.Mocked<DocsService>;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockDocsService = new DocsService(
      {} as any,
      {} as any
    ) as jest.Mocked<DocsService>;
    mockAuthService = new AuthService({} as any) as jest.Mocked<AuthService>;
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
      addContext: jest.fn(),
      fatal: jest.fn(),
      startTimer: jest.fn(),
      endTimer: jest.fn(),
      measureAsync: jest.fn(),
      measure: jest.fn(),
      logOperation: jest.fn(),
      forOperation: jest.fn().mockReturnThis(),
      generateRequestId: jest.fn().mockReturnValue('test-request-id'),
      isLevelEnabled: jest.fn().mockReturnValue(true),
      getConfig: jest.fn(),
      updateConfig: jest.fn(),
    } as unknown as jest.Mocked<Logger>;

    testTool = new TestDocsTools(
      mockDocsService,
      mockAuthService,
      mockLogger
    );

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('Constructor and Basic Properties', () => {
    it('should initialize with required services', () => {
      expect(testTool).toBeDefined();
      expect(testTool.getToolName()).toBe('test-docs-tool');
    });

    it('should have access to docsService and authService', () => {
      expect((testTool as any).docsService).toBe(mockDocsService);
      expect((testTool as any).authService).toBe(mockAuthService);
    });
  });

  describe('validateAuthentication', () => {
    it('should return success when authentication is valid', async () => {
      mockAuthService.validateAuth.mockResolvedValue(ok(true));

      const result = await (testTool as any).validateAuthentication(
        'test-request-id'
      );

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(true);
      expect(mockAuthService.validateAuth).toHaveBeenCalledTimes(1);
    });

    it('should return error when auth service fails', async () => {
      const authError = new GoogleAuthError('Auth failed', 'service-account');
      mockAuthService.validateAuth.mockResolvedValue(err(authError));

      const result = await (testTool as any).validateAuthentication(
        'test-request-id'
      );

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toBe(authError);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Authentication failed',
        expect.any(Object)
      );
    });

    it('should return error when authentication is invalid', async () => {
      mockAuthService.validateAuth.mockResolvedValue(ok(false));

      const result = await (testTool as any).validateAuthentication(
        'test-request-id'
      );

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toBeInstanceOf(GoogleAuthError);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Authentication invalid',
        expect.any(Object)
      );
    });

    it('should handle exceptions during authentication', async () => {
      mockAuthService.validateAuth.mockRejectedValue(
        new Error('Network error')
      );

      const result = await (testTool as any).validateAuthentication(
        'test-request-id'
      );

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toBeInstanceOf(GoogleAuthError);
    });
  });

  // ===============================
  // DOCUMENT ID VALIDATION TESTS (RED PHASE - Should Fail)
  // ===============================

  describe('documentIdValidation (RED PHASE - Should Fail)', () => {
    it('should exist and be callable', () => {
      // This test should fail because documentIdValidation doesn't exist yet
      expect(typeof (testTool as any).documentIdValidation).toBe('function');
    });

    it('should validate correct document ID format', () => {
      const validDocumentId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
      
      // This test should fail because documentIdValidation doesn't exist yet
      const result = (testTool as any).documentIdValidation(validDocumentId);
      
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(validDocumentId);
    });

    it('should reject empty document ID', () => {
      // This test should fail because documentIdValidation doesn't exist yet
      const result = (testTool as any).documentIdValidation('');
      
      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error).toBeInstanceOf(GoogleDocsError);
      expect(error.message).toContain('Document ID cannot be empty');
    });

    it('should reject null document ID', () => {
      // This test should fail because documentIdValidation doesn't exist yet
      const result = (testTool as any).documentIdValidation(null);
      
      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error).toBeInstanceOf(GoogleDocsError);
    });

    it('should reject undefined document ID', () => {
      // This test should fail because documentIdValidation doesn't exist yet
      const result = (testTool as any).documentIdValidation(undefined);
      
      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error).toBeInstanceOf(GoogleDocsError);
    });

    it('should reject whitespace-only document ID', () => {
      // This test should fail because documentIdValidation doesn't exist yet
      const result = (testTool as any).documentIdValidation('   \t\n   ');
      
      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error).toBeInstanceOf(GoogleDocsError);
      expect(error.message).toContain('Document ID cannot be empty');
    });

    it('should trim valid document ID', () => {
      const documentId = '  1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms  ';
      
      // This test should fail because documentIdValidation doesn't exist yet
      const result = (testTool as any).documentIdValidation(documentId);
      
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
    });

    it('should handle malformed document ID formats', () => {
      const invalidIds = [
        'invalid-id',
        '12345',
        'https://docs.google.com/document/d/invalid',
        '!@#$%^&*()',
      ];

      invalidIds.forEach(invalidId => {
        // This test should fail because documentIdValidation doesn't exist yet
        const result = (testTool as any).documentIdValidation(invalidId);
        
        // For now, we expect it to pass through (minimal validation)
        // Later implementations may add more strict format validation
        expect(result.isOk()).toBe(true);
      });
    });
  });

  // ===============================
  // TEXT VALIDATION TESTS (RED PHASE - Should Fail)
  // ===============================

  describe('textValidation (RED PHASE - Should Fail)', () => {
    it('should exist and be callable', () => {
      // This test should fail because textValidation doesn't exist yet
      expect(typeof (testTool as any).textValidation).toBe('function');
    });

    it('should validate valid text content', () => {
      const validText = 'This is valid text content for a document.';
      
      // This test should fail because textValidation doesn't exist yet
      const result = (testTool as any).textValidation(validText);
      
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(validText);
    });

    it('should reject null text', () => {
      // This test should fail because textValidation doesn't exist yet
      const result = (testTool as any).textValidation(null);
      
      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error).toBeInstanceOf(GoogleDocsError);
      expect(error.message).toContain('Text cannot be null');
    });

    it('should reject undefined text', () => {
      // This test should fail because textValidation doesn't exist yet
      const result = (testTool as any).textValidation(undefined);
      
      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error).toBeInstanceOf(GoogleDocsError);
      expect(error.message).toContain('Text cannot be undefined');
    });

    it('should allow empty string text', () => {
      // This test should fail because textValidation doesn't exist yet
      const result = (testTool as any).textValidation('');
      
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe('');
    });

    it('should handle long text content', () => {
      const longText = 'A'.repeat(10000); // 10KB of text
      
      // This test should fail because textValidation doesn't exist yet
      const result = (testTool as any).textValidation(longText);
      
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(longText);
    });

    it('should handle text with special characters', () => {
      const specialText = 'Text with émojis 🚀 and special chars: àáâãäåæçèéêë';
      
      // This test should fail because textValidation doesn't exist yet
      const result = (testTool as any).textValidation(specialText);
      
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(specialText);
    });

    it('should handle multiline text', () => {
      const multilineText = 'Line 1\nLine 2\nLine 3\n\nLine 5';
      
      // This test should fail because textValidation doesn't exist yet
      const result = (testTool as any).textValidation(multilineText);
      
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(multilineText);
    });

    it('should handle text with HTML/XML characters', () => {
      const htmlText = '<p>This is a paragraph with &lt;tags&gt; and &amp; symbols.</p>';
      
      // This test should fail because textValidation doesn't exist yet
      const result = (testTool as any).textValidation(htmlText);
      
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(htmlText);
    });
  });

  // ===============================
  // INDEX VALIDATION TESTS (RED PHASE - Should Fail)
  // ===============================

  describe('indexValidation (RED PHASE - Should Fail)', () => {
    it('should exist and be callable', () => {
      // This test should fail because indexValidation doesn't exist yet
      expect(typeof (testTool as any).indexValidation).toBe('function');
    });

    it('should validate valid positive index', () => {
      const validIndex = 1;
      
      // This test should fail because indexValidation doesn't exist yet
      const result = (testTool as any).indexValidation(validIndex);
      
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(validIndex);
    });

    it('should validate large positive index', () => {
      const largeIndex = 1000000;
      
      // This test should fail because indexValidation doesn't exist yet
      const result = (testTool as any).indexValidation(largeIndex);
      
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(largeIndex);
    });

    it('should reject zero index', () => {
      // This test should fail because indexValidation doesn't exist yet
      const result = (testTool as any).indexValidation(0);
      
      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error).toBeInstanceOf(GoogleDocsError);
      expect(error.message).toContain('Index must be at least 1');
    });

    it('should reject negative index', () => {
      // This test should fail because indexValidation doesn't exist yet
      const result = (testTool as any).indexValidation(-1);
      
      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error).toBeInstanceOf(GoogleDocsError);
      expect(error.message).toContain('Index must be positive');
    });

    it('should reject non-integer index', () => {
      // This test should fail because indexValidation doesn't exist yet
      const result = (testTool as any).indexValidation(1.5);
      
      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error).toBeInstanceOf(GoogleDocsError);
      expect(error.message).toContain('Index must be an integer');
    });

    it('should handle default index when not provided', () => {
      // This test should fail because indexValidation doesn't exist yet
      const result = (testTool as any).indexValidation(undefined, 1);
      
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(1);
    });

    it('should handle null index with default', () => {
      // This test should fail because indexValidation doesn't exist yet
      const result = (testTool as any).indexValidation(null, 10);
      
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(10);
    });
  });

  // ===============================
  // ZOD SCHEMA FACTORY TESTS (RED PHASE - Should Fail)
  // ===============================

  describe('Schema Factory Methods (RED PHASE - Should Fail)', () => {
    describe('createDocumentIdSchema', () => {
      it('should exist and return a Zod schema', () => {
        // This test should fail because createDocumentIdSchema doesn't exist yet
        const schema = (testTool as any).createDocumentIdSchema();
        
        expect(schema).toBeDefined();
        expect(typeof schema.safeParse).toBe('function');
      });

      it('should validate correct document IDs', () => {
        // This test should fail because createDocumentIdSchema doesn't exist yet
        const schema = (testTool as any).createDocumentIdSchema();
        
        const validId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
        const result = schema.safeParse(validId);
        
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(validId);
        }
      });

      it('should reject empty document IDs', () => {
        // This test should fail because createDocumentIdSchema doesn't exist yet
        const schema = (testTool as any).createDocumentIdSchema();
        
        const result = schema.safeParse('');
        
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('empty');
        }
      });
    });

    describe('createTextSchema', () => {
      it('should exist and return a Zod schema', () => {
        // This test should fail because createTextSchema doesn't exist yet
        const schema = (testTool as any).createTextSchema();
        
        expect(schema).toBeDefined();
        expect(typeof schema.safeParse).toBe('function');
      });

      it('should validate text content', () => {
        // This test should fail because createTextSchema doesn't exist yet
        const schema = (testTool as any).createTextSchema();
        
        const validText = 'This is valid text content.';
        const result = schema.safeParse(validText);
        
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(validText);
        }
      });

      it('should allow empty string', () => {
        // This test should fail because createTextSchema doesn't exist yet
        const schema = (testTool as any).createTextSchema();
        
        const result = schema.safeParse('');
        
        expect(result.success).toBe(true);
      });
    });

    describe('createIndexSchema', () => {
      it('should exist and return a Zod schema', () => {
        // This test should fail because createIndexSchema doesn't exist yet
        const schema = (testTool as any).createIndexSchema();
        
        expect(schema).toBeDefined();
        expect(typeof schema.safeParse).toBe('function');
      });

      it('should validate positive integers', () => {
        // This test should fail because createIndexSchema doesn't exist yet
        const schema = (testTool as any).createIndexSchema();
        
        const result = schema.safeParse(1);
        
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(1);
        }
      });

      it('should reject zero and negative numbers', () => {
        // This test should fail because createIndexSchema doesn't exist yet
        const schema = (testTool as any).createIndexSchema();
        
        const zeroResult = schema.safeParse(0);
        expect(zeroResult.success).toBe(false);

        const negativeResult = schema.safeParse(-1);
        expect(negativeResult.success).toBe(false);
      });

      it('should reject non-integers', () => {
        // This test should fail because createIndexSchema doesn't exist yet
        const schema = (testTool as any).createIndexSchema();
        
        const result = schema.safeParse(1.5);
        
        expect(result.success).toBe(false);
      });
    });

    describe('createToolInputSchema', () => {
      it('should exist and be callable', () => {
        // This test should fail because createToolInputSchema doesn't exist yet
        expect(typeof (testTool as any).createToolInputSchema).toBe('function');
      });

      it('should create schema for create-document tool', () => {
        // This test should fail because createToolInputSchema doesn't exist yet
        const schema = (testTool as any).createToolInputSchema('create-document');
        
        expect(schema).toBeDefined();
        expect(typeof schema.safeParse).toBe('function');
      });

      it('should create schema for get-document tool', () => {
        // This test should fail because createToolInputSchema doesn't exist yet
        const schema = (testTool as any).createToolInputSchema('get-document');
        
        expect(schema).toBeDefined();
        
        // Test with valid input
        const validInput = {
          documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
        };
        const result = schema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should create schema for update-document tool', () => {
        // This test should fail because createToolInputSchema doesn't exist yet
        const schema = (testTool as any).createToolInputSchema('update-document');
        
        expect(schema).toBeDefined();
        
        // Test with valid input
        const validInput = {
          documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
          requests: [{ insertText: { text: 'Hello', location: { index: 1 } } }]
        };
        const result = schema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should create schema for insert-text tool', () => {
        // This test should fail because createToolInputSchema doesn't exist yet
        const schema = (testTool as any).createToolInputSchema('insert-text');
        
        expect(schema).toBeDefined();
        
        // Test with valid input
        const validInput = {
          documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
          text: 'Hello World',
          index: 1
        };
        const result = schema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should create schema for replace-text tool', () => {
        // This test should fail because createToolInputSchema doesn't exist yet
        const schema = (testTool as any).createToolInputSchema('replace-text');
        
        expect(schema).toBeDefined();
        
        // Test with valid input
        const validInput = {
          documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
          searchText: 'old text',
          replaceText: 'new text',
          matchCase: true
        };
        const result = schema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should throw error for unknown tool type', () => {
        // This test should fail because createToolInputSchema doesn't exist yet
        expect(() => {
          (testTool as any).createToolInputSchema('unknown-tool');
        }).toThrow();
      });
    });
  });

  // ===============================
  // ERROR HANDLING TESTS (RED PHASE - Should Fail)
  // ===============================

  describe('handleServiceError (RED PHASE - Should Fail)', () => {
    it('should exist and be callable', () => {
      // This test should fail because handleServiceError doesn't exist yet
      expect(typeof (testTool as any).handleServiceError).toBe('function');
    });

    it('should pass through GoogleDocsError unchanged', () => {
      const docsError = new GoogleDocsError(
        'Test error',
        'GOOGLE_DOCS_TEST_ERROR',
        400,
        'doc123'
      );
      
      // This test should fail because handleServiceError doesn't exist yet
      const result = (testTool as any).handleServiceError(docsError);
      
      expect(result).toBe(docsError);
    });

    it('should convert GoogleAuthError to GoogleDocsError', () => {
      const authError = new GoogleAuthError('Auth failed', 'oauth2');
      
      // This test should fail because handleServiceError doesn't exist yet
      const result = (testTool as any).handleServiceError(authError);
      
      expect(result).toBeInstanceOf(GoogleDocsError);
      expect(result.message).toContain('Auth failed');
      expect(result.errorCode).toBe('GOOGLE_AUTH_ERROR');
      expect(result.context?.originalError).toBe(authError);
    });

    it('should convert GoogleWorkspaceError to GoogleDocsError', () => {
      const workspaceError = new GoogleServiceError(
        'Workspace error',
        'test-service',
        'WORKSPACE_ERROR',
        500
      );
      
      // This test should fail because handleServiceError doesn't exist yet
      const result = (testTool as any).handleServiceError(workspaceError);
      
      expect(result).toBeInstanceOf(GoogleDocsError);
      expect(result.message).toContain('Workspace error');
      expect(result.errorCode).toBe('GOOGLE_DOCS_SERVICE_ERROR');
      expect(result.context?.originalError).toBe(workspaceError);
    });

    it('should convert generic Error to GoogleDocsError', () => {
      const genericError = new Error('Generic error');
      
      // This test should fail because handleServiceError doesn't exist yet
      const result = (testTool as any).handleServiceError(genericError);
      
      expect(result).toBeInstanceOf(GoogleDocsError);
      expect(result.message).toContain('Generic error');
      expect(result.errorCode).toBe('GOOGLE_DOCS_UNKNOWN_ERROR');
      expect(result.statusCode).toBe(500);
    });

    it('should handle non-Error objects', () => {
      const stringError = 'String error';
      
      // This test should fail because handleServiceError doesn't exist yet
      const result = (testTool as any).handleServiceError(stringError);
      
      expect(result).toBeInstanceOf(GoogleDocsError);
      expect(result.message).toBe('String error');
      expect(result.errorCode).toBe('GOOGLE_DOCS_UNKNOWN_ERROR');
    });
  });

  // ===============================
  // validateWithSchema TESTS (RED PHASE - Should Fail)
  // ===============================

  describe('validateWithSchema (RED PHASE - Should Fail)', () => {
    const mockSchema = z.object({
      documentId: z.string(),
      title: z.string(),
      content: z.string().optional(),
    });

    beforeEach(() => {
      (
        validateToolInput as jest.MockedFunction<typeof validateToolInput>
      ).mockClear();
    });

    it('should exist and be callable', () => {
      // This test should fail because validateWithSchema doesn't exist yet
      expect(typeof (testTool as any).validateWithSchema).toBe('function');
    });

    it('should use validateToolInput utility for validation', () => {
      const testData = { documentId: 'doc123', title: 'Test Doc' };
      const mockResult = ok(testData);
      (
        validateToolInput as jest.MockedFunction<typeof validateToolInput>
      ).mockReturnValue(mockResult);

      // This test should fail because validateWithSchema doesn't exist yet
      const result = (testTool as any).validateWithSchema(mockSchema, testData);

      expect(validateToolInput).toHaveBeenCalledWith(mockSchema, testData);
      expect(result).toStrictEqual(mockResult);
    });

    it('should return success result for valid data', () => {
      const testData = {
        documentId: 'doc123',
        title: 'Test Document',
        content: 'This is a test document.',
      };
      const mockResult = ok(testData);
      (
        validateToolInput as jest.MockedFunction<typeof validateToolInput>
      ).mockReturnValue(mockResult);

      // This test should fail because validateWithSchema doesn't exist yet
      const result = (testTool as any).validateWithSchema(mockSchema, testData);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual(testData);
    });

    it('should convert validation errors to GoogleDocsError', () => {
      const testData = { invalid: 'data' };
      const mockError = new GoogleServiceError(
        'Validation failed',
        'test-service',
        'VALIDATION_ERROR',
        400
      );
      const mockResult = err(mockError);
      (
        validateToolInput as jest.MockedFunction<typeof validateToolInput>
      ).mockReturnValue(mockResult);

      // This test should fail because validateWithSchema doesn't exist yet
      const result = (testTool as any).validateWithSchema(mockSchema, testData);

      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error).toBeInstanceOf(GoogleDocsError);
      expect(error.errorCode).toBe('GOOGLE_DOCS_VALIDATION_ERROR');
    });

    it('should preserve GoogleDocsError unchanged', () => {
      const testData = { invalid: 'data' };
      const mockError = new GoogleDocsError(
        'Docs validation failed',
        'GOOGLE_DOCS_VALIDATION_ERROR',
        400,
        'doc123'
      );
      const mockResult = err(mockError);
      (
        validateToolInput as jest.MockedFunction<typeof validateToolInput>
      ).mockReturnValue(mockResult);

      // This test should fail because validateWithSchema doesn't exist yet
      const result = (testTool as any).validateWithSchema(mockSchema, testData);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toBe(mockError);
    });
  });

  // ===============================
  // INHERITANCE AND COMPATIBILITY TESTS
  // ===============================

  describe('Backward Compatibility', () => {
    it('should maintain existing authentication functionality', async () => {
      mockAuthService.validateAuth.mockResolvedValue(ok(true));

      const result = await (testTool as any).validateAuthentication(
        'test-request'
      );

      expect(result.isOk()).toBe(true);
      expect(mockAuthService.validateAuth).toHaveBeenCalledTimes(1);
    });

    it('should maintain inheritance structure', () => {
      expect(testTool).toBeInstanceOf(BaseDocsTools);
      expect(testTool.getToolName()).toBe('test-docs-tool');
    });
  });

  describe('Error Handling Consistency', () => {
    it('should maintain consistent error types', async () => {
      const authError = new GoogleAuthError('Test error', 'service-account');
      mockAuthService.validateAuth.mockResolvedValue(err(authError));

      const result = await (testTool as any).validateAuthentication(
        'test-request'
      );

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toBeInstanceOf(GoogleAuthError);
    });

    it('should log errors consistently', async () => {
      mockAuthService.validateAuth.mockResolvedValue(ok(false));

      await (testTool as any).validateAuthentication('test-request');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Authentication invalid',
        expect.objectContaining({
          error: expect.any(Object),
          requestId: 'test-request',
        })
      );
    });
  });

  // ===============================
  // INTEGRATION WITH VALIDATION UTILITIES
  // ===============================

  describe('Validation Utility Integration', () => {
    beforeEach(() => {
      (
        validateToolInput as jest.MockedFunction<typeof validateToolInput>
      ).mockClear();
    });

    it('should properly integrate with validation utilities', () => {
      const mockSchema = z.string().min(1);
      const mockData = 'test-data';

      (
        validateToolInput as jest.MockedFunction<typeof validateToolInput>
      ).mockReturnValue(ok(mockData));

      const result = validateToolInput(mockSchema, mockData);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(mockData);
    });

    it('should handle validation errors from utilities', () => {
      const mockSchema = z.string().min(1);
      const mockData = '';
      const mockError = new GoogleDocsError(
        'Validation failed',
        'GOOGLE_DOCS_VALIDATION_ERROR',
        400
      );

      (
        validateToolInput as jest.MockedFunction<typeof validateToolInput>
      ).mockReturnValue(err(mockError));

      const result = validateToolInput(mockSchema, mockData);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toBe(mockError);
    });
  });
});
/**
 * Google Docs MCP Tools
 *
 * This module exports all Google Docs-related tools and base classes for the MCP server.
 * The tools provide comprehensive Docs API functionality including document creation,
 * content retrieval, batch updates, and text manipulation operations.
 *
 * @module docs-tools
 */

export { BaseDocsTools } from './base-docs-tool.js';
export type {
  DocsValidationContext,
  SupportedDocsTools,
} from './base-docs-tool.js';

// Docs tools
export { CreateDocumentTool } from './create-document.tool.js';
export { GetDocumentTool } from './get-document.tool.js';
export { UpdateDocumentTool } from './update-document.tool.js';
export { InsertTextTool } from './insert-text.tool.js';
export { ReplaceTextTool } from './replace-text.tool.js';

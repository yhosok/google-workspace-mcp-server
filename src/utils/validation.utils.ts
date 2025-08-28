/**
 * Validation utilities for Google Workspace MCP Server
 *
 * This module provides a unified validation system that eliminates duplication
 * between input schema and runtime validation using Zod's safeParse.
 * Integrates with the existing error handling system using neverthrow Result types.
 */

import { z } from 'zod';
import { Result, ok, err } from 'neverthrow';
import {
  GoogleSheetsError,
  GoogleSheetsInvalidRangeError,
} from '../errors/index.js';

/**
 * Context information for validation operations
 */
export interface ValidationContext {
  spreadsheetId?: string;
  range?: string;
  operation?: string;
  useSpecificMessages?: boolean;
  useGenericMessages?: boolean;
  [key: string]: unknown;
}

/**
 * Result type for validation operations
 */
export type ValidationResult<T> = Result<T, GoogleSheetsError>;

/**
 * Validates tool input using a Zod schema and returns a Result type
 *
 * @param schema - The Zod schema to validate against
 * @param data - The input data to validate
 * @returns Result with validated data or GoogleSheetsError
 */
export function validateToolInput<T>(
  schema: z.ZodType<T>,
  data: unknown
): ValidationResult<T> {
  const result = schema.safeParse(data);

  if (result.success) {
    return ok(result.data);
  } else {
    return err(
      convertZodErrorToGoogleSheetsError(
        result.error,
        undefined,
        undefined,
        undefined,
        data
      )
    );
  }
}

/**
 * Validates tool input using a Zod schema with context information
 *
 * @param schema - The Zod schema to validate against
 * @param data - The input data to validate
 * @param context - Optional validation context for enhanced error reporting
 * @returns Result with validated data or GoogleSheetsError
 */
export function validateToolInputWithContext<T>(
  schema: z.ZodType<T>,
  data: unknown,
  context?: ValidationContext
): ValidationResult<T> {
  const result = schema.safeParse(data);

  if (result.success) {
    return ok(result.data);
  } else {
    return err(
      convertZodErrorToGoogleSheetsError(
        result.error,
        context?.spreadsheetId,
        context?.range,
        context,
        data
      )
    );
  }
}

/**
 * Converts a ZodError to a GoogleSheetsError with appropriate mapping
 *
 * @param error - The ZodError to convert
 * @param spreadsheetId - Optional spreadsheet ID for context
 * @param range - Optional range for context
 * @param context - Optional additional context data
 * @param data - Original input data for validation context
 * @returns GoogleSheetsError or GoogleSheetsInvalidRangeError based on validation type
 */
export function convertZodErrorToGoogleSheetsError(
  error: z.ZodError,
  spreadsheetId?: string,
  range?: string,
  context?: Record<string, unknown>,
  data?: unknown
): GoogleSheetsError {
  // Map ZodError issues to validation errors
  const validationErrors = error.issues.map(issue => ({
    code: issue.code,
    path: issue.path,
    message: issue.message,
    ...getIssueSpecificData(issue),
  }));

  // Check for range-related validation errors
  const hasRangeError = validationErrors.some(err =>
    err.path.includes('range')
  );
  const hasSpreadsheetIdError = validationErrors.some(err =>
    err.path.includes('spreadsheetId')
  );

  // For tools that include range parameter in their data, both spreadsheetId and range errors
  // should be treated as "range-related" since they're part of the range operation
  const dataHasRange = (data as Record<string, unknown>)?.range !== undefined;

  if (hasRangeError || (dataHasRange && hasSpreadsheetIdError)) {
    // Find the specific error message for range or spreadsheetId (in range-based tools)
    const rangeOrIdError = validationErrors.find(
      err => err.path.includes('range') || err.path.includes('spreadsheetId')
    );

    if (rangeOrIdError) {
      // Return GoogleSheetsInvalidRangeError for range/ID validation failures
      const rangeValue =
        ((data as Record<string, unknown>)?.range as string) || range || '';
      const spreadsheetIdValue =
        ((data as Record<string, unknown>)?.spreadsheetId as string) ||
        spreadsheetId;
      return new GoogleSheetsInvalidRangeError(rangeValue, spreadsheetIdValue, {
        reason: rangeOrIdError.message,
        validationErrors,
        ...context,
      });
    }
  }

  // For other validation errors, use specific or generic message based on context
  let message: string;
  if (validationErrors.length === 1 && !context?.useGenericMessages) {
    // Use specific message for single errors unless explicitly requested to use generic
    message = validationErrors[0].message as string;
  } else {
    const errorCount = validationErrors.length;
    message = `Invalid input data: Found ${errorCount} validation error${errorCount > 1 ? 's' : ''}`;
  }

  // Combine context data with validation errors
  const errorContext = {
    ...context,
    validationErrors,
  };

  return new GoogleSheetsError(
    message,
    'GOOGLE_SHEETS_VALIDATION_ERROR',
    400, // Bad Request
    spreadsheetId,
    range,
    errorContext
  );
}

/**
 * Extract issue-specific data from ZodIssue for detailed error reporting
 *
 * @param issue - The ZodIssue to extract data from
 * @returns Object with issue-specific properties
 */
function getIssueSpecificData(issue: z.ZodIssue): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if ('expected' in issue) data.expected = issue.expected;
      if ('received' in issue) data.received = issue.received;
      break;

    case z.ZodIssueCode.too_small:
      if ('minimum' in issue) data.minimum = issue.minimum;
      if ('type' in issue) data.type = issue.type;
      if ('inclusive' in issue) data.inclusive = issue.inclusive;
      if ('exact' in issue) data.exact = issue.exact;
      break;

    case z.ZodIssueCode.too_big:
      if ('maximum' in issue) data.maximum = issue.maximum;
      if ('type' in issue) data.type = issue.type;
      if ('inclusive' in issue) data.inclusive = issue.inclusive;
      if ('exact' in issue) data.exact = issue.exact;
      break;

    case z.ZodIssueCode.invalid_string:
      if ('validation' in issue) data.validation = issue.validation;
      break;

    case z.ZodIssueCode.invalid_enum_value:
      if ('options' in issue) data.options = issue.options;
      if ('received' in issue) data.received = issue.received;
      break;

    case z.ZodIssueCode.invalid_union:
      if ('unionErrors' in issue) data.unionErrors = issue.unionErrors;
      break;

    case z.ZodIssueCode.invalid_union_discriminator:
      if ('options' in issue) data.options = issue.options;
      break;

    case z.ZodIssueCode.invalid_literal:
      if ('expected' in issue) data.expected = issue.expected;
      if ('received' in issue) data.received = issue.received;
      break;

    case z.ZodIssueCode.unrecognized_keys:
      if ('keys' in issue) data.keys = issue.keys;
      break;

    case z.ZodIssueCode.invalid_arguments:
      if ('argumentsError' in issue) data.argumentsError = issue.argumentsError;
      break;

    case z.ZodIssueCode.invalid_return_type:
      if ('returnTypeError' in issue)
        data.returnTypeError = issue.returnTypeError;
      break;

    case z.ZodIssueCode.invalid_date:
      // No additional data needed for date validation
      break;

    case z.ZodIssueCode.invalid_intersection_types:
      // No additional data needed for intersection type validation
      break;

    case z.ZodIssueCode.not_multiple_of:
      if ('multipleOf' in issue) data.multipleOf = issue.multipleOf;
      break;

    case z.ZodIssueCode.not_finite:
      // No additional data needed for finite validation
      break;

    case z.ZodIssueCode.custom:
      // Custom validation issues may have additional data
      if ('params' in issue) data.params = issue.params;
      break;

    default:
      // Handle any future or unknown issue codes gracefully
      break;
  }

  return data;
}

/**
 * Utility class providing static validation methods
 */
export class ValidationUtils {
  /**
   * Static method for validating tool input
   */
  static validate<T>(schema: z.ZodType<T>, data: unknown): ValidationResult<T> {
    return validateToolInput(schema, data);
  }

  /**
   * Static method for converting ZodError to GoogleSheetsError
   */
  static convertZodError(
    error: z.ZodError,
    spreadsheetId?: string,
    range?: string,
    context?: Record<string, unknown>,
    data?: unknown
  ): GoogleSheetsError {
    return convertZodErrorToGoogleSheetsError(
      error,
      spreadsheetId,
      range,
      context,
      data
    );
  }

  /**
   * Check if a validation result contains specific error types
   */
  static hasValidationError(
    result: ValidationResult<unknown>,
    errorCode: string
  ): boolean {
    if (result.isOk()) return false;

    const error = result.error;
    if (error.code !== 'GOOGLE_SHEETS_VALIDATION_ERROR') return false;

    const validationErrors = error.context?.validationErrors as Array<
      Record<string, unknown>
    >;
    return (
      validationErrors?.some(e => (e.code as string) === errorCode) || false
    );
  }

  /**
   * Extract validation errors of specific types from a result
   */
  static getValidationErrors(
    result: ValidationResult<unknown>,
    errorCode?: string
  ): Array<Record<string, unknown>> {
    if (result.isOk()) return [];

    const error = result.error;
    if (error.code !== 'GOOGLE_SHEETS_VALIDATION_ERROR') return [];

    const validationErrors =
      (error.context?.validationErrors as Array<Record<string, unknown>>) || [];

    if (errorCode) {
      return validationErrors.filter(e => (e.code as string) === errorCode);
    }

    return validationErrors;
  }

  /**
   * Format validation errors for user-friendly display
   */
  static formatValidationErrors(result: ValidationResult<unknown>): string[] {
    if (result.isOk()) return [];

    const error = result.error;
    if (error.code !== 'GOOGLE_SHEETS_VALIDATION_ERROR') return [error.message];

    const validationErrors =
      (error.context?.validationErrors as Array<Record<string, unknown>>) || [];

    return validationErrors.map(e => {
      const path = e.path as (string | number)[];
      const pathStr = path.length > 0 ? path.join('.') + ': ' : '';
      return `${pathStr}${e.message}`;
    });
  }
}

export default ValidationUtils;

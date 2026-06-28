/**
 * Per-field error envelope helpers (Task 3.1).
 *
 * API errors use the consistent JSON envelope `{ error: { field?, message } }`
 * (design "Error Handling"). These helpers translate a Zod failure into that
 * envelope and provide a `validate` wrapper used by both client forms and
 * server route handlers.
 */
import { z } from 'zod';

/** A single field-scoped validation error. `field` is omitted for form-level errors. */
export interface FieldError {
  field?: string;
  message: string;
}

/** The standard API error envelope: `{ error: { field?, message } }`. */
export interface ErrorEnvelope {
  error: FieldError;
}

/** Result of validating input through {@link validate}. */
export type ValidationResult<T> =
  | { success: true; data: T }
  | ({ success: false; fieldErrors: FieldError[] } & ErrorEnvelope);

/** Convert a Zod issue path (e.g. `['social', 'facebook']`) to a dotted field name. */
function pathToField(path: ReadonlyArray<PropertyKey>): string | undefined {
  if (path.length === 0) return undefined;
  return path.map((segment) => String(segment)).join('.');
}

/**
 * Map every Zod issue to a {@link FieldError}, preserving order and identifying
 * each invalid field (Req 12.5, 16.5, 17.4, 18.4, 20.2/20.6).
 */
export function toFieldErrors(error: z.ZodError): FieldError[] {
  return error.issues.map((issue) => {
    const field = pathToField(issue.path);
    return field === undefined
      ? { message: issue.message }
      : { field, message: issue.message };
  });
}

/**
 * Build the single-error envelope `{ error: { field?, message } }` from the
 * first Zod issue. Returns a generic envelope when no issues are present.
 */
export function toErrorEnvelope(error: z.ZodError): ErrorEnvelope {
  const [first] = toFieldErrors(error);
  return { error: first ?? { message: 'Validation failed.' } };
}

/**
 * Validate `data` against `schema`, returning either the parsed value or a
 * failure carrying both the single-error envelope and the full per-field list.
 *
 * Shared by client forms (which show `fieldErrors`) and server handlers (which
 * return `{ error }`), so both surfaces apply identical rules.
 */
export function validate<S extends z.ZodType>(
  schema: S,
  data: unknown,
): ValidationResult<z.infer<S>> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    fieldErrors: toFieldErrors(result.error),
    ...toErrorEnvelope(result.error),
  };
}

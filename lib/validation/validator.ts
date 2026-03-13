import { z, ZodSchema } from 'zod';
import { NextResponse } from 'next/server';

// ─── Validation Result (Single Responsibility: wraps parse result) ────────────

export type ValidationSuccess<T> = { ok: true; data: T };
export type ValidationFailure = { ok: false; response: NextResponse };
export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

/**
 * Validates `input` against `schema`.
 * Returns `{ ok: true, data }` on success or `{ ok: false, response }` ready to return.
 */
export function validate<T>(schema: ZodSchema<T>, input: unknown): ValidationResult<T> {
  const result = schema.safeParse(input);
  if (result.success) {
    return { ok: true, data: result.data };
  }

  const issues = 'issues' in result.error ? result.error.issues : [];
  const errors = issues.map((e) => ({
    field: e.path.map(String).join('.') || 'root',
    message: e.message,
  }));

  return {
    ok: false,
    response: NextResponse.json({ error: 'Validation failed', errors }, { status: 400 }),
  };
}

/** Parses and validates request body JSON. Returns the error response if the body is not valid JSON. */
export async function parseBody<T>(
  request: Request,
  schema: ZodSchema<T>
): Promise<ValidationResult<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }),
    };
  }
  return validate(schema, raw);
}

/** Validates URL search params as a plain object. */
export function parseParams<T>(
  params: URLSearchParams,
  schema: ZodSchema<T>
): ValidationResult<T> {
  const obj: Record<string, string> = {};
  params.forEach((v, k) => { obj[k] = v; });
  return validate(schema, obj);
}

// Re-export for convenience
export { z };

// Plain-value helpers shared across userscripts: type guards, valibot
// coercion and error text extraction.
import * as v from 'valibot';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// Missing keys still run through the transform, so defaults apply uniformly.
const coerce = <T>(transform: (value: unknown) => T) =>
  v.pipe(
    v.optional(v.unknown(), () => undefined),
    v.transform(transform),
  );

// Error text that never throws: Error, string, null-prototype objects and
// Tampermonkey's {id, error, details} all yield a readable message.
function errorMessage(error: unknown): string {
  try {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object') {
      const record = error as Record<string, unknown>;
      for (const key of ['error', 'message']) {
        const value = record[key];
        if (typeof value === 'string' && value) return value;
      }
      return JSON.stringify(error) ?? '';
    }
    return String(error);
  } catch {
    return 'unknown error';
  }
}

export { coerce, errorMessage, isRecord };

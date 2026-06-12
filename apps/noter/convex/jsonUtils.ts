export type JsonRecord = Record<string, unknown>;

/**
 * Checks whether the value is a non-null object that is not an array.
 */
// eslint-disable-next-line noter/no-hand-written-type-predicate -- record-shape-over-unknown: control flow cannot earn an index signature; convex-side audited copy
export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

export function readString(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

export function readStringOrNumber(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return undefined;
}

export function readBoolean(record: JsonRecord, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

export function readNumber(record: JsonRecord, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function clamp(num: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, num));
}

const SAFE_ERROR_MESSAGE_KEYS = ["message", "error", "detail", "statusText", "title"] as const;

/**
 * Formats unknown thrown values without serializing arbitrary object payloads.
 */
export function toErrorMessage(error: unknown, fallback = "Unknown error"): string {
  if (error instanceof Error) {
    return error.message.length > 0 ? error.message : fallback;
  }
  if (typeof error === "string") {
    return error.length > 0 ? error : fallback;
  }
  if (typeof error === "number" || typeof error === "boolean" || typeof error === "bigint") {
    return String(error);
  }
  if (error === undefined) {
    return fallback;
  }
  if (error === null) {
    return "null";
  }

  if (!isRecord(error)) {
    return fallback;
  }

  for (const key of SAFE_ERROR_MESSAGE_KEYS) {
    const value = readString(error, key);
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return fallback;
}

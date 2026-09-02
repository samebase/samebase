import { isRecord } from "./jsonUtils";

export type ProviderApiCall = {
  provider: "Cloudflare" | "Convex" | "GitHub";
  method: string;
  endpoint: string;
  values?: unknown;
};

export type ProviderApiCallRecorder = (call: ProviderApiCall) => Promise<void>;

type RedactedProviderApiValue =
  | null
  | boolean
  | number
  | string
  | RedactedProviderApiValue[]
  | { [key: string]: RedactedProviderApiValue };

const MAX_ARRAY_ITEMS = 12;
const MAX_VISIBLE_STRING_LENGTH = 120;

const SECRET_KEY_MARKERS = [
  "authorization",
  "auth",
  "credential",
  "deploykey",
  "deploy_key",
  "password",
  "secret",
  "token",
];

const PII_KEY_MARKERS = [
  "account",
  "branch",
  "content",
  "deployment",
  "description",
  "domain",
  "email",
  "id",
  "login",
  "name",
  "owner",
  "phone",
  "message",
  "project",
  "repo",
  "repository",
  "sha",
  "team",
  "url",
  "user",
  "uuid",
  "repository",
  "worker",
];
const PII_EXACT_KEYS = ["commithash", "ref"];

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function keyHasMarker(key: string, markers: readonly string[]): boolean {
  const normalized = normalizeKey(key);
  return markers.some((marker) => normalized.includes(normalizeKey(marker)));
}

function isSecretKey(key: string): boolean {
  return keyHasMarker(key, SECRET_KEY_MARKERS);
}

function isPiiKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return PII_EXACT_KEYS.includes(normalized) || keyHasMarker(normalized, PII_KEY_MARKERS);
}

function shouldRedactString(value: string): boolean {
  return (
    value.includes("@") ||
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.length > MAX_VISIBLE_STRING_LENGTH
  );
}

function redactStringValue(value: string): string {
  if (shouldRedactString(value)) {
    return "[redacted]";
  }
  return value;
}

function redactProviderApiValue(value: unknown, key = ""): RedactedProviderApiValue {
  if (key && isSecretKey(key)) {
    return "[secret]";
  }
  if (key && isPiiKey(key) && !isRecord(value)) {
    return "[redacted]";
  }

  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    return redactStringValue(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    const visibleItems = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => redactProviderApiValue(item));
    if (value.length > MAX_ARRAY_ITEMS) {
      visibleItems.push(`[${value.length - MAX_ARRAY_ITEMS} more items redacted]`);
    }
    return visibleItems;
  }
  if (isRecord(value)) {
    const redacted: { [key: string]: RedactedProviderApiValue } = {};
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    for (const [entryKey, entryValue] of entries) {
      if (entryValue === undefined) {
        continue;
      }
      redacted[entryKey] = redactProviderApiValue(entryValue, entryKey);
    }
    return redacted;
  }

  return `[${typeof value}]`;
}

export function formatProviderApiCallLogMessage(call: ProviderApiCall): string {
  const method = call.method.toUpperCase();
  if (call.values === undefined) {
    return `API ${call.provider} ${method} ${call.endpoint}`;
  }

  return `API ${call.provider} ${method} ${call.endpoint} values=${JSON.stringify(redactProviderApiValue(call.values))}`;
}

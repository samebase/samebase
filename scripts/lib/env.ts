import { parsePositiveIntegerOption } from "./cliArgs.ts";

export function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

export function readOptionalEnvValue(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return stripWrappingQuotes(trimmed);
}

export function readBooleanEnvValue(value: string | null | undefined): boolean {
  const normalized = readOptionalEnvValue(value);
  if (normalized === null) {
    return false;
  }

  const lowercase = normalized.toLowerCase();
  return lowercase === "1" || lowercase === "true" || lowercase === "yes";
}

export function readPositiveIntegerEnvValue(
  value: string | null | undefined,
  envName: string,
  helpText: string,
): number | null {
  const normalized = readOptionalEnvValue(value);
  if (normalized === null) {
    return null;
  }

  return parsePositiveIntegerOption(normalized, envName, helpText);
}

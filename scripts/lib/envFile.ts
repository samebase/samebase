import fs from "node:fs";

import { stripWrappingQuotes } from "./env.ts";

export type EnvFile = {
  path: string;
  vars: Record<string, string>;
};

function parseEnvFileValue(rawValue: string): string {
  if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(rawValue);
      if (typeof parsed === "string") {
        return parsed;
      }
    } catch {
      // Keep permissive dotenv parsing for hand-written quoted values.
    }
  }

  return stripWrappingQuotes(rawValue);
}

export function readEnvFile(filePath: string): EnvFile | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const contents = fs.readFileSync(filePath, "utf8");
  const vars: Record<string, string> = {};

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    if (!key) {
      continue;
    }

    const rawValue = trimmed.slice(eqIndex + 1).trim();
    vars[key] = parseEnvFileValue(rawValue);
  }

  return { path: filePath, vars };
}

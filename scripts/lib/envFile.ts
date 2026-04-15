import fs from "node:fs";

import { stripWrappingQuotes } from "./env.ts";

export type EnvFile = {
  path: string;
  vars: Record<string, string>;
};

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
    vars[key] = stripWrappingQuotes(rawValue);
  }

  return { path: filePath, vars };
}

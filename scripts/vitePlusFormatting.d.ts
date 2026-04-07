import type { FormatConfig } from "vite-plus/fmt";

export const vitePlusFormatterConfig: FormatConfig;

export function formatWithRepoVitePlus(args: {
  filepath: string;
  sourceText: string;
}): Promise<string>;

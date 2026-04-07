// @ts-check
import { format } from "vite-plus/fmt";

/** @type {import("vite-plus/fmt").FormatConfig} */
export const vitePlusFormatterConfig = {
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  arrowParens: "avoid",
  printWidth: 80,
  tabWidth: 2,
  useTabs: false,
  bracketSpacing: true,
  bracketSameLine: false,
  proseWrap: "always",
  endOfLine: "lf",
  sortPackageJson: false,
  ignorePatterns: [],
};

/**
 * Keep programmatic formatting aligned with the repo's root Vite+ fmt config.
 *
 * @param {{ filepath: string; sourceText: string }} args
 * @returns {Promise<string>}
 */
export async function formatWithRepoVitePlus(args) {
  const { code, errors } = await format(
    args.filepath,
    args.sourceText,
    vitePlusFormatterConfig,
  );
  if (errors.length > 0) {
    const messages = errors
      .map(error => error.message.trim())
      .filter(message => message.length > 0)
      .join("; ");
    throw new Error(`Failed to format ${args.filepath}: ${messages}`);
  }

  return code.endsWith("\n") ? code : `${code}\n`;
}

import { markdown } from "@codemirror/lang-markdown";
import { LanguageDescription } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { languages } from "@codemirror/language-data";
import { GFM } from "@lezer/markdown";
import { prosemarkMarkdownSyntaxExtensions } from "@prosemark/core";

const MARKDOWN_FILE_EXTENSIONS = new Set([
  "markdown",
  "md",
  "mdc",
  "mdx",
  "mkd",
]);

export type CodeMirrorFileLanguageKind = "markdown" | "code" | "plain";

function getFileExtension(filePath: string): string | null {
  const lastSlashIndex = filePath.lastIndexOf("/");
  const fileName =
    lastSlashIndex >= 0 ? filePath.slice(lastSlashIndex + 1) : filePath;
  const lastDotIndex = fileName.lastIndexOf(".");

  if (lastDotIndex <= 0 || lastDotIndex === fileName.length - 1) {
    return null;
  }

  return fileName.slice(lastDotIndex + 1).toLowerCase();
}

function isMarkdownFilePath(filePath?: string): boolean {
  if (!filePath) {
    return true;
  }

  const extension = getFileExtension(filePath);
  return extension !== null && MARKDOWN_FILE_EXTENSIONS.has(extension);
}

function getMatchingLanguage(filePath: string) {
  return LanguageDescription.matchFilename(languages, filePath) ?? null;
}

export function createProsemarkMarkdownExtension(): Extension {
  return markdown({
    codeLanguages: languages,
    extensions: [GFM, prosemarkMarkdownSyntaxExtensions],
  });
}

export function getCodeMirrorFileLanguageKind(
  filePath?: string,
): CodeMirrorFileLanguageKind {
  // Historical callers without a file path are prose-first surfaces like chat
  // messages and landing copy, so keep them on the markdown parser.
  if (isMarkdownFilePath(filePath)) {
    return "markdown";
  }

  if (!filePath) {
    return "markdown";
  }

  return getMatchingLanguage(filePath) ? "code" : "plain";
}

export function getInitialCodeMirrorLanguageExtension(
  filePath?: string,
): Extension {
  return getCodeMirrorFileLanguageKind(filePath) === "markdown"
    ? createProsemarkMarkdownExtension()
    : [];
}

const languageExtensionCache = new Map<string, Promise<Extension>>();

export async function loadCodeMirrorLanguageExtension(
  filePath?: string,
): Promise<Extension> {
  const languageKind = getCodeMirrorFileLanguageKind(filePath);

  if (languageKind === "markdown") {
    return createProsemarkMarkdownExtension();
  }

  if (!filePath) {
    return createProsemarkMarkdownExtension();
  }

  const matchingLanguage = getMatchingLanguage(filePath);
  if (!matchingLanguage) {
    return [];
  }

  const cacheKey = matchingLanguage.name;
  const cachedExtension = languageExtensionCache.get(cacheKey);
  if (cachedExtension) {
    return cachedExtension;
  }

  const nextExtension = matchingLanguage
    .load()
    .then((languageSupport) => languageSupport.extension);
  languageExtensionCache.set(cacheKey, nextExtension);
  return nextExtension;
}

import { markdown } from "@codemirror/lang-markdown";
import { LanguageDescription } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { languages } from "@codemirror/language-data";
import { GFM } from "@lezer/markdown";
import { prosemarkMarkdownSyntaxExtensions } from "@prosemark/core";

const MARKDOWN_FILE_EXTENSIONS = new Set(["markdown", "md", "mdc", "mdx", "mkd"]);

export type CodeMirrorFileLanguageKind = "markdown" | "code" | "plain";

function getFileName(filePath: string): string {
  const lastSlashIndex = filePath.lastIndexOf("/");
  return lastSlashIndex >= 0 ? filePath.slice(lastSlashIndex + 1) : filePath;
}

function getFileExtension(filePath: string): string | null {
  const fileName = getFileName(filePath);
  const lastDotIndex = fileName.lastIndexOf(".");

  if (lastDotIndex <= 0 || lastDotIndex === fileName.length - 1) {
    return null;
  }

  return fileName.slice(lastDotIndex + 1).toLowerCase();
}

function isMarkdownFilePath(filePath: string): boolean {
  const extension = getFileExtension(filePath);
  return extension !== null && MARKDOWN_FILE_EXTENSIONS.has(extension);
}

function getMatchingLanguage(filePath: string) {
  const fileName = getFileName(filePath);
  const matchingLanguageCandidates = [
    fileName,
    filePath,
    fileName.toLowerCase(),
    filePath.toLowerCase(),
  ];

  // `@codemirror/language-data` mixes extension-driven matchers like `.tsx`
  // with basename-only entries like `Dockerfile`, so try both forms and a
  // lowercased fallback before giving up on syntax highlighting.
  for (const candidate of matchingLanguageCandidates) {
    const matchingLanguage = LanguageDescription.matchFilename(languages, candidate) ?? null;
    if (matchingLanguage) {
      return matchingLanguage;
    }
  }

  return null;
}

export function createProsemarkMarkdownExtension(): Extension {
  return markdown({
    codeLanguages: languages,
    extensions: [GFM, prosemarkMarkdownSyntaxExtensions],
  });
}

export function getCodeMirrorFileLanguageKind(filePath: string): CodeMirrorFileLanguageKind {
  if (isMarkdownFilePath(filePath)) {
    return "markdown";
  }

  if (getMatchingLanguage(filePath)) {
    return "code";
  }

  // Extensionless prose files like `README` still route through ProseMark
  // surfaces, so keep their parser/theme on the Markdown path unless a
  // filename-based language like `Dockerfile` matched above.
  return getFileExtension(filePath) === null ? "markdown" : "plain";
}

export function getInitialCodeMirrorLanguageExtension(filePath: string): Extension {
  return getCodeMirrorFileLanguageKind(filePath) === "markdown"
    ? createProsemarkMarkdownExtension()
    : [];
}

const languageExtensionCache = new Map<string, Promise<Extension>>();

export async function loadCodeMirrorLanguageExtension(filePath: string): Promise<Extension> {
  const languageKind = getCodeMirrorFileLanguageKind(filePath);

  if (languageKind === "markdown") {
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
    .then((languageSupport) => languageSupport.extension)
    .catch((error: unknown) => {
      // Lazy language chunks can fail transiently during deploy races, so
      // avoid pinning the cache to a rejected promise forever.
      languageExtensionCache.delete(cacheKey);
      throw error;
    });
  languageExtensionCache.set(cacheKey, nextExtension);
  return nextExtension;
}

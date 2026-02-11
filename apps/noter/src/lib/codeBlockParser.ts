import { Id } from "../../convex/_generated/dataModel";

export interface CodeBlock {
  id: string;
  code: string;
  language?: string;
  filePath?: string;
  startIndex: number;
  endIndex: number;
}

export interface ParsedMessage {
  parts: Array<{
    type: "text" | "code";
    content: string;
    codeBlock?: CodeBlock;
  }>;
}

/**
 * Parse a markdown message to extract code blocks and detect file paths
 */
export function parseMessageForCodeBlocks(text: string): ParsedMessage {
  const parts: ParsedMessage["parts"] = [];
  let lastIndex = 0;
  let blockId = 0;

  // Enhanced regex to match code blocks with optional language and file path hints
  // Supports formats like:
  // ```js // path/to/file.js
  // ```typescript // src/components/Button.tsx
  // ```python // scripts/deploy.py
  const codeBlockRegex = /```(\w*)\s*(?:\/\/\s*(.+?))?\s*\n([\s\S]*?)```/g;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Add text before code block
    if (match.index > lastIndex) {
      const textContent = text.slice(lastIndex, match.index);
      if (textContent.trim()) {
        parts.push({
          type: "text",
          content: textContent,
        });
      }
    }

    const [fullMatch, language, filePathComment, code] = match;
    const startIndex = match.index;
    const endIndex = match.index + fullMatch.length;

    // Try to detect file path from various sources
    let filePath: string | undefined = filePathComment.trim();

    // If no explicit file path comment, try to infer from context
    if (!filePath) {
      filePath = inferFilePathFromCode(code, language);
    }

    const codeBlock: CodeBlock = {
      id: `code-block-${blockId++}`,
      code: code.trim(),
      language: language || undefined,
      filePath: filePath || undefined,
      startIndex,
      endIndex,
    };

    parts.push({
      type: "code",
      content: fullMatch,
      codeBlock,
    });

    lastIndex = endIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    const textContent = text.slice(lastIndex);
    if (textContent.trim()) {
      parts.push({
        type: "text",
        content: textContent,
      });
    }
  }

  return { parts };
}

/**
 * Try to infer file path from code content and language
 */
function inferFilePathFromCode(
  code: string,
  language?: string,
): string | undefined {
  const lines = code.split("\n");

  // Look for common file path indicators in comments
  for (const line of lines.slice(0, 5)) {
    // Check first 5 lines
    const trimmed = line.trim();

    // Look for file path in comments
    const filePathPatterns = [
      /^\/\/\s*(.+\.\w+)/, // // path/to/file.ext
      /^#\s*(.+\.\w+)/, // # path/to/file.ext
      /^\/\*\s*(.+\.\w+)\s*\*\//, // /* path/to/file.ext */
      /^<!--\s*(.+\.\w+)\s*-->/, // <!-- path/to/file.ext -->
      /^\/\/\s*File:\s*(.+\.\w+)/i, // // File: path/to/file.ext
      /^#\s*File:\s*(.+\.\w+)/i, // # File: path/to/file.ext
    ];

    for (const pattern of filePathPatterns) {
      const match = trimmed.match(pattern);
      if (match && match[1]) {
        const path = match[1].trim();
        if (isValidFilePath(path)) {
          return path;
        }
      }
    }
  }

  // Look for import/require statements that might indicate the file
  const importPatterns = [
    /from\s+['"](.+)['"]/g, // ES6 imports
    /import\s+['"](.+)['"]/g, // Import statements
    /require\(['"](.+)['"]\)/g, // CommonJS requires
  ];

  for (const pattern of importPatterns) {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      const importPath = match[1];
      if (importPath.startsWith("./") || importPath.startsWith("../")) {
        // This might give us a clue about the file structure
        continue;
      }
    }
  }

  return undefined;
}

/**
 * Check if a string looks like a valid file path
 */
function isValidFilePath(path: string): boolean {
  // Basic validation for file paths
  if (!path || path.length === 0) return false;
  if (path.includes("..")) return false; // Prevent directory traversal
  if (path.startsWith("/")) return false; // Should be relative paths
  if (!path.includes(".")) return false; // Should have an extension

  // Check for valid file extension
  const ext = path.split(".").pop()?.toLowerCase();
  const validExtensions = [
    "js",
    "jsx",
    "ts",
    "tsx",
    "py",
    "java",
    "cpp",
    "c",
    "h",
    "hpp",
    "css",
    "scss",
    "sass",
    "html",
    "htm",
    "xml",
    "json",
    "yaml",
    "yml",
    "md",
    "txt",
    "sh",
    "bash",
    "zsh",
    "fish",
    "ps1",
    "bat",
    "cmd",
    "sql",
    "php",
    "rb",
    "go",
    "rs",
    "swift",
    "kt",
    "scala",
    "clj",
    "vue",
    "svelte",
    "astro",
    "config",
    "env",
    "gitignore",
    "dockerfile",
    "toml",
    "ini",
    "conf",
    "lock",
    "log",
    "csv",
    "tsv",
    "properties",
  ];

  return ext ? validExtensions.includes(ext) : false;
}

/**
 * Extract file paths mentioned in text (for context detection)
 */
export function extractFilePathsFromText(text: string): string[] {
  const filePaths: string[] = [];

  // Look for file paths in various formats
  const patterns = [
    /(?:^|\s)([a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)*\.[a-zA-Z0-9]+)(?:\s|$)/g, // Basic file paths
    /`([^`]+\.[a-zA-Z0-9]+)`/g, // File paths in backticks
    /"([^"]+\.[a-zA-Z0-9]+)"/g, // File paths in quotes
    /'([^']+\.[a-zA-Z0-9]+)'/g, // File paths in single quotes
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const path = match[1];
      if (isValidFilePath(path) && !filePaths.includes(path)) {
        filePaths.push(path);
      }
    }
  }

  return filePaths;
}

/**
 * Context for inline editing
 */
export interface InlineEditingContext {
  vaultId?: Id<"vaults">;
  repositoryFullName?: string;
  branch?: string;
  currentFilePath?: string;
}

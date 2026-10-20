import type { Monaco } from "@monaco-editor/react";

// ---------------------------------------------------------------------------
// tsconfig.json parsing & Monaco compiler options
// ---------------------------------------------------------------------------

interface ParsedTsConfig {
  baseUrl?: string;
  paths?: Record<string, string[]>;
  strict?: boolean;
  jsx?: string;
}

/**
 * Parse a tsconfig.json string and return the relevant compiler options.
 * Lenient – returns empty object on parse failure.
 */
export function parseTsConfig(raw: string): ParsedTsConfig {
  try {
    const json = JSON.parse(raw);
    const co = json?.compilerOptions;
    if (!co) return {};
    return {
      baseUrl: co.baseUrl,
      paths: co.paths,
      strict: co.strict,
      jsx: co.jsx,
    };
  } catch {
    return {};
  }
}

/**
 * Apply tsconfig-derived compiler options (paths, baseUrl, etc.) to Monaco's
 * TypeScript defaults. Call once when project files are available.
 */
export function applyTsConfigToMonaco(monaco: Monaco, tsconfig: ParsedTsConfig) {
  const defaults = monaco.languages.typescript.typescriptDefaults;

  // Map tsconfig paths to Monaco-compatible paths (relative to baseUrl)
  let monacoPaths: Record<string, string[]> | undefined;
  if (tsconfig.paths) {
    monacoPaths = {};
    for (const [pattern, targets] of Object.entries(tsconfig.paths)) {
      // Strip leading "./" from targets – Monaco baseUrl is "file:///"
      monacoPaths[pattern] = targets.map((t) => (t.startsWith("./") ? t.slice(2) : t));
    }
  }

  defaults.setCompilerOptions({
    jsx: monaco.languages.typescript.JsxEmit.React,
    esModuleInterop: true,
    strict: tsconfig.strict ?? true,
    exactOptionalPropertyTypes: true,
    // Use file:/// as the virtual project root
    baseUrl: "file:///",
    ...(monacoPaths ? { paths: monacoPaths } : {}),
  });
}

import type { EditorProps } from "@monaco-editor/react";
import { createATA } from "./ata";
import { JsxEmit } from "typescript";
import type { Monaco } from "@monaco-editor/react";

export const typeHelper = createATA();

// Register the receivedFile listener once globally (not per editor).
// All editors share the same typescriptDefaults, so a single listener is sufficient.
// Registering per editor caused N × addExtraLib calls per file, each triggering
// a full re-validation of all models, which caused visible flickering.
let ataListenerRegistered = false;

function ensureATAListener(monaco: Monaco) {
  if (ataListenerRegistered) return;
  ataListenerRegistered = true;

  const defaults = monaco.languages.typescript.typescriptDefaults;

  typeHelper.addListener("receivedFile", (code: string, _path: string) => {
    const path = "file://" + _path;
    defaults.addExtraLib(code, path);
  });
}

/**
 * Set up ATA (Automatic Type Acquisition) for a mounted Monaco editor.
 * Only call this for .ts / .tsx files – it has no effect on other languages.
 */
export const setupEditorATA: NonNullable<EditorProps["onMount"]> = (
  editor,
  monaco,
) => {
  const defaults = monaco.languages.typescript.typescriptDefaults;

  defaults.setCompilerOptions({
    jsx: JsxEmit.React,
    esModuleInterop: true,
    strict: true,
    exactOptionalPropertyTypes: true,
  });

  // Register the global ATA listener (idempotent, only runs once)
  ensureATAListener(monaco);

  // acquireType on content change
  editor.onDidChangeModelContent(() => {
    void typeHelper.acquireType(editor.getValue());
  });

  void typeHelper.acquireType(editor.getValue());
};

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
export function applyTsConfigToMonaco(
  monaco: Monaco,
  tsconfig: ParsedTsConfig,
) {
  const defaults = monaco.languages.typescript.typescriptDefaults;

  // Map tsconfig paths to Monaco-compatible paths (relative to baseUrl)
  let monacoPaths: Record<string, string[]> | undefined;
  if (tsconfig.paths) {
    monacoPaths = {};
    for (const [pattern, targets] of Object.entries(tsconfig.paths)) {
      // Strip leading "./" from targets – Monaco baseUrl is "file:///"
      monacoPaths[pattern] = targets.map((t) =>
        t.startsWith("./") ? t.slice(2) : t,
      );
    }
  }

  defaults.setCompilerOptions({
    jsx: JsxEmit.React,
    esModuleInterop: true,
    strict: tsconfig.strict ?? true,
    exactOptionalPropertyTypes: true,
    // Use file:/// as the virtual project root
    baseUrl: "file:///",
    ...(monacoPaths ? { paths: monacoPaths } : {}),
  });
}

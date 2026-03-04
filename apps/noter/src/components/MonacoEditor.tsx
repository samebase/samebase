import { useRef, useEffect, useState, useCallback } from "react";
import Editor from "@monaco-editor/react";
import type { OnMount, Monaco } from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { ChangeSet, EditorState } from "@codemirror/state";
import {
  collab,
  getSyncedVersion,
  sendableUpdates,
  receiveUpdates,
  Update,
} from "@codemirror/collab";
import { client } from "@/main";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { type GithubTreeType } from "convex/schema";
import { useCacheQuery as useQuery } from "@/lib/convexQueryCache";
import {
  setupEditorATA,
  parseTsConfig,
  applyTsConfigToMonaco,
} from "./monaco/setupEditor";
import { useIsMobile } from "@/hooks/use-mobile";
import { useProjectFiles, type ProjectFile } from "@/hooks/useProjectFiles";

// ---------------------------------------------------------------------------
// Collab helpers (shared logic with CodeEditor.tsx)
// ---------------------------------------------------------------------------

const PUSH_DELAY = 500;

function awaitTimeout(timeout: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, timeout));
}

async function pushUpdatesToServer({
  version,
  repositoryFullName,
  filePath,
  fullUpdates,
}: {
  version: number;
  repositoryFullName: string;
  filePath: string;
  fullUpdates: readonly Update[];
}): Promise<boolean> {
  await awaitTimeout(PUSH_DELAY);
  const updates = fullUpdates.map((u) => ({
    clientId: u.clientID,
    changes: JSON.stringify(u.changes.toJSON()),
  }));
  return client
    .mutation(api.collaborative.pushUpdates, {
      repositoryFullName,
      filePath,
      version,
      updates,
    })
    .then((result) => result.success);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TS_EXTENSIONS = new Set(["ts", "tsx"]);

function isTypeScriptPath(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase();
  return !!ext && TS_EXTENSIONS.has(ext);
}

/** Detect Monaco language from file extension (for createModel). */
// ---------------------------------------------------------------------------
// Project file type context
// ---------------------------------------------------------------------------

// Track which files we've already added as extra libs (survives remounts)
const addedExtraLibs = new Set<string>();

/**
 * Register project files as extra libs so the TypeScript worker can resolve
 * imports across the project. Unlike createModel(), addExtraLib() does NOT
 * trigger diagnostics for each file — it's read-only type context, which
 * avoids the out-of-memory crashes from the worker trying to validate
 * hundreds of models at once.
 */
function syncProjectFiles(monaco: Monaco, projectFiles: ProjectFile[]) {
  const defaults = monaco.languages.typescript.typescriptDefaults;

  for (const file of projectFiles) {
    const uri = `file:///${file.path}`;
    if (addedExtraLibs.has(uri)) continue;
    addedExtraLibs.add(uri);
    defaults.addExtraLib(file.content, uri);
  }
}

/** Apply tsconfig from the project files (if found). */
function applyTsConfigFromProject(monaco: Monaco, projectFiles: ProjectFile[]) {
  // Prefer root tsconfig.json
  const tsconfigFile =
    projectFiles.find((f) => f.path === "tsconfig.json") ??
    projectFiles.find((f) => f.path.endsWith("/tsconfig.json"));

  if (tsconfigFile) {
    const parsed = parseTsConfig(tsconfigFile.content);
    applyTsConfigToMonaco(monaco, parsed);
  }
}

// Track whether we already applied tsconfig + models for a cache key
const appliedCacheKeys = new Set<string>();

// ---------------------------------------------------------------------------
// MonacoEditor component
// ---------------------------------------------------------------------------

type MonacoEditorInstance = Parameters<OnMount>[0];

export function MonacoEditor({
  firstDoc,
  repositoryFullName,
  filePath,
  vaultId,
  tree,
  treeSHA,
  showMobileLineNumbers = false,
}: {
  firstDoc: { version: number; content: string };
  repositoryFullName: string;
  filePath: string;
  vaultId: Id<"vaults">;
  tree: GithubTreeType[];
  treeSHA: string;
  showMobileLineNumbers?: boolean;
}) {
  const { theme, systemTheme } = useTheme();
  const effectiveTheme = theme === "system" ? systemTheme : theme;
  const isDark = effectiveTheme === "dark";
  const isMobileViewport = useIsMobile();

  // ---- Project files for import resolution ----
  const { files: projectFiles } = useProjectFiles(
    vaultId,
    tree,
    treeSHA,
    filePath,
  );

  // Store Monaco instance for use in effects
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- Monaco resolves to any from library types
  const monacoRef = useRef<Monaco | null>(null);

  // ---- Headless CodeMirror state for OT collab ----
  const cmStateRef = useRef(
    EditorState.create({
      doc: firstDoc.content,
      extensions: [collab({ startVersion: firstDoc.version })],
    }),
  );

  // Monaco editor instance (set on mount)
  const editorRef = useRef<MonacoEditorInstance | null>(null);

  // Suppression flag: true while we are programmatically applying remote
  // changes to Monaco so the onDidChangeModelContent handler ignores them.
  const isApplyingRemoteRef = useRef(false);

  // Guard against concurrent pushes
  const pushingRef = useRef(false);

  // Collab version – drives the pullUpdates subscription
  const [version, setVersion] = useState(firstDoc.version);

  // ---- Pull remote updates via Convex real-time query ----
  const remoteUpdates = useQuery(
    api.collaborative.pullUpdates,
    { repositoryFullName, filePath, version },
    { dontCache: true },
  );

  // ---- Push local changes to server ----
  const pushToServer = useCallback(async () => {
    const state = cmStateRef.current;
    const pending = sendableUpdates(state);
    if (pushingRef.current || !pending.length) return;

    pushingRef.current = true;
    const ver = getSyncedVersion(state);
    setVersion(ver);

    await pushUpdatesToServer({
      version: ver,
      repositoryFullName,
      filePath,
      fullUpdates: pending,
    });

    pushingRef.current = false;

    // Retry if more updates accumulated while we were pushing
    if (sendableUpdates(cmStateRef.current).length) {
      setTimeout(() => void pushToServer(), 100);
    }
  }, [repositoryFullName, filePath]);

  // ---- Apply incoming remote updates ----
  useEffect(() => {
    if (!remoteUpdates?.length || !editorRef.current) return;

    const cmUpdates: Update[] = remoteUpdates.map(
      (u: (typeof remoteUpdates)[number]) => ({
        changes: ChangeSet.fromJSON(JSON.parse(u.changes)),
        clientID: u.clientID,
      }),
    );

    // Apply to headless CM (handles OT rebasing of any unconfirmed local edits)
    const spec = receiveUpdates(cmStateRef.current, cmUpdates);
    const tr = cmStateRef.current.update(spec);

    // Mirror the diff into Monaco
    const model = editorRef.current.getModel();
    if (model && !tr.changes.empty) {
      isApplyingRemoteRef.current = true;

      const edits: Array<{
        range: {
          startLineNumber: number;
          startColumn: number;
          endLineNumber: number;
          endColumn: number;
        };
        text: string;
      }> = [];

      tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
        const startPos = model.getPositionAt(fromA);
        const endPos = model.getPositionAt(toA);
        edits.push({
          range: {
            startLineNumber: startPos.lineNumber,
            startColumn: startPos.column,
            endLineNumber: endPos.lineNumber,
            endColumn: endPos.column,
          },
          text: inserted.toString(),
        });
      });

      if (edits.length) {
        model.applyEdits(edits);
      }

      isApplyingRemoteRef.current = false;
    }

    cmStateRef.current = tr.state;
    setVersion(getSyncedVersion(tr.state));
  }, [remoteUpdates]);

  // ---- Sync project files into Monaco models ----
  useEffect(() => {
    if (!monacoRef.current || projectFiles.length === 0) return;

    const cacheKey = `${vaultId}:${treeSHA}`;
    if (appliedCacheKeys.has(cacheKey)) return;
    appliedCacheKeys.add(cacheKey);

    syncProjectFiles(monacoRef.current, projectFiles);
    applyTsConfigFromProject(monacoRef.current, projectFiles);
  }, [projectFiles, vaultId, treeSHA]);

  // ---- Monaco mount handler ----
  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // If project files are already loaded (cache hit), sync immediately
    if (projectFiles.length > 0) {
      const cacheKey = `${vaultId}:${treeSHA}`;
      if (!appliedCacheKeys.has(cacheKey)) {
        appliedCacheKeys.add(cacheKey);
        syncProjectFiles(monaco, projectFiles);
        applyTsConfigFromProject(monaco, projectFiles);
      }
    }

    // Set up ATA only for TypeScript files
    if (isTypeScriptPath(filePath)) {
      setupEditorATA(editor, monaco);
    }

    // Bridge local Monaco edits → headless CM → Convex
    editor.onDidChangeModelContent((e) => {
      if (isApplyingRemoteRef.current) return;

      const changes = e.changes.map((c) => ({
        from: c.rangeOffset,
        to: c.rangeOffset + c.rangeLength,
        insert: c.text,
      }));

      const tr = cmStateRef.current.update({ changes });
      cmStateRef.current = tr.state;

      void pushToServer();
    });
  };

  const lineNumbersMode = isMobileViewport
    ? showMobileLineNumbers
      ? "on"
      : "off"
    : "on";

  return (
    <div
      className="notranslate"
      translate="no"
      style={{
        height: "100%",
        minHeight: "400px",
        width: isMobileViewport ? "calc(100% + 2rem)" : "100%",
        marginInline: isMobileViewport ? "-1rem" : "0",
      }}
    >
      <Editor
        height="100%"
        path={`file:///${filePath}`}
        defaultValue={firstDoc.content}
        theme={isDark ? "vs-dark" : "vs"}
        onMount={handleMount}
        options={{
          minimap: { enabled: false },
          scrollbar: {
            alwaysConsumeMouseWheel: false,
            vertical: isMobileViewport ? "hidden" : "auto",
            verticalScrollbarSize: isMobileViewport ? 0 : 10,
            horizontalScrollbarSize: 10,
          },
          overviewRulerLanes: isMobileViewport ? 0 : 2,
          overviewRulerBorder: false,
          hideCursorInOverviewRuler: true,
          scrollBeyondLastLine: false,
          wordWrap: "on",
          fontSize: 14,
          tabSize: 2,
          lineNumbers: lineNumbersMode,
          lineNumbersMinChars: isMobileViewport ? 2 : 3,
          glyphMargin: false,
          folding: !isMobileViewport,
          lineDecorationsWidth: isMobileViewport ? 0 : 10,
        }}
      />
    </div>
  );
}

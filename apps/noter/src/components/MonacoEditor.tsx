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
import { buildMonacoAppliedCacheKey } from "@/lib/editorCacheKeys";
import { buildMonacoFileUri } from "@/lib/monacoFileUri";
import { useProsemarkMobilePaneDrag } from "@/components/useProsemarkMobilePaneDrag";

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
  branch,
  filePath,
  fullUpdates,
}: {
  version: number;
  repositoryFullName: string;
  branch: string;
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
      branch,
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
interface SyncProjectFilesArgs {
  monaco: Monaco;
  projectFiles: ProjectFile[];
  vaultId: Id<"vaults">;
  branch: string;
}

function syncProjectFiles(args: SyncProjectFilesArgs) {
  const { monaco, projectFiles, vaultId, branch } = args;
  const defaults = monaco.languages.typescript.typescriptDefaults;

  for (const file of projectFiles) {
    const uri = buildMonacoFileUri({
      vaultId,
      branch,
      filePath: file.path,
    });
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

/**
 * Shared Monaco wrapper that owns mobile pane drag and Monaco's mobile-specific
 * layout options. The collaborative editor uses it directly, and visual
 * fixtures reuse the same surface so mobile drag coverage exercises the
 * shipped shell handoff instead of a test-only stand-in.
 */
export function MonacoEditorSurface({
  branch,
  defaultValue,
  filePath,
  onMount,
  showMobileLineNumbers = false,
  syncError,
  vaultId,
}: {
  branch: string;
  defaultValue: string;
  filePath: string;
  onMount: OnMount;
  showMobileLineNumbers?: boolean;
  syncError: string | null;
  vaultId: Id<"vaults">;
}) {
  const { theme, systemTheme } = useTheme();
  const effectiveTheme = theme === "system" ? systemTheme : theme;
  const isDark = effectiveTheme === "dark";
  const isMobileViewport = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);
  const mobilePaneDrag = useProsemarkMobilePaneDrag(true, containerRef);
  const lineNumbersMode = isMobileViewport
    ? showMobileLineNumbers
      ? "on"
      : "off"
    : "on";

  return (
    <div
      ref={containerRef}
      className="notranslate relative h-full min-h-0 w-full"
      translate="no"
      style={{
        height: "100%",
        minHeight: "400px",
        touchAction: mobilePaneDrag.touchAction,
      }}
      {...mobilePaneDrag.containerProps}
    >
      <Editor
        height="100%"
        path={buildMonacoFileUri({ vaultId, branch, filePath })}
        defaultValue={defaultValue}
        theme={isDark ? "vs-dark" : "vs"}
        onMount={onMount}
        options={{
          minimap: { enabled: false },
          scrollbar: {
            alwaysConsumeMouseWheel: false,
            vertical: isMobileViewport ? "hidden" : "auto",
            verticalScrollbarSize: isMobileViewport ? 0 : 10,
            // Mobile Monaco now delegates horizontal touch drags to the shell,
            // so keep wrapped content and remove the horizontal scrollbar cue.
            horizontal: isMobileViewport ? "hidden" : "auto",
            horizontalScrollbarSize: isMobileViewport ? 0 : 10,
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
      {syncError ? (
        <div className="pointer-events-none absolute bottom-2 right-2 corner-notch-1 bg-red-600/90 px-2 py-1 text-[11px] text-white">
          {syncError}
        </div>
      ) : null}
    </div>
  );
}

export function MonacoEditor({
  firstDoc,
  repositoryFullName,
  branch,
  filePath,
  vaultId,
  tree,
  treeSHA,
  showMobileLineNumbers = false,
}: {
  firstDoc: { version: number; content: string };
  repositoryFullName: string;
  branch: string;
  filePath: string;
  vaultId: Id<"vaults">;
  tree: GithubTreeType[];
  treeSHA: string;
  showMobileLineNumbers?: boolean;
}) {
  // ---- Project files for import resolution ----
  const { files: projectFiles, scopePrefix } = useProjectFiles(
    vaultId,
    branch,
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
  const [syncError, setSyncError] = useState<string | null>(null);

  // ---- Pull remote updates via Convex real-time query ----
  const remoteUpdates = useQuery(
    api.collaborative.pullUpdates,
    { repositoryFullName, branch, filePath, version },
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

    let retryDelayMs = 100;
    try {
      const success = await pushUpdatesToServer({
        version: ver,
        repositoryFullName,
        branch,
        filePath,
        fullUpdates: pending,
      });

      if (success) {
        setSyncError(null);
      } else {
        retryDelayMs = 200;
        setSyncError("Syncing latest remote changes...");
      }
    } catch (error) {
      retryDelayMs = 1000;
      const message =
        error instanceof Error && error.message.length > 0
          ? error.message
          : "Failed to sync edits. Retrying...";
      setSyncError(message);
      console.error("Failed to push collaborative Monaco updates:", error);
    } finally {
      pushingRef.current = false;
    }

    // Retry if more updates accumulated while we were pushing
    if (sendableUpdates(cmStateRef.current).length) {
      setTimeout(() => void pushToServer(), retryDelayMs);
    }
  }, [repositoryFullName, branch, filePath]);

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

    const cacheKey = buildMonacoAppliedCacheKey({
      vaultId,
      branch,
      treeSHA,
      scopePrefix,
    });
    if (appliedCacheKeys.has(cacheKey)) return;
    appliedCacheKeys.add(cacheKey);

    syncProjectFiles({
      monaco: monacoRef.current,
      projectFiles,
      vaultId,
      branch,
    });
    applyTsConfigFromProject(monacoRef.current, projectFiles);
  }, [projectFiles, vaultId, branch, treeSHA, scopePrefix]);

  useEffect(() => {
    setSyncError(null);
  }, [repositoryFullName, filePath]);

  // ---- Monaco mount handler ----
  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // If project files are already loaded (cache hit), sync immediately
    if (projectFiles.length > 0) {
      const cacheKey = buildMonacoAppliedCacheKey({
        vaultId,
        branch,
        treeSHA,
        scopePrefix,
      });
      if (!appliedCacheKeys.has(cacheKey)) {
        appliedCacheKeys.add(cacheKey);
        syncProjectFiles({
          monaco,
          projectFiles,
          vaultId,
          branch,
        });
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

  return (
    <MonacoEditorSurface
      branch={branch}
      defaultValue={firstDoc.content}
      filePath={filePath}
      onMount={handleMount}
      showMobileLineNumbers={showMobileLineNumbers}
      syncError={syncError}
      vaultId={vaultId}
    />
  );
}

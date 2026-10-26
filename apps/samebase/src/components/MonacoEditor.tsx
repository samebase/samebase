import { useRef, useEffect } from "react";
import { createClientOnlyFn } from "@tanstack/react-start";
import type { OnMount, Monaco } from "@monaco-editor/react";
import { useMonacoCollaboration } from "@samebase/git-editor/monaco";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { GitHubTree } from "@samebase/git-editor/model";
import { parseTsConfig, applyTsConfigToMonaco } from "./monaco/setupEditor";
import { useProjectFiles, type ProjectFile } from "@/repository/editor/useProjectFiles";
import { buildMonacoAppliedCacheKey } from "@/repository/editor/editorCacheKeys";
import { buildMonacoFileUri } from "@/lib/monacoFileUri";
import { MonacoEditorSurface } from "@/components/MonacoEditorSurface";
import { registerPageLeaveGuard } from "@/lib/pageLeaveGuard";

const collaborationApi = {
  pullUpdates: api.collaborative.pullUpdates,
  pushUpdates: api.collaborative.pushUpdates,
};

// Type acquisition runs the TypeScript compiler in the browser. The server render never mounts an
// editor, and the compiler's CommonJS requires of Node modules cannot load in a Convex HTTP action,
// so the server build leaves the module out.
const loadEditorATA = createClientOnlyFn(() => import("./monaco/ata"));

const TS_EXTENSIONS = new Set(["ts", "tsx"]);

function isTypeScriptPath(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase();
  return !!ext && TS_EXTENSIONS.has(ext);
}

// Track which files we've already added as extra libs (survives remounts)
const addedExtraLibs = new Set<string>();

/**
 * Register project files as extra libs so the TypeScript worker can resolve
 * imports across the project. Unlike createModel(), addExtraLib() does NOT
 * trigger diagnostics for each file. It's read-only type context, which
 * avoids the out-of-memory crashes from the worker trying to validate
 * hundreds of models at once.
 */
interface SyncProjectFilesArgs {
  monaco: Monaco;
  projectFiles: ProjectFile[];
  repositoryId: Id<"repositories">;
  branch: string;
}

function syncProjectFiles(args: SyncProjectFilesArgs) {
  const { monaco, projectFiles, repositoryId, branch } = args;
  const defaults = monaco.languages.typescript.typescriptDefaults;

  for (const file of projectFiles) {
    const uri = buildMonacoFileUri({
      repositoryId,
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

export function MonacoEditor({
  firstDoc,
  githubRepositoryFullName,
  branch,
  filePath,
  repositoryId,
  tree,
  treeSHA,
  showMobileLineNumbers = false,
}: {
  firstDoc: { version: number; content: string };
  githubRepositoryFullName: string;
  branch: string;
  filePath: string;
  repositoryId: Id<"repositories">;
  tree: GitHubTree[];
  treeSHA: string;
  showMobileLineNumbers?: boolean;
}) {
  const { files: projectFiles, scopePrefix } = useProjectFiles(
    repositoryId,
    branch,
    tree,
    treeSHA,
    filePath,
  );
  const { onMount: mountCollaboration, syncError } = useMonacoCollaboration({
    api: collaborationApi,
    firstDoc,
    githubRepositoryFullName,
    branch,
    filePath,
    registerPageLeaveGuard,
  });

  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- Monaco resolves to any from library types
  const monacoRef = useRef<Monaco | null>(null);

  useEffect(() => {
    if (!monacoRef.current || projectFiles.length === 0) return;

    const cacheKey = buildMonacoAppliedCacheKey({
      repositoryId,
      branch,
      treeSHA,
      scopePrefix,
    });
    if (appliedCacheKeys.has(cacheKey)) return;
    appliedCacheKeys.add(cacheKey);

    syncProjectFiles({
      monaco: monacoRef.current,
      projectFiles,
      repositoryId,
      branch,
    });
    applyTsConfigFromProject(monacoRef.current, projectFiles);
  }, [projectFiles, repositoryId, branch, treeSHA, scopePrefix]);

  const handleMount: OnMount = (editor, monaco) => {
    monacoRef.current = monaco;

    // If project files are already loaded (cache hit), sync immediately
    if (projectFiles.length > 0) {
      const cacheKey = buildMonacoAppliedCacheKey({
        repositoryId,
        branch,
        treeSHA,
        scopePrefix,
      });
      if (!appliedCacheKeys.has(cacheKey)) {
        appliedCacheKeys.add(cacheKey);
        syncProjectFiles({
          monaco,
          projectFiles,
          repositoryId,
          branch,
        });
        applyTsConfigFromProject(monaco, projectFiles);
      }
    }

    // Set up ATA only for TypeScript files
    if (isTypeScriptPath(filePath)) {
      void loadEditorATA().then(({ setupEditorATA }) => setupEditorATA(editor, monaco));
    }
    mountCollaboration(editor, monaco);
  };

  return (
    <MonacoEditorSurface
      branch={branch}
      defaultValue={firstDoc.content}
      filePath={filePath}
      onMount={handleMount}
      showMobileLineNumbers={showMobileLineNumbers}
      syncError={syncError}
      repositoryKey={repositoryId}
    />
  );
}

import { useCodeMirrorCollaboration } from "@samebase/git-editor/codemirror";
import { api } from "../../convex/_generated/api";
import type { GetFunctionReferenceReturnType } from "@/lib/convexUtils";
import type { Id } from "../../convex/_generated/dataModel";
import type { GitHubTree } from "@samebase/git-editor/model";
import { MonacoEditor } from "./MonacoEditor";
import { CodeMirrorFileSurface } from "@/components/CodeMirrorFileSurface";
import { registerPageLeaveGuard } from "@/lib/pageLeaveGuard";

const collaborationApi = {
  pullUpdates: api.collaborative.pullUpdates,
  pushUpdates: api.collaborative.pushUpdates,
};

// Prose files: use ProseMark/CodeMirror. Everything else: Monaco.
const PROSE_EXTENSIONS = new Set(["md", "mdx", "mdc", "txt", "markdown"]);
type CodeEditorOverride = "default" | "codemirror";

function isProseFile(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase();
  // Default to prose if no extension (or unknown)
  return !ext || PROSE_EXTENSIONS.has(ext);
}

function shouldUseCodeMirrorEditor(args: { filePath: string; editorOverride: CodeEditorOverride }) {
  return args.editorOverride === "codemirror" || isProseFile(args.filePath);
}

export function CodeEditorWrapper({
  githubRepositoryFullName,
  branch,
  filePath,
  stagedFile,
  repositoryId,
  tree,
  treeSHA,
  showMobileLineNumbers = false,
  editorOverride = "default",
}: {
  githubRepositoryFullName: string;
  branch: string;
  filePath: string;
  stagedFile: NonNullable<GetFunctionReferenceReturnType<typeof api.fileStaging.getByNewPath>>;
  repositoryId: Id<"repositories">;
  tree: GitHubTree[];
  treeSHA: string;
  showMobileLineNumbers?: boolean;
  editorOverride?: CodeEditorOverride;
}) {
  if (shouldUseCodeMirrorEditor({ filePath, editorOverride })) {
    return (
      <CodeEditor
        key={`${githubRepositoryFullName}-${branch}-${filePath}`}
        firstDoc={stagedFile}
        githubRepositoryFullName={githubRepositoryFullName}
        branch={branch}
        filePath={filePath}
      />
    );
  }

  return (
    <MonacoEditor
      key={`${githubRepositoryFullName}-${branch}-${filePath}`}
      firstDoc={stagedFile}
      githubRepositoryFullName={githubRepositoryFullName}
      branch={branch}
      filePath={filePath}
      repositoryId={repositoryId}
      tree={tree}
      treeSHA={treeSHA}
      showMobileLineNumbers={showMobileLineNumbers}
    />
  );
}

export function CodeEditor({
  firstDoc,
  githubRepositoryFullName,
  branch,
  filePath,
}: {
  firstDoc: { version: number; content: string };
  githubRepositoryFullName: string;
  branch: string;
  filePath: string;
}) {
  const { extensions, syncError } = useCodeMirrorCollaboration({
    api: collaborationApi,
    initialVersion: firstDoc.version,
    githubRepositoryFullName,
    branch,
    filePath,
    registerPageLeaveGuard,
  });

  return (
    <div className="relative h-full min-h-0 w-full">
      <CodeMirrorFileSurface
        filePath={filePath}
        initialValue={firstDoc.content}
        extraExtensions={extensions}
      />
      {syncError ? (
        // Keep sync errors attached to the workspace-sized shell so they stay
        // visible even when the prose surface grows into a long auto-height
        // document that scrolls through the outer scene.
        <div className="pointer-events-none absolute bottom-2 right-2 corner-notch-1 bg-red-600/90 px-2 py-1 text-[11px] text-white">
          {syncError}
        </div>
      ) : null}
    </div>
  );
}

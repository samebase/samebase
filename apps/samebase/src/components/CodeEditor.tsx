/* eslint-disable @typescript-eslint/no-misused-promises */
import { useRef, useEffect, useMemo, useState } from "react";
import { ChangeSet } from "@codemirror/state";
import { EditorView } from "codemirror";
import { ViewPlugin, ViewUpdate } from "@codemirror/view";
import {
  collab,
  getSyncedVersion,
  receiveUpdates,
  sendableUpdates,
  Update,
} from "@codemirror/collab";
import { client } from "@/lib/convexClient";
import { api } from "../../convex/_generated/api";
import { useCacheQuery as useQuery } from "@/lib/convexQueryCache";
import { GetFunctionReferenceReturnType } from "@/lib/convexUtils";
import { Id } from "../../convex/_generated/dataModel";
import { type GitHubTree } from "../../convex/repository/model";
import { MonacoEditor } from "./MonacoEditor";
import { CodeMirrorFileSurface } from "@/components/CodeMirrorFileSurface";
import { registerPageLeaveGuard } from "@/lib/pageLeaveGuard";
import { flushCollaborativeUpdates } from "@/lib/collaborativeUpdates";

// Temporary:
// const tempRepositoryId = "k976ryb9d1m2gyvxhps87dac257mv5ps" as Id<"repositories">;
// const tempFilePath = "README.md";

function awaitTimeout(timeout: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, timeout);
  });
}

const delay = 500;

async function pushUpdates({
  version,
  githubRepositoryFullName,
  branch,
  filePath,
  fullUpdates,
}: {
  version: number;
  githubRepositoryFullName: string;
  branch: string;
  filePath: string;
  fullUpdates: readonly Update[];
}): Promise<boolean> {
  await awaitTimeout(delay);
  // Strip off transaction data
  let updates = fullUpdates.map((u) => ({
    clientId: u.clientID,
    changes: JSON.stringify(u.changes.toJSON()),
  }));

  return client
    .mutation(api.collaborative.pushUpdates, {
      githubRepositoryFullName,
      branch,
      filePath,
      version,
      updates,
    })
    .then((result) => result.success);
}

// https://github.com/codemirror/website/blob/main/site/examples/collab/collab.ts#L89
function peerExtension({
  startVersion,
  githubRepositoryFullName,
  branch,
  filePath,
  setVersion,
  setPull,
  setSyncError,
}: {
  startVersion: number;
  githubRepositoryFullName: string;
  branch: string;
  filePath: string;
  setVersion: (version: number) => void;
  setPull: (pull: (updates: readonly Update[], version: number) => void) => void;
  setSyncError: (error: string | null) => void;
}) {
  let plugin = ViewPlugin.fromClass(
    class {
      private pushing = false;
      private done = false;
      private retryTimer: number | null = null;
      private releasePageLeaveGuard: (() => void) | null = null;
      private readonly view: EditorView;

      private isDestroyed(): boolean {
        return this.done;
      }

      constructor(view: EditorView) {
        this.view = view;
        // this.pull();
        setPull(this.pull.bind(this));
      }

      update(update: ViewUpdate) {
        if (!this.isDestroyed() && update.docChanged) {
          this.syncPageLeaveGuard();
          void this.push();
        }
      }

      private syncPageLeaveGuard() {
        const hasLocalUpdates = sendableUpdates(this.view.state).length > 0;

        if (hasLocalUpdates && this.releasePageLeaveGuard === null) {
          this.releasePageLeaveGuard = registerPageLeaveGuard(
            `Unsynced editor changes in ${filePath}`,
          );
          return;
        }

        if (!hasLocalUpdates && this.releasePageLeaveGuard !== null) {
          this.releasePageLeaveGuard();
          this.releasePageLeaveGuard = null;
        }
      }

      async push() {
        if (this.isDestroyed()) return;
        let updates = sendableUpdates(this.view.state);

        if (this.pushing || !updates.length) return;
        this.pushing = true;
        let version = getSyncedVersion(this.view.state);
        if (this.isDestroyed()) return;
        setVersion(version);

        let retryDelayMs = 100;
        try {
          const success = await pushUpdates({
            version,
            githubRepositoryFullName,
            branch,
            filePath,
            fullUpdates: updates,
          });

          if (success) {
            if (!this.isDestroyed()) {
              setSyncError(null);
            }
          } else {
            retryDelayMs = 200;
            if (!this.isDestroyed()) {
              setSyncError("Syncing latest remote changes...");
            }
          }
        } catch (error) {
          retryDelayMs = 1000;
          const message =
            error instanceof Error && error.message.length > 0
              ? error.message
              : "Failed to sync edits. Retrying...";
          if (!this.isDestroyed()) {
            setSyncError(message);
          }
          console.error("Failed to push collaborative editor updates:", error);
        } finally {
          this.pushing = false;
        }
        // Regardless of whether the push failed or new updates came in
        // while it was running, try again if there's updates remaining
        if (!this.isDestroyed() && sendableUpdates(this.view.state).length) {
          this.retryTimer = window.setTimeout(() => {
            this.retryTimer = null;
            if (!this.isDestroyed()) {
              void this.push();
            }
          }, retryDelayMs);
        }
        if (!this.isDestroyed()) {
          this.syncPageLeaveGuard();
        }
      }

      async pull(updates: readonly Update[], incomingVersion: number) {
        if (this.isDestroyed()) return;
        let version = getSyncedVersion(this.view.state);
        if (version !== incomingVersion) return;

        // let updates = await pullUpdates({
        //   version,
        //   githubRepositoryFullName,
        //   filePath,
        // });
        this.view.dispatch(receiveUpdates(this.view.state, updates));
        this.syncPageLeaveGuard();

        const newVersion = getSyncedVersion(this.view.state);
        if (!this.isDestroyed()) {
          setVersion(newVersion);
        }
      }

      destroy() {
        this.done = true;
        if (this.retryTimer !== null) {
          window.clearTimeout(this.retryTimer);
          this.retryTimer = null;
        }
        // Unmount cancels the retry that sends edits typed during an in-flight
        // push, so flush them here and keep the page-leave guard until it settles.
        const releasePageLeaveGuard = this.releasePageLeaveGuard;
        this.releasePageLeaveGuard = null;
        void flushCollaborativeUpdates({
          state: this.view.state,
          githubRepositoryFullName,
          branch,
          filePath,
        }).then(() => releasePageLeaveGuard?.());
      }
    },
  );
  return [collab({ startVersion }), plugin];
}

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
  const pullRef = useRef<((updates: readonly Update[], version: number) => void) | null>(null);
  // CodeEditor is keyed by repo/branch/file path, so this captures the mount
  // version for the currently opened file without forcing the editor surface to
  // remount on every successful collaborative sync.
  const mountedFileVersionRef = useRef(firstDoc.version);
  const [version, setVersion] = useState(mountedFileVersionRef.current);
  const [syncError, setSyncError] = useState<string | null>(null);

  const updates = useQuery(
    api.collaborative.pullUpdates,
    {
      githubRepositoryFullName,
      branch,
      filePath,
      version,
    },
    {
      dontCache: true,
    },
  );

  useEffect(() => {
    if (!updates || !pullRef.current) return;

    const cmUpdates = updates.map((u: (typeof updates)[number]) => ({
      changes: ChangeSet.fromJSON(JSON.parse(u.changes)),
      clientID: u.clientID,
    }));
    pullRef.current(cmUpdates, version);
    // `version` must stay coupled to the fetched `updates` batch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updates]);

  useEffect(() => {
    setSyncError(null);
  }, [githubRepositoryFullName, branch, filePath]);

  const collaborationExtensions = useMemo(
    () =>
      peerExtension({
        startVersion: mountedFileVersionRef.current,
        githubRepositoryFullName,
        branch,
        filePath,
        setVersion,
        setSyncError,
        setPull: (pull) => {
          pullRef.current = pull;
        },
      }),
    [branch, filePath, githubRepositoryFullName],
  );

  return (
    <div className="relative h-full min-h-0 w-full">
      <CodeMirrorFileSurface
        filePath={filePath}
        initialValue={firstDoc.content}
        extraExtensions={collaborationExtensions}
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

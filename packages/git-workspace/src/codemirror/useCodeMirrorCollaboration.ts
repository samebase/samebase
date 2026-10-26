import { useEffect, useMemo, useRef, useState } from "react";
import { useConvex, useQuery_experimental, type ConvexReactClient } from "convex/react";
import { ChangeSet } from "@codemirror/state";
import { type EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import {
  collab,
  getSyncedVersion,
  receiveUpdates,
  sendableUpdates,
  type Update,
} from "@codemirror/collab";
import {
  flushCollaborativeUpdates,
  pushCollaborativeUpdates,
  type CollaborationApi,
  type CollaborationScope,
  type RegisterPageLeaveGuard,
} from "../react/collaboration.js";

// https://github.com/codemirror/website/blob/main/site/examples/collab/collab.ts#L89
function peerExtension({
  client,
  api,
  startVersion,
  githubRepositoryFullName,
  branch,
  filePath,
  setVersion,
  setPull,
  setSyncError,
  registerPageLeaveGuard,
}: CollaborationScope & {
  client: ConvexReactClient;
  api: CollaborationApi;
  startVersion: number;
  setVersion: (version: number) => void;
  setPull: (pull: (updates: readonly Update[], version: number) => void) => void;
  setSyncError: (error: string | null) => void;
  registerPageLeaveGuard: RegisterPageLeaveGuard;
}) {
  const plugin = ViewPlugin.fromClass(
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
        const updates = sendableUpdates(this.view.state);
        if (this.pushing || !updates.length) return;

        this.pushing = true;
        const version = getSyncedVersion(this.view.state);
        setVersion(version);

        let retryDelayMs = 100;
        try {
          const success = await pushCollaborativeUpdates({
            client,
            api,
            version,
            githubRepositoryFullName,
            branch,
            filePath,
            fullUpdates: updates,
          });

          if (success) {
            if (!this.isDestroyed()) setSyncError(null);
          } else {
            retryDelayMs = 200;
            if (!this.isDestroyed()) setSyncError("Syncing latest remote changes...");
          }
        } catch (error) {
          retryDelayMs = 1000;
          const message =
            error instanceof Error && error.message.length > 0
              ? error.message
              : "Failed to sync edits. Retrying...";
          if (!this.isDestroyed()) setSyncError(message);
          console.error("Failed to push collaborative editor updates:", error);
        } finally {
          this.pushing = false;
        }
        // Regardless of whether the push failed or new updates came in
        // while it was running, try again if there's updates remaining.
        if (!this.isDestroyed() && sendableUpdates(this.view.state).length) {
          this.retryTimer = window.setTimeout(() => {
            this.retryTimer = null;
            if (!this.isDestroyed()) void this.push();
          }, retryDelayMs);
        }
        if (!this.isDestroyed()) this.syncPageLeaveGuard();
      }

      pull(updates: readonly Update[], incomingVersion: number) {
        if (this.isDestroyed()) return;
        const version = getSyncedVersion(this.view.state);
        if (version !== incomingVersion) return;

        this.view.dispatch(receiveUpdates(this.view.state, updates));
        this.syncPageLeaveGuard();
        setVersion(getSyncedVersion(this.view.state));
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
          client,
          api,
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

/** Mount a new editor for each repository, branch and file path. */
export function useCodeMirrorCollaboration({
  api,
  initialVersion,
  githubRepositoryFullName,
  branch,
  filePath,
  registerPageLeaveGuard,
}: CollaborationScope & {
  api: CollaborationApi;
  initialVersion: number;
  registerPageLeaveGuard: RegisterPageLeaveGuard;
}) {
  const client = useConvex();
  const pullRef = useRef<((updates: readonly Update[], version: number) => void) | null>(null);
  // Keep the mount version stable so successful syncs do not remount the editor.
  const mountedFileVersionRef = useRef(initialVersion);
  const [version, setVersion] = useState(mountedFileVersionRef.current);
  const [syncError, setSyncError] = useState<string | null>(null);
  const pulledUpdates = useQuery_experimental({
    query: api.pullUpdates,
    args: {
      githubRepositoryFullName,
      branch,
      filePath,
      version,
    },
  });
  const updates = pulledUpdates.status === "success" ? pulledUpdates.data : undefined;

  useEffect(() => {
    if (!updates || !pullRef.current) return;

    const cmUpdates = updates.map((update) => ({
      changes: ChangeSet.fromJSON(JSON.parse(update.changes)),
      clientID: update.clientID,
    }));
    pullRef.current(cmUpdates, version);
    // `version` must stay coupled to the fetched `updates` batch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updates]);

  useEffect(() => {
    setSyncError(null);
  }, [githubRepositoryFullName, branch, filePath]);

  const extensions = useMemo(
    () =>
      peerExtension({
        client,
        api,
        startVersion: mountedFileVersionRef.current,
        githubRepositoryFullName,
        branch,
        filePath,
        setVersion,
        setSyncError,
        registerPageLeaveGuard,
        setPull: (pull) => {
          pullRef.current = pull;
        },
      }),
    [api, branch, client, filePath, githubRepositoryFullName, registerPageLeaveGuard],
  );

  return {
    extensions,
    syncError: pulledUpdates.status === "error" ? pulledUpdates.error.message : syncError,
  };
}

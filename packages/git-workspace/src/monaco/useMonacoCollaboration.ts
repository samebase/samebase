import { useCallback, useEffect, useRef, useState } from "react";
import { useConvex, useQuery_experimental } from "convex/react";
import type { OnMount } from "@monaco-editor/react";
import { ChangeSet, EditorState } from "@codemirror/state";
import {
  collab,
  getSyncedVersion,
  sendableUpdates,
  receiveUpdates,
  type Update,
} from "@codemirror/collab";
import {
  flushCollaborativeUpdates,
  pushCollaborativeUpdates,
  type CollaborationApi,
  type CollaborationScope,
  type RegisterPageLeaveGuard,
} from "../react/collaboration.js";
import { createCollaborativeText } from "../component/collaborativeText.js";

type MonacoEditorInstance = Parameters<OnMount>[0];

/** Mount a new editor for each repository, branch and file path. */
export function useMonacoCollaboration({
  api,
  firstDoc,
  githubRepositoryFullName,
  branch,
  filePath,
  registerPageLeaveGuard,
}: CollaborationScope & {
  api: CollaborationApi;
  firstDoc: { version: number; content: string };
  registerPageLeaveGuard: RegisterPageLeaveGuard;
}) {
  const client = useConvex();
  // Headless CodeMirror state performs OT for the Monaco model.
  const cmStateRef = useRef(
    EditorState.create({
      doc: createCollaborativeText(firstDoc.content),
      extensions: [collab({ startVersion: firstDoc.version })],
    }),
  );
  const editorRef = useRef<MonacoEditorInstance | null>(null);
  // A pulled batch that lands before Monaco mounts must be applied on mount;
  // the batch itself does not change again to rerun the effect.
  const [isEditorMounted, setIsEditorMounted] = useState(false);
  // Ignore native model changes while applying a remote CodeMirror update.
  const isApplyingRemoteRef = useRef(false);
  const pushingRef = useRef(false);
  const releasePageLeaveGuardRef = useRef<(() => void) | null>(null);
  // Push retries outlive unmount; after it the final flush owns the remaining edits.
  const isMountedRef = useRef(false);
  const [version, setVersion] = useState(firstDoc.version);
  const [syncError, setSyncError] = useState<string | null>(null);

  const syncPageLeaveGuard = useCallback(() => {
    const hasLocalUpdates = sendableUpdates(cmStateRef.current).length > 0;
    if (hasLocalUpdates && releasePageLeaveGuardRef.current === null) {
      releasePageLeaveGuardRef.current = registerPageLeaveGuard(
        `Unsynced editor changes in ${filePath}`,
      );
      return;
    }
    if (!hasLocalUpdates && releasePageLeaveGuardRef.current !== null) {
      releasePageLeaveGuardRef.current();
      releasePageLeaveGuardRef.current = null;
    }
  }, [filePath, registerPageLeaveGuard]);

  // Unmount stops the retry that sends edits typed during an in-flight push, so
  // flush them here and keep the page-leave guard until that flush settles.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      const releasePageLeaveGuard = releasePageLeaveGuardRef.current;
      releasePageLeaveGuardRef.current = null;
      void flushCollaborativeUpdates({
        client,
        api,
        state: cmStateRef.current,
        githubRepositoryFullName,
        branch,
        filePath,
      }).then(() => releasePageLeaveGuard?.());
    };
  }, [api, client, githubRepositoryFullName, branch, filePath]);

  const pulledUpdates = useQuery_experimental({
    query: api.pullUpdates,
    args: {
      githubRepositoryFullName,
      branch,
      filePath,
      version,
    },
  });
  const remoteUpdates = pulledUpdates.status === "success" ? pulledUpdates.data : undefined;

  const pushToServer = useCallback(
    async function pushToServer() {
      const state = cmStateRef.current;
      const pending = sendableUpdates(state);
      if (!isMountedRef.current || pushingRef.current || !pending.length) return;

      pushingRef.current = true;
      const currentVersion = getSyncedVersion(state);
      setVersion(currentVersion);

      let retryDelayMs = 100;
      try {
        const success = await pushCollaborativeUpdates({
          client,
          api,
          version: currentVersion,
          githubRepositoryFullName,
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

      // Retry if more updates accumulated while we were pushing.
      if (sendableUpdates(cmStateRef.current).length) {
        setTimeout(() => void pushToServer(), retryDelayMs);
      }
    },
    [api, client, githubRepositoryFullName, branch, filePath],
  );

  useEffect(() => {
    if (!remoteUpdates?.length || !editorRef.current) return;

    const cmUpdates: Update[] = remoteUpdates.map((update) => ({
      changes: ChangeSet.fromJSON(JSON.parse(update.changes)),
      clientID: update.clientID,
    }));

    // CodeMirror rebases any unconfirmed local edits before they reach Monaco.
    const spec = receiveUpdates(cmStateRef.current, cmUpdates);
    const transaction = cmStateRef.current.update(spec);
    const model = editorRef.current.getModel();
    if (model && !transaction.changes.empty) {
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

      transaction.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
        // OT counts every line break once; Monaco offsets count CRLF twice.
        const startLine = cmStateRef.current.doc.lineAt(fromA);
        const endLine = cmStateRef.current.doc.lineAt(toA);
        edits.push({
          range: {
            startLineNumber: startLine.number,
            startColumn: fromA - startLine.from + 1,
            endLineNumber: endLine.number,
            endColumn: toA - endLine.from + 1,
          },
          text: inserted.toString(),
        });
      });
      if (edits.length) model.applyEdits(edits);
      isApplyingRemoteRef.current = false;
    }

    cmStateRef.current = transaction.state;
    setVersion(getSyncedVersion(transaction.state));
    syncPageLeaveGuard();
  }, [remoteUpdates, syncPageLeaveGuard, isEditorMounted]);

  useEffect(() => {
    setSyncError(null);
  }, [githubRepositoryFullName, filePath]);

  const onMount: OnMount = (editor) => {
    editorRef.current = editor;
    setIsEditorMounted(true);
    // Bridge local Monaco edits into the headless CodeMirror state.
    editor.onDidChangeModelContent((event) => {
      if (isApplyingRemoteRef.current) return;

      const previousDoc = cmStateRef.current.doc;
      const changes = event.changes.map((change) => ({
        from: previousDoc.line(change.range.startLineNumber).from + change.range.startColumn - 1,
        to: previousDoc.line(change.range.endLineNumber).from + change.range.endColumn - 1,
        insert: change.text,
      }));
      cmStateRef.current = cmStateRef.current.update({ changes }).state;
      syncPageLeaveGuard();
      void pushToServer();
    });
  };

  return {
    onMount,
    syncError: pulledUpdates.status === "error" ? pulledUpdates.error.message : syncError,
  };
}

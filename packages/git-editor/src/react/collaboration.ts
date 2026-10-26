import { ChangeSet, type EditorState } from "@codemirror/state";
import { getSyncedVersion, receiveUpdates, sendableUpdates, type Update } from "@codemirror/collab";
import type { ConvexReactClient } from "convex/react";
import type { FunctionReference } from "convex/server";

export type CollaborationScope = {
  githubRepositoryFullName: string;
  branch: string;
  filePath: string;
};

export type CollaborationApi = {
  pullUpdates: FunctionReference<
    "query",
    "public",
    CollaborationScope & { version: number },
    Array<{ clientID: string; changes: string }>
  >;
  pushUpdates: FunctionReference<
    "mutation",
    "public",
    CollaborationScope & {
      version: number;
      updates: Array<{ clientId: string; changes: string }>;
    },
    { success: boolean; newVersion: number }
  >;
};

export type RegisterPageLeaveGuard = (reason: string) => () => void;

const PUSH_DELAY_MS = 500;

export async function pushCollaborativeUpdates({
  client,
  api,
  version,
  githubRepositoryFullName,
  branch,
  filePath,
  fullUpdates,
}: CollaborationScope & {
  client: ConvexReactClient;
  api: CollaborationApi;
  version: number;
  fullUpdates: readonly Update[];
}): Promise<boolean> {
  await new Promise((resolve) => setTimeout(resolve, PUSH_DELAY_MS));
  const result = await client.mutation(api.pushUpdates, {
    githubRepositoryFullName,
    branch,
    filePath,
    version,
    updates: fullUpdates.map((update) => ({
      clientId: update.clientID,
      changes: JSON.stringify(update.changes.toJSON()),
    })),
  });
  return result.success;
}

/** Enough to absorb the unmounted editor's own in-flight push plus one concurrent remote edit. */
const FINAL_FLUSH_ATTEMPTS = 3;

/**
Sends the unconfirmed local edits in `state` once its editor has unmounted.
An unmounted editor no longer receives `pullUpdates` results, so this catches
`state` up with a one-shot pull before each push. The server's version check
rejects any push that races the editor's own in-flight push.
*/
export async function flushCollaborativeUpdates({
  client,
  api,
  state,
  githubRepositoryFullName,
  branch,
  filePath,
}: CollaborationScope & {
  client: ConvexReactClient;
  api: CollaborationApi;
  state: EditorState;
}): Promise<void> {
  let current = state;
  try {
    for (let attempt = 0; attempt < FINAL_FLUSH_ATTEMPTS; attempt++) {
      if (!sendableUpdates(current).length) return;

      const remoteUpdates = await client.query(api.pullUpdates, {
        githubRepositoryFullName,
        branch,
        filePath,
        version: getSyncedVersion(current),
      });
      current = receiveUpdates(
        current,
        remoteUpdates.map((update) => ({
          changes: ChangeSet.fromJSON(JSON.parse(update.changes)),
          clientID: update.clientID,
        })),
      ).state;

      const pending = sendableUpdates(current);
      if (!pending.length) return;

      const { success } = await client.mutation(api.pushUpdates, {
        githubRepositoryFullName,
        branch,
        filePath,
        version: getSyncedVersion(current),
        updates: pending.map((update) => ({
          clientId: update.clientID,
          changes: JSON.stringify(update.changes.toJSON()),
        })),
      });
      if (success) return;
    }
    console.error(
      `Gave up sending the last edits in ${filePath} after repeated version conflicts.`,
    );
  } catch (error) {
    console.error(`Failed to send the last edits in ${filePath}:`, error);
  }
}

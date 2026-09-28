import { ChangeSet, type EditorState } from "@codemirror/state";
import { getSyncedVersion, receiveUpdates, sendableUpdates } from "@codemirror/collab";
import { client } from "@/lib/convexClient";
import { api } from "../../convex/_generated/api";

/** Enough to absorb the unmounted editor's own in-flight push plus one concurrent remote edit. */
const FINAL_FLUSH_ATTEMPTS = 3;

/**
Sends the unconfirmed local edits in `state` once its editor has unmounted.
An unmounted editor no longer receives `pullUpdates` results, so this catches
`state` up with a one-shot pull before each push. The server's version check
rejects any push that races the editor's own in-flight push.
*/
export async function flushCollaborativeUpdates({
  state,
  githubRepositoryFullName,
  branch,
  filePath,
}: {
  state: EditorState;
  githubRepositoryFullName: string;
  branch: string;
  filePath: string;
}): Promise<void> {
  let current = state;
  try {
    for (let attempt = 0; attempt < FINAL_FLUSH_ATTEMPTS; attempt++) {
      if (!sendableUpdates(current).length) return;

      const remoteUpdates = await client.query(api.collaborative.pullUpdates, {
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

      const { success } = await client.mutation(api.collaborative.pushUpdates, {
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

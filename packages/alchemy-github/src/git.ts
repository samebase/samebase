// The paths, blob shas, and commit messages of the state branches.
import { createHash } from "node:crypto";
import { decodeFqn } from "alchemy/FQN";

/** The lease of a stage, which Alchemy's BucketState rewrites every 20 seconds during a run. */
export const LEASE_FILE = "__lease__.json";

/** A path with each segment URL-encoded and its slashes kept, for a GitHub API URL. */
export const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

/** The git blob sha of `text`: what GitHub reports as the file's sha. */
export const blobSha = (text: string) => {
  const bytes = Buffer.from(text, "utf8");
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
};

/** What the commit message calls a key: `{stack} {stage}` and the resource. */
const describeKey = (key: string) => {
  const parts = key.split("/");
  const file = parts[parts.length - 1] ?? key;
  if (parts.length < 3) return { group: "", name: file.replace(/\.json$/, "") };
  const name =
    file === "__stack_output__.json"
      ? "stack output"
      : file === LEASE_FILE
        ? "lock"
        : decodeFqn(file.replace(/\.json$/, ""));
  return { group: `${parts.slice(0, -2).join("/")} ${parts[parts.length - 2]}`, name };
};

const listNames = (verb: string, names: ReadonlyArray<string>) =>
  names.length === 0
    ? []
    : names.length <= 5
      ? [`${verb} ${names.join(", ")}`]
      : [`${verb} ${names.length} resources`];

/**
 * One line per stage, such as `app prod: set Worker, Bucket; delete Old`. A lock change carries
 * its `lock` text (`take lock`, `renew lock`, `release lock`) in place of a resource name.
 */
export const commitMessage = (
  changes: ReadonlyArray<{
    readonly key: string;
    readonly deleted: boolean;
    readonly lock: string;
  }>,
) => {
  const groups = new Map<string, { set: string[]; deleted: string[]; lock: string[] }>();
  for (const change of changes) {
    const { group, name } = describeKey(change.key);
    const entry = groups.get(group) ?? { set: [], deleted: [], lock: [] };
    if (change.lock !== "") entry.lock.push(change.lock);
    else if (change.deleted) entry.deleted.push(name);
    else entry.set.push(name);
    groups.set(group, entry);
  }
  return Array.from(groups, ([group, entry]) => {
    const what = [
      ...entry.lock,
      ...listNames("set", entry.set),
      ...listNames("delete", entry.deleted),
    ].join("; ");
    return group === "" ? `store: ${what}` : `${group}: ${what}`;
  }).join("\n");
};

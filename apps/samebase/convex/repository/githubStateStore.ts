import { RequestError } from "@octokit/request-error";
import type { Octokit } from "@octokit/rest";
import { validate } from "convex-helpers/validators";
import { v } from "convex/values";
import { parseWithoutSecretValues, readDeployedStacks } from "../../shared/alchemyState";
import type { AlchemyStack, GitHubStacksRead } from "../../shared/alchemyStateModel";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { resolveGitHubAppAccess } from "../githubAppAccess";
import { limiter } from "./requestLimiter";

const { array, boolean, object, string } = v;

/**
The read of the branch for one repository, before the Convex metadata of its deployments.
`stageFiles` is true when a stage folder holds a `.json` file, with or without a run record. A read
with `treeOnly` stops after the tree, so its `stacks` are then empty.
*/
type GitHubStoreRead =
  | Exclude<GitHubStacksRead, { state: "found" }>
  | { state: "found"; stageFiles: boolean; stacks: AlchemyStack[] };

/**
The branch of `@samebase/alchemy-kit/github-state` with its default name. A store on another branch
is not found.
*/
const STATE_BRANCH = "alchemy-state-store";
/** The file of a stage folder that holds the stage output. Every other `.json` file is a resource. */
const STAGE_OUTPUT_FILE = "__stack_output__.json";
/** A file of a stage folder that is not Alchemy state. */
const LEASE_FILE = "__lease__.json";
/** GitHub gives one blob per request. This bounds the requests that run at once. */
const BLOB_REQUEST_LIMIT = 16;

const vRef = object({ object: object({ sha: string() }) });
const vTree = object({
  truncated: boolean(),
  tree: array(object({ path: string(), type: string(), sha: string() })),
});
const vRawBlob = string();
const vResourceState = object({ fqn: string() });

/**
Ends the read as failed. The message names the request and its status, never a body: a body can
hold a secret value.
*/
class StoreReadFailure extends Error {}

/** The `data` of a GitHub reply. A refused or failed request fails the read. */
async function githubData(name: string, request: () => Promise<{ data: unknown }>) {
  try {
    return (await request()).data;
  } catch (error) {
    throw new StoreReadFailure(
      `${name}: ${error instanceof RequestError ? error.status : "no reply"}`,
    );
  }
}

/**
The stage folders of the branch, in stack name order and then in stage name order, null when the
repository has no branch `alchemy-state-store`. A file is `{stack}/{stage}/{file}.json`: a stage name
and a file name have no `/`, and a stack name can have one, such as `owner/name/folder`. Other paths,
such as the `README.md` at the root, are not state. A truncated tree fails the read: a partial
read could hide a stack.
*/
async function readStageFolders(octokit: Octokit, owner: string, repo: string) {
  let ref: unknown;
  try {
    ref = (
      await octokit.request("GET /repos/{owner}/{repo}/git/ref/{ref}", {
        owner,
        repo,
        ref: `heads/${STATE_BRANCH}`,
      })
    ).data;
  } catch (error) {
    // GitHub answers 409 for a repository without a commit, which has no branch.
    // https://docs.github.com/en/rest/git/refs#get-a-reference
    if (error instanceof RequestError && (error.status === 404 || error.status === 409)) {
      return null;
    }
    throw new StoreReadFailure(
      `git ref: ${error instanceof RequestError ? error.status : "no reply"}`,
    );
  }
  if (!validate(vRef, ref, { allowUnknownFields: true })) {
    throw new StoreReadFailure("git ref: unexpected reply");
  }
  const commitSha = ref.object.sha;
  const tree = await githubData(
    "git tree",
    async () =>
      await octokit.request("GET /repos/{owner}/{repo}/git/trees/{tree_sha}", {
        owner,
        repo,
        tree_sha: commitSha,
        recursive: "1",
      }),
  );
  if (!validate(vTree, tree, { allowUnknownFields: true })) {
    throw new StoreReadFailure("git tree: unexpected reply");
  }
  if (tree.truncated) {
    throw new StoreReadFailure("git tree: truncated");
  }

  const folders = new Map<
    string,
    { stack: string; stage: string; output: string | null; resources: string[] }
  >();
  for (const entry of tree.tree) {
    const [file, stage, ...stack] = entry.path.split("/").reverse();
    if (
      entry.type !== "blob" ||
      stack.length === 0 ||
      !file.endsWith(".json") ||
      file === LEASE_FILE
    ) {
      continue;
    }
    const folderPath = entry.path.slice(0, -file.length - 1);
    const folder = folders.get(folderPath) ?? {
      stack: stack.reverse().join("/"),
      stage,
      output: null,
      resources: [],
    };
    if (file === STAGE_OUTPUT_FILE) {
      folder.output = entry.sha;
    } else {
      folder.resources.push(entry.sha);
    }
    folders.set(folderPath, folder);
  }
  return [...folders.values()].sort(
    (left, right) => left.stack.localeCompare(right.stack) || left.stage.localeCompare(right.stage),
  );
}

/**
Reads the stacks of `repository` (GitHub `owner/name`) from the branch `alchemy-state-store` of the
repository, as `readDeployedStacks` keeps them: only the run record in the output of a stage counts.
Stacks and stages are in name order, resources in fqn order, and the fqn of a resource is the one
in its file. The resources of a stage are read only when its run record names the repository. Each
file has its secret values removed as soon as it arrives, so no secret value and no sealed value
leaves this function. Samebase has no key to open a sealed value. A request that fails stops the
whole read: a partial read could hide a stack. `treeOnly` is for the check before a GitHub
repository deletion: a file in a stage folder answers it from the tree alone.
*/
export async function readGitHubStateStore(args: {
  octokit: Octokit;
  repository: string;
  treeOnly: boolean;
}): Promise<GitHubStoreRead> {
  const { octokit, repository } = args;
  const [owner, repo] = repository.split("/");
  try {
    const folders = await readStageFolders(octokit, owner, repo);
    if (folders === null) {
      return { state: "no_store" };
    }
    const stageFiles = folders.length > 0;
    if (args.treeOnly) {
      return { state: "found", stageFiles, stacks: [] };
    }

    const limited = limiter(BLOB_REQUEST_LIMIT);
    /** The state in a file without its secret values. */
    const state = async (sha: string) =>
      await limited(async () => {
        const text = await githubData(
          "git blob",
          async () =>
            await octokit.request("GET /repos/{owner}/{repo}/git/blobs/{file_sha}", {
              owner,
              repo,
              file_sha: sha,
              headers: { accept: "application/vnd.github.raw+json" },
            }),
        );
        if (!validate(vRawBlob, text)) {
          throw new StoreReadFailure("git blob: unexpected reply");
        }
        try {
          return parseWithoutSecretValues(text);
        } catch {
          throw new StoreReadFailure("git blob: not JSON");
        }
      });

    const stages = await Promise.all(
      folders.map(async (folder) => {
        const output = folder.output === null ? null : JSON.stringify(await state(folder.output));
        const deployed = readDeployedStacks(
          [{ name: folder.stack, stages: [{ name: folder.stage, resources: [], output }] }],
          repository,
          "github",
        )
          .at(0)
          ?.stages.at(0);
        if (!deployed) {
          return null;
        }
        const resources = await Promise.all(
          folder.resources.map(async (sha) => {
            const value = await state(sha);
            if (!validate(vResourceState, value, { allowUnknownFields: true })) {
              throw new StoreReadFailure("git blob: no fqn");
            }
            return { fqn: value.fqn, value: JSON.stringify(value) };
          }),
        );
        resources.sort((left, right) => left.fqn.localeCompare(right.fqn));
        return { stack: folder.stack, stage: { ...deployed, resources } };
      }),
    );

    const stacks: AlchemyStack[] = [];
    for (const stage of stages) {
      if (stage === null) {
        continue;
      }
      const last = stacks.at(-1);
      if (last?.name === stage.stack) {
        last.stages.push(stage.stage);
      } else {
        stacks.push({ name: stage.stack, store: "github", stages: [stage.stage] });
      }
    }
    return { state: "found", stageFiles, stacks };
  } catch (error) {
    // Only a message of this file or the name: a GitHub error can quote a body.
    console.warn("github_state_store:read_failed", {
      message: error instanceof StoreReadFailure ? error.message : null,
      name: error instanceof Error ? error.name : "unknown",
    });
    return { state: "failed" };
  }
}

/**
The stacks of a repository on its branch `alchemy-state-store`, read with the GitHub App
installation of its organization. It checks the user's access to the repository and needs no
Convex connection. Access that Samebase cannot get fails the read.
*/
export async function readRepositoryGitHubStacks(
  ctx: Pick<ActionCtx, "runMutation" | "runQuery">,
  args: { repositoryId: Id<"repositories">; userId: Id<"users">; treeOnly: boolean },
): Promise<GitHubStoreRead> {
  const { githubRepositoryFullName } = await ctx.runQuery(
    internal.repository.cloudflareStateStore.readTarget,
    { repositoryId: args.repositoryId, userId: args.userId },
  );
  let octokit: Octokit;
  try {
    ({ octokit } = await resolveGitHubAppAccess(ctx, {
      userId: args.userId,
      target: { kind: "repository", repositoryId: args.repositoryId },
    }));
  } catch (error) {
    console.warn("github_state_store:access_failed", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return { state: "failed" };
  }
  return await readGitHubStateStore({
    octokit,
    repository: githubRepositoryFullName,
    treeOnly: args.treeOnly,
  });
}

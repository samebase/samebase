import { v, type Infer } from "convex/values";

import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";
import { vAlchemySetupStatus } from "../../../shared/alchemyStateModel";
import { vRepositoryPullRequestPage } from "../pullRequestModel";
import { MCP_REPOSITORY_INPUT_DESCRIPTION, mcpRepositoryArgs } from "./repositoryReference";
import { retryInfrastructureProvisioningContract } from "./retryInfrastructureProvisioning";

const { array, boolean, id, literal, number, object, string, union } = v;

/** The status read lists at most this many open pull requests, most recently updated first. */
export const REPOSITORY_STATUS_PULL_REQUEST_LIMIT = 6;

/**
One problem that the status read found. `tool` names the Samebase tool that fixes it, and is null
when no Samebase tool does; `problem` then says what to do.
*/
const vRepositoryAttentionItem = union(
  object({
    tool: literal(retryInfrastructureProvisioningContract.mcp.name),
    problem: string(),
  }),
  object({
    tool: v.null(),
    problem: string(),
  }),
);

/**
The setup status of a repository that its GitHub Actions set up; null for any other.

unavailable = the team's Alchemy state store could not be read, like the other live facts here
*/
const vRepositoryStatusSetupStack = union(
  ...vAlchemySetupStatus.members,
  object({ state: literal("unavailable") }),
  v.null(),
);

/**
The commit of the last completed production deploy of a stack against the default branch head.

matches_head = the deploy is of the current head commit.

behind_head = the deploy is of another commit, so the latest push is not deployed yet.

unknown = the head could not be read, or the stack has no completed production deploy.
*/
const vStackDeployedCommitState = union(
  literal("matches_head"),
  literal("behind_head"),
  literal("unknown"),
);

/**
A stack of the repository in the team's Alchemy state store. The URLs are where the stack serves,
null when it has no stage or no URL. A commit is the one of the last completed deploy of the stage,
null before one finished. Previews are the stages `pr-<number>` in pull request order.
*/
const vRepositoryStatusStack = object({
  name: string(),
  productionUrl: union(string(), v.null()),
  deployedCommit: union(string(), v.null()),
  deployedCommitState: vStackDeployedCommitState,
  previews: array(
    object({
      pullRequestNumber: number(),
      url: union(string(), v.null()),
      deployedCommit: union(string(), v.null()),
    }),
  ),
});

/**
What the team's Alchemy state store says about the repository.

available = the store was read. An empty list means that it holds no stack of the repository.

no_store = the Convex team has no store yet.

no_convex_connection = the organization has no Convex connection to read the store with.

unreadable = the read failed, so this says nothing about what is deployed.
*/
const vRepositoryStatusStacks = union(
  object({ state: literal("available"), stacks: array(vRepositoryStatusStack) }),
  object({ state: literal("no_store") }),
  object({ state: literal("no_convex_connection") }),
  object({ state: literal("unreadable") }),
);

/** The dashboard result: the GitHub read of the overview and the stacks of the team's store. */
const vRepositoryStatus = object({
  pullRequests: union(
    object({ state: literal("available"), page: vRepositoryPullRequestPage }),
    object({ state: literal("unavailable") }),
  ),
  stacks: vRepositoryStatusStacks,
  setupStack: vRepositoryStatusSetupStack,
  attention: array(vRepositoryAttentionItem),
});

/**
The checks of one commit, null when it has none. The counts come from GitHub's aggregate counts, so
they cover every check. GitHub lists only the first 100 checks, so failedNames can miss a failure;
failedNamesComplete is false when it names fewer checks than `failed` counts.
*/
const vMcpChecks = union(
  v.null(),
  object({
    total: number(),
    failed: number(),
    pending: number(),
    unknown: number(),
    failedNames: array(string()),
    failedNamesComplete: boolean(),
  }),
);

/** The MCP result: no labels, line counts, node IDs, or head SHAs of GitHub. */
const vMcpRepositoryStatus = object({
  repository: string(),
  defaultBranch: union(
    v.null(),
    object({
      name: string(),
      headCommitTitle: string(),
      headCommitUrl: string(),
      checks: vMcpChecks,
    }),
  ),
  openPullRequestCount: union(number(), v.null()),
  stacks: vRepositoryStatusStacks,
  pullRequests: array(
    object({
      number: number(),
      title: string(),
      url: string(),
      isDraft: boolean(),
      headRefName: string(),
      checks: vMcpChecks,
    }),
  ),
  setupStack: vRepositoryStatusSetupStack,
  attention: array(vRepositoryAttentionItem),
});

export const getRepositoryStatusContract = {
  id: "get_repository_status",
  access: "access_dashboard",
  args: {
    repositoryId: id("repositories"),
  },
  mcpArgs: mcpRepositoryArgs,
  returns: vRepositoryStatus,
  structuredContent: vMcpRepositoryStatus,
  mcp: {
    title: "Get repository status",
    name: "repository_getStatus",
    description:
      "Read the live status of a repository: each stack in the team's Alchemy state store with its production URL, deployed commit, whether that commit is the default branch head, and its pull request preview URLs, the default branch head commit and its checks, the open pull requests (first 6) with their checks, for a repository that its GitHub Actions set up whether its first deployment finished, and attention items that say what to do about each problem. A store that cannot be read reports as unreadable, not as nothing deployed.",
    safety: "read_only",
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      repository: MCP_REPOSITORY_INPUT_DESCRIPTION,
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Reads the repository's current state live from GitHub and from the team's Alchemy state
store: the facts that the repository overview shows. It changes nothing.

- Stacks: \`stacks.state\` says what the store gave. \`available\` lists each stack of the repository
  with its production URL, the commit of its last completed production deploy, and its previews,
  one for each \`pr-<number>\` stage with its URL and deployed commit. \`deployedCommitState\`
  compares the deployed commit with the default branch head: \`matches_head\`, \`behind_head\` (the
  latest push is not deployed yet), or \`unknown\` when either commit cannot be read. An empty list
  means that the store holds no stack of the repository: Samebase cannot see such an app, and it may
  still be running. \`no_store\` means that the Convex team has no store yet,
  \`no_convex_connection\` that the organization has no Convex connection to read it with, and
  \`unreadable\` that the read failed, which says nothing about what is deployed.
- Repository: the default branch head commit with its checks, the open pull request count, and the
  first 6 open pull requests, most recently updated first, with their checks.
- Setup stack, for a repository that its GitHub Actions set up (null for any other): \`state\` from
  the same store read. It is done when the \`prod\` stage of the stack named after the repository has
  an output, and in_progress before that. The store does not say whether a run failed, so
  in_progress can also mean that the first run stopped: the repository's GitHub Actions page shows
  the run. It is unavailable when the store cannot be read.
- Attention items: each names a problem and what to do about it. The provider setup state comes
  first. While Samebase setup runs, the only item says so. When it failed, the only item names
  \`repository_retryProviderSetup\`, the one tool that fixes a problem. Samebase repairs nothing
  else: repair lives in Alchemy and the agent. While the first deployment runs, an item says so and
  links the repository's GitHub Actions. After that, an item says when the store is unreadable, has
  no stack of the repository, does not exist yet, or has no Convex connection.

Checks give the total, failed, pending, and unknown counts of every check, and the names of the
failed checks among the first 100 that GitHub lists; \`failedNamesComplete\` is false when a
failed check is not named. GitHub facts that cannot be read are reported as null or empty rather
than failing the whole read, and they give no attention item. A completed deploy does not prove
that the app serves the expected content.`,
} as const;

export type RepositoryStatus = Infer<typeof getRepositoryStatusContract.returns>;
export type McpRepositoryStatus = Infer<typeof getRepositoryStatusContract.structuredContent>;
export type RepositoryAttentionItem = Infer<typeof vRepositoryAttentionItem>;

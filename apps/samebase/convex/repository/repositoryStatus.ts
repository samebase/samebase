import { readAlchemySetupStatus, stackCards } from "../../shared/alchemyState";
import type { AlchemyStateObservation } from "../../shared/alchemyStateModel";
import {
  getRepositoryStatusContract,
  type McpRepositoryStatus,
  type RepositoryAttentionItem,
  type RepositoryStatus,
} from "./contracts/getRepositoryStatus";
import {
  getUserRepositoriesContract,
  type ProviderSetupSummary,
  type UserRepositoryResult,
} from "./contracts/getUserRepositories";
import { retryInfrastructureProvisioningContract } from "./contracts/retryInfrastructureProvisioning";
import type { RepositoryActionsCiSecrets } from "./provisioningModel";
import { isSamebaseManagedProviderPlan } from "./provisioningPlan";
import { classifyRepositoryCheck, type RepositoryStatusCheckRollup } from "./pullRequestModel";
import { summarizeRepositoryChecks } from "../../shared/repositoryChecks";

/*
The pure parts of repository:getStatus: the status of the stacks, the attention rules, and the MCP
projection. The Node read in status.ts gathers the facts; this module decides what they mean and
what to do about them, so the rules have unit tests without provider requests.
*/

const LIST_TOOL = getUserRepositoriesContract.mcp.name;
const RETRY_PROVIDER_SETUP_TOOL = retryInfrastructureProvisioningContract.mcp.name;
const STATUS_TOOL = getRepositoryStatusContract.mcp.name;
const ALCHEMY_MOVE_GUIDE_URL = "https://samebase.com/docs/the-big-migration";

export type RepositoryStatusRepository = Pick<
  UserRepositoryResult,
  "githubRepositoryFullName" | "providerSetup" | "providerPlan"
>;
export type RepositoryObservations = Omit<RepositoryStatus, "attention">;

/** A read of the team's store. Null is a read that failed, which says nothing about the stacks. */
type RepositoryStoreRead = AlchemyStateObservation | null;

/** The URL of one stage of one stack, as the overview shows it. */
function readStageUrl(
  store: Extract<AlchemyStateObservation, { store: "found" }>,
  stack: (typeof store.stacks)[number],
  stage: string,
): string | null {
  const cards = stackCards({
    stacks: [stack],
    liveDeployments: store.liveDeployments,
    stage,
    headCommit: null,
  });
  return cards.at(0)?.address ?? null;
}

/** Only URLs and commits leave the store read: never a resource row, an output, or a key. */
export function buildRepositoryStacksStatus(args: {
  read: RepositoryStoreRead;
  /** The head of the default branch, null when GitHub cannot be read. */
  headCommit: string | null;
}): RepositoryStatus["stacks"] {
  const { read, headCommit } = args;
  switch (read?.store) {
    case undefined:
      return { state: "unreadable" };
    case "missing":
      return { state: "no_store" };
    case "no_connection":
      return { state: "no_convex_connection" };
    case "found":
      return {
        state: "available",
        stacks: read.stacks.map((stack) => {
          const deployedCommit =
            stack.stages.find((stage) => stage.name === "prod")?.deployedHeadCommit ?? null;
          return {
            name: stack.name,
            productionUrl: readStageUrl(read, stack, "prod"),
            deployedCommit,
            deployedCommitState:
              !deployedCommit || !headCommit
                ? ("unknown" as const)
                : deployedCommit === headCommit
                  ? ("matches_head" as const)
                  : ("behind_head" as const),
            previews: stack.stages
              .flatMap((stage) => {
                const pullRequest = /^pr-(\d+)$/.exec(stage.name)?.[1];
                return pullRequest === undefined
                  ? []
                  : [
                      {
                        pullRequestNumber: Number(pullRequest),
                        url: readStageUrl(read, stack, stage.name),
                        deployedCommit: stage.deployedHeadCommit,
                      },
                    ];
              })
              .sort((left, right) => left.pullRequestNumber - right.pullRequestNumber),
          };
        }),
      };
    default:
      read satisfies never;
      return { state: "unreadable" };
  }
}

/** The setup status of a repository that its GitHub Actions set up, from the same read. */
export function buildRepositorySetupStackStatus(args: {
  read: RepositoryStoreRead;
  repository: string;
}): NonNullable<RepositoryStatus["setupStack"]> {
  const { read, repository } = args;
  if (read === null || read.store === "no_connection") {
    return { state: "unavailable" };
  }
  return readAlchemySetupStatus(read.store === "found" ? read.stacks : [], repository);
}

function describeSetupProvider(
  provider: Extract<ProviderSetupSummary, { status: "running" | "failed" }>["provider"],
): string {
  switch (provider) {
    case "convex":
      return "Convex project";
    case "cloudflare":
      return "Cloudflare Worker";
    case "github":
      return "GitHub Actions secrets";
    default:
      provider satisfies never;
      return "provider";
  }
}

/**
The attention of a repository that its GitHub Actions set up, after Samebase's own setup finished:
the Actions secrets, then the deployment that the setup status waits for. A setup status that is
done or unreadable gives no item here.
*/
function buildRepositoryActionsAttention(args: {
  repository: RepositoryStatusRepository;
  ciSecrets: RepositoryActionsCiSecrets;
  setupStack: RepositoryStatus["setupStack"];
}): RepositoryAttentionItem[] {
  const repositoryFullName = args.repository.githubRepositoryFullName;
  switch (args.ciSecrets.state) {
    case "planned":
      return [
        {
          tool: null,
          problem: `The GitHub Actions secrets of ${repositoryFullName} are not written yet, so its deploy workflow cannot run.`,
        },
      ];
    case "written":
      return args.setupStack?.state === "in_progress"
        ? [
            {
              tool: null,
              problem: `The first deployment of ${repositoryFullName} is in progress in its GitHub Actions: https://github.com/${repositoryFullName}/actions. Call ${STATUS_TOOL} again when the run finishes.`,
            },
          ]
        : [];
    default:
      args.ciSecrets satisfies never;
      return [];
  }
}

/** What the store read leaves open about what is deployed, and where to go from there. */
function buildStacksAttention(args: {
  repository: RepositoryStatusRepository;
  stacks: RepositoryStatus["stacks"];
}): RepositoryAttentionItem[] {
  const repositoryFullName = args.repository.githubRepositoryFullName;
  const { stacks } = args;
  switch (stacks.state) {
    case "available":
      return stacks.stacks.length > 0
        ? []
        : [
            {
              tool: null,
              problem: `The team's Alchemy state store holds no stack for ${repositoryFullName}, so Samebase cannot see what is deployed. An app deployed another way keeps running. Move it to Alchemy to see it here: ${ALCHEMY_MOVE_GUIDE_URL}`,
            },
          ];
    case "no_store":
      return [
        {
          tool: null,
          problem: `The Convex team of ${repositoryFullName} has no Alchemy state store yet, so Samebase cannot see what is deployed. The first Alchemy deploy creates it: ${ALCHEMY_MOVE_GUIDE_URL}`,
        },
      ];
    case "no_convex_connection":
      return [
        {
          tool: null,
          problem: `Samebase has no Convex connection for ${repositoryFullName}, so it cannot read the team's Alchemy state store. Connect Convex in the organization's providers page in the dashboard.`,
        },
      ];
    case "unreadable":
      return [
        {
          tool: null,
          problem: `The team's Alchemy state store could not be read, so this status does not say what ${repositoryFullName} has deployed. Call ${STATUS_TOOL} again.`,
        },
      ];
    default:
      stacks satisfies never;
      return [];
  }
}

/**
The attention items of one repository. The provider setup state comes first: a running setup can
still change what the other items report, and a failed one is repaired only by its retry. While the
first deployment of a repository runs, that item explains why the store has no stack yet.
*/
export function buildRepositoryAttention(args: {
  repository: RepositoryStatusRepository;
  observations: RepositoryObservations;
}): RepositoryAttentionItem[] {
  const { repository, observations } = args;
  const { providerSetup } = repository;
  switch (providerSetup.status) {
    case "running":
      return [
        {
          tool: null,
          problem: `Samebase setup of the ${describeSetupProvider(providerSetup.provider)} is running. Call ${STATUS_TOOL} again when ${LIST_TOOL} shows provider setup ready or failed.`,
        },
      ];
    case "failed":
      return [
        {
          tool: RETRY_PROVIDER_SETUP_TOOL,
          problem: `Samebase setup of the ${describeSetupProvider(providerSetup.provider)} failed.`,
        },
      ];
    case "ready":
    case "not_applicable":
      break;
    default:
      providerSetup satisfies never;
      return [];
  }

  const plan = repository.providerPlan;
  const setupItems =
    plan && !isSamebaseManagedProviderPlan(plan)
      ? buildRepositoryActionsAttention({
          repository,
          ciSecrets: plan.ciSecrets,
          setupStack: observations.setupStack,
        })
      : [];
  return [
    ...setupItems,
    ...(observations.setupStack?.state === "in_progress"
      ? []
      : buildStacksAttention({ repository, stacks: observations.stacks })),
  ];
}

/**
The counts of every check from GitHub's aggregate counts, and the names of the failed checks among
the listed nodes. Null when the commit has no checks.
*/
function summarizeChecksForMcp(rollup: RepositoryStatusCheckRollup) {
  if (rollup === null || rollup.contexts.totalCount === 0) {
    return null;
  }
  const summary = summarizeRepositoryChecks(rollup);
  const failedNames = rollup.contexts.nodes
    .filter((check) => classifyRepositoryCheck(check) === "failure")
    .map((check) => (check.kind === "check_run" ? check.name : check.context))
    .sort((left, right) => left.localeCompare(right));
  return {
    total: summary.totalCount,
    failed: summary.failureCount,
    pending: summary.runningCount,
    unknown: summary.unknownCount,
    failedNames,
    failedNamesComplete: failedNames.length >= summary.failureCount,
  };
}

/**
The MCP result: what the overview shows, without labels, line counts, node IDs, or GitHub head SHAs.
Checks give counts and failed check names, not the full check list.
*/
export function projectRepositoryStatusForMcp(args: {
  repository: RepositoryStatusRepository;
  status: RepositoryStatus;
}): McpRepositoryStatus {
  const { repository, status } = args;
  const page = status.pullRequests.state === "available" ? status.pullRequests.page : null;
  const githubRepository = page?.repository ?? null;
  const defaultBranch = githubRepository?.defaultBranch ?? null;

  return {
    repository: repository.githubRepositoryFullName,
    defaultBranch: defaultBranch && {
      name: defaultBranch.name,
      headCommitTitle: defaultBranch.headCommitTitle,
      headCommitUrl: defaultBranch.headCommitUrl,
      checks: summarizeChecksForMcp(defaultBranch.statusCheckRollup),
    },
    openPullRequestCount: githubRepository?.pullRequests.totalCount ?? null,
    stacks: status.stacks,
    pullRequests: (githubRepository?.pullRequests.nodes ?? []).map((pullRequest) => ({
      number: pullRequest.number,
      title: pullRequest.title,
      url: pullRequest.url,
      isDraft: pullRequest.isDraft,
      headRefName: pullRequest.headRefName,
      checks: summarizeChecksForMcp(pullRequest.statusCheckRollup),
    })),
    setupStack: status.setupStack,
    attention: status.attention,
  };
}

import {
  requestCloudflareApi,
  CloudflareApiError,
} from "./cloudflareApi/client";
import type { components, Readable } from "./cloudflareApi/types.generated";
import { clamp, toErrorMessage } from "./jsonUtils";

export {
  CloudflareApiError,
  isWorkersBuildsInvalidTokenMessage,
} from "./cloudflareApi/client";

type CloudflareProvisionConvexState = {
  production: {
    cloudUrl: string;
    deployKey: string;
  };
  preview: {
    cloudUrl: string;
    deployKey: string;
  };
};

type CloudflareBuildConfig = {
  rootDir: string;
  buildCommand: string;
  deployCommand: string;
  previewDeployCommand: string;
};

type CloudflareWorker = Readable<components["schemas"]["workers_Worker"]>;
type CloudflareWorkerTagSource = {
  id?: string;
  external_script_id?: string;
  tag?: string;
  name?: string;
};
type CloudflareBuildTokenRecord = Readable<
  components["schemas"]["builds_ListTokensResponse"]
>;
type CloudflareBuildTrigger = Readable<
  components["schemas"]["builds_TriggerResponse"]
>;
type CloudflareBuildEnvVars =
  components["schemas"]["builds_EnvironmentVariablesRequest"];

export type CloudflareBuildToken = {
  name: string;
  uuid: string;
  cloudflareTokenId: string;
};

const NOTER_WORKERS_BUILD_TOKEN_NAME = "noter build token";
const WORKERS_BUILDS_TOKEN_REQUIRED_MESSAGE = `Cloudflare Workers Builds has no build API token. In Cloudflare, create a Workers Builds API token named "${NOTER_WORKERS_BUILD_TOKEN_NAME}", then retry.`;
const BUILD_TOKEN_PAGE_SIZE = 100;
const PROD_CONVEX_DEPLOY_KEY = "PROD_CONVEX_DEPLOY_KEY";
const PREVIEW_CONVEX_DEPLOY_KEY = "PREVIEW_CONVEX_DEPLOY_KEY";

type CloudflareConvexDeployKeyName =
  | typeof PROD_CONVEX_DEPLOY_KEY
  | typeof PREVIEW_CONVEX_DEPLOY_KEY;

export function isCloudflareWorkerNotFoundError(error: unknown): boolean {
  if (error instanceof CloudflareApiError) {
    return error.details.some((detail) => {
      const message = detail.message?.toLowerCase();
      return (
        message === "worker not found" ||
        message === "trigger not found" ||
        message === "script not found" ||
        message === "not found" ||
        message === "workers.api.error.not_found" ||
        (detail.code === "10007" &&
          message?.includes("worker") === true &&
          message.includes("does not exist"))
      );
    });
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("10007") &&
      (message.includes("worker") || message.includes("script")) &&
      (message.includes("does not exist") || message.includes("not found"))
    );
  }

  return false;
}

function requireCloudflareResult<T>(value: T | undefined, message: string): T {
  if (value !== undefined) {
    return value;
  }
  throw new Error(message);
}

function requireCloudflareString(
  value: string | null | undefined,
  message: string,
): string {
  if (value) {
    return value;
  }
  throw new Error(message);
}

export function buildCloudflareWorkersEnvVars(vars: {
  deployKeyName: CloudflareConvexDeployKeyName;
  convexDeployKey: string;
  convexUrl: string;
}): CloudflareBuildEnvVars {
  return {
    [vars.deployKeyName]: {
      value: vars.convexDeployKey,
      is_secret: true,
    },
    VITE_CONVEX_URL: {
      value: vars.convexUrl,
      is_secret: false,
    },
  };
}

type CloudflareWorkerIdentity = {
  workerName: string;
  workerTag: string;
  productionUrl: string;
};

export type ExistingCloudflareWorkerIdentity =
  | { state: "planned" }
  | { state: "created"; workerTag: string };

async function readAccountSubdomain(args: {
  token: string;
  accountId: string;
}): Promise<string> {
  const raw = await requestCloudflareApi({
    token: args.token,
    method: "GET",
    path: "/accounts/{account_id}/workers/subdomain",
    params: {
      path: {
        account_id: args.accountId,
      },
    },
  });
  const subdomain = raw?.subdomain.trim();
  if (!subdomain) {
    throw new Error(
      "Cloudflare Workers needs a configured workers.dev subdomain before Noter can create a production URL.",
    );
  }
  return subdomain;
}

async function readWorker(args: {
  token: string;
  accountId: string;
  workerName: string;
}): Promise<CloudflareWorker | null> {
  try {
    const raw = await requestCloudflareApi({
      token: args.token,
      method: "GET",
      path: "/accounts/{account_id}/workers/workers/{worker_id}",
      params: {
        path: {
          account_id: args.accountId,
          worker_id: args.workerName,
        },
      },
    });
    return requireCloudflareResult(
      raw,
      `Cloudflare Worker ${args.workerName} response did not include a Worker.`,
    );
  } catch (error) {
    if (isCloudflareWorkerNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function isCloudflareWorkerNameAvailable(args: {
  token: string;
  accountId: string;
  workerName: string;
}): Promise<boolean> {
  const worker = await readWorker(args);
  return !worker;
}

export function readCloudflareWorkerTag(
  worker: CloudflareWorkerTagSource,
  workerName: string,
): string {
  // New Workers services do not appear in /workers/scripts until they have a
  // script version, but the Workers service id is the same external_script_id
  // that Workers Builds calls the worker tag.
  const workerTag = worker.id ?? worker.external_script_id ?? worker.tag;
  if (workerTag) {
    return workerTag;
  }
  throw new Error(
    `Cloudflare Worker ${workerName} did not include id, external_script_id, or tag.`,
  );
}

async function ensureWorker(args: {
  token: string;
  accountId: string;
  workerName: string;
  existingWorker: ExistingCloudflareWorkerIdentity;
}): Promise<CloudflareWorkerIdentity> {
  const accountSubdomain = await readAccountSubdomain(args);
  const existing = await readWorker({
    token: args.token,
    accountId: args.accountId,
    workerName: args.workerName,
  });
  if (existing) {
    const workerTag = readCloudflareWorkerTag(existing, args.workerName);
    if (
      args.existingWorker.state === "created" &&
      args.existingWorker.workerTag !== workerTag
    ) {
      throw new Error(
        `Cloudflare Worker name ${args.workerName} already exists. Choose another Worker name and try again.`,
      );
    }
    // The planned target owns the Worker name before provider writes. If the
    // previous run created the Worker but failed before recording its tag, retry
    // uses Cloudflare's identity as the missing checkpoint.
    return {
      workerName: args.workerName,
      workerTag,
      productionUrl: `https://${args.workerName}.${accountSubdomain}.workers.dev`,
    };
  }

  const createdRaw = await requestCloudflareApi({
    token: args.token,
    method: "POST",
    path: "/accounts/{account_id}/workers/workers",
    params: {
      path: {
        account_id: args.accountId,
      },
    },
    body: {
      name: args.workerName,
      logpush: false,
      subdomain: {
        enabled: true,
        previews_enabled: true,
      },
      observability: {
        enabled: true,
        head_sampling_rate: 1,
      },
      tags: [],
      tail_consumers: [],
    },
  });
  const created = requireCloudflareResult(
    createdRaw,
    `Cloudflare Worker ${args.workerName} response did not include the created Worker.`,
  );
  const workerTag = readCloudflareWorkerTag(created, args.workerName);
  return {
    workerName: args.workerName,
    workerTag,
    productionUrl: `https://${args.workerName}.${accountSubdomain}.workers.dev`,
  };
}

async function ensureRepositoryConnection(args: {
  token: string;
  accountId: string;
  ghRepoId: string;
  ghRepoOwnerId: string;
  owner: string;
  repo: string;
}): Promise<string> {
  const raw = await requestCloudflareApi({
    token: args.token,
    method: "PUT",
    path: "/accounts/{account_id}/builds/repos/connections",
    params: {
      path: {
        account_id: args.accountId,
      },
    },
    body: {
      provider_type: "github",
      provider_account_id: args.ghRepoOwnerId,
      provider_account_name: args.owner,
      repo_id: args.ghRepoId,
      repo_name: args.repo,
    },
  });
  return requireCloudflareString(
    raw?.repo_connection_uuid,
    "Cloudflare Workers Builds repository connection did not return an id.",
  );
}

async function resolveBuildTokenUuid(args: {
  token: string;
  accountId: string;
  existingTriggers: readonly CloudflareBuildTrigger[];
  authMethod: CloudflareAuthMethod;
}): Promise<string> {
  if (args.authMethod === "mcp_oauth") {
    // Cloudflare MCP OAuth tokens can manage Builds resources, but they are not
    // API tokens, so /user/tokens/verify rejects them. Reuse an existing build
    // token instead of trying to prove the OAuth token's token id.
    return await resolveOAuthBuildTokenUuid({
      token: args.token,
      accountId: args.accountId,
      existingTriggers: args.existingTriggers,
    });
  }

  const currentTokenId = await resolveCurrentCloudflareTokenId({
    token: args.token,
  });
  const existingBuildTokenUuid = await findCurrentBuildTokenUuid({
    token: args.token,
    accountId: args.accountId,
    cloudflareTokenId: currentTokenId,
    preferredBuildTokenUuids: readTriggerBuildTokenUuids(args.existingTriggers),
  });
  if (existingBuildTokenUuid) {
    return existingBuildTokenUuid;
  }
  return await createBuildToken({
    token: args.token,
    accountId: args.accountId,
    cloudflareTokenId: currentTokenId,
  });
}

async function resolveOAuthBuildTokenUuid(args: {
  token: string;
  accountId: string;
  existingTriggers: readonly CloudflareBuildTrigger[];
}): Promise<string> {
  const existingBuildTokenUuid = await findReusableBuildTokenUuid({
    token: args.token,
    accountId: args.accountId,
    preferredBuildTokenUuids: readTriggerBuildTokenUuids(args.existingTriggers),
  });
  if (existingBuildTokenUuid) {
    return existingBuildTokenUuid;
  }

  throw new Error(WORKERS_BUILDS_TOKEN_REQUIRED_MESSAGE);
}

async function findCurrentBuildTokenUuid(args: {
  token: string;
  accountId: string;
  cloudflareTokenId: string;
  preferredBuildTokenUuids: readonly string[];
}): Promise<string | undefined> {
  const tokens: CloudflareBuildToken[] = [];
  for (let page = 1; ; page += 1) {
    const rawTokens = await requestCloudflareApi({
      token: args.token,
      method: "GET",
      path: "/accounts/{account_id}/builds/tokens",
      params: {
        path: {
          account_id: args.accountId,
        },
        query: {
          page,
          per_page: BUILD_TOKEN_PAGE_SIZE,
        },
      },
    });
    const tokensPage = rawTokens ?? [];
    tokens.push(...parseBuildTokens(tokensPage));
    if (tokensPage.length < BUILD_TOKEN_PAGE_SIZE) {
      return selectCurrentBuildTokenUuid({
        tokens,
        cloudflareTokenId: args.cloudflareTokenId,
        preferredBuildTokenUuids: args.preferredBuildTokenUuids,
      });
    }
  }
}

async function findReusableBuildTokenUuid(args: {
  token: string;
  accountId: string;
  preferredBuildTokenUuids: readonly string[];
}): Promise<string | undefined> {
  const tokens: CloudflareBuildToken[] = [];
  for (let page = 1; ; page += 1) {
    const rawTokens = await requestCloudflareApi({
      token: args.token,
      method: "GET",
      path: "/accounts/{account_id}/builds/tokens",
      params: {
        path: {
          account_id: args.accountId,
        },
        query: {
          page,
          per_page: BUILD_TOKEN_PAGE_SIZE,
        },
      },
    });
    const tokensPage = rawTokens ?? [];
    tokens.push(...parseBuildTokens(tokensPage));
    if (tokensPage.length < BUILD_TOKEN_PAGE_SIZE) {
      return selectReusableBuildTokenUuid({
        tokens,
        preferredBuildTokenUuids: args.preferredBuildTokenUuids,
      });
    }
  }
}

function parseBuildTokens(
  tokenRecords: readonly CloudflareBuildTokenRecord[],
): CloudflareBuildToken[] {
  const tokens: CloudflareBuildToken[] = [];
  for (const tokenRecord of tokenRecords) {
    const uuid = tokenRecord.build_token_uuid;
    const cloudflareTokenId = tokenRecord.cloudflare_token_id;
    if (!uuid || !cloudflareTokenId) {
      continue;
    }
    tokens.push({
      name: tokenRecord.build_token_name ?? "",
      uuid,
      cloudflareTokenId,
    });
  }
  return tokens.sort(compareBuildTokens);
}

function compareBuildTokens(
  left: CloudflareBuildToken,
  right: CloudflareBuildToken,
): number {
  return (
    left.name.localeCompare(right.name) || left.uuid.localeCompare(right.uuid)
  );
}

function selectStableBuildTokenUuid(
  tokens: readonly CloudflareBuildToken[],
): string | undefined {
  if (tokens.length === 0) {
    return undefined;
  }
  return [...tokens].sort(compareBuildTokens)[0].uuid;
}

export function selectReusableBuildTokenUuid(args: {
  tokens: readonly CloudflareBuildToken[];
  preferredBuildTokenUuids?: readonly string[];
}): string | undefined {
  if (args.tokens.length === 0) {
    return undefined;
  }

  const preferredBuildTokenUuids = new Set(args.preferredBuildTokenUuids);
  const preferredTokens = args.tokens.filter((token) =>
    preferredBuildTokenUuids.has(token.uuid),
  );
  const preferredTokenUuid = selectStableBuildTokenUuid(preferredTokens);
  if (preferredTokenUuid) {
    return preferredTokenUuid;
  }

  const namedTokens = args.tokens.filter(
    (token) => token.name === NOTER_WORKERS_BUILD_TOKEN_NAME,
  );
  const namedTokenUuid = selectStableBuildTokenUuid(namedTokens);
  if (namedTokenUuid) {
    // Failed retries can leave duplicate Noter-named tokens. Cloudflare's list
    // response has no creation time, so choose by stable UUID order and let the
    // trigger upserts bind both triggers to the same token.
    return namedTokenUuid;
  }

  if (args.tokens.length === 1) {
    return selectStableBuildTokenUuid(args.tokens);
  }

  throw new Error(
    `Cloudflare has multiple Workers build tokens. Keep one token named "${NOTER_WORKERS_BUILD_TOKEN_NAME}" and retry.`,
  );
}

export function selectCurrentBuildTokenUuid(args: {
  tokens: readonly CloudflareBuildToken[];
  cloudflareTokenId: string;
  preferredBuildTokenUuids?: readonly string[];
}): string | undefined {
  const matchingTokens = args.tokens.filter(
    (token) => token.cloudflareTokenId === args.cloudflareTokenId,
  );
  if (matchingTokens.length === 0) {
    return undefined;
  }

  const preferredBuildTokenUuids = new Set(args.preferredBuildTokenUuids);
  const preferredTokens = matchingTokens.filter((token) =>
    preferredBuildTokenUuids.has(token.uuid),
  );
  const preferredTokenUuid = selectStableBuildTokenUuid(preferredTokens);
  if (preferredTokenUuid) {
    return preferredTokenUuid;
  }

  const namedTokens = matchingTokens.filter(
    (token) => token.name === NOTER_WORKERS_BUILD_TOKEN_NAME,
  );
  const namedTokenUuid = selectStableBuildTokenUuid(namedTokens);
  if (namedTokenUuid) {
    return namedTokenUuid;
  }

  return selectStableBuildTokenUuid(matchingTokens);
}

function readTriggerBuildTokenUuids(
  triggers: readonly CloudflareBuildTrigger[],
): readonly string[] {
  const uuids: string[] = [];
  for (const trigger of triggers) {
    if (trigger.build_token_uuid) {
      uuids.push(trigger.build_token_uuid);
    }
  }
  return uuids;
}

async function resolveCurrentCloudflareTokenId(args: {
  token: string;
}): Promise<string> {
  const raw = await requestCloudflareApi({
    token: args.token,
    method: "GET",
    path: "/user/tokens/verify",
  });
  return requireCloudflareString(
    raw?.id,
    "Cloudflare did not return an id for the current token, so Workers Builds cannot create a build token.",
  );
}

async function createBuildToken(args: {
  token: string;
  accountId: string;
  cloudflareTokenId: string;
}): Promise<string> {
  const raw = await requestCloudflareApi({
    token: args.token,
    method: "POST",
    path: "/accounts/{account_id}/builds/tokens",
    params: {
      path: {
        account_id: args.accountId,
      },
    },
    body: {
      build_token_name: NOTER_WORKERS_BUILD_TOKEN_NAME,
      build_token_secret: args.token,
      cloudflare_token_id: args.cloudflareTokenId,
    },
  });
  return requireCloudflareString(
    raw?.build_token_uuid,
    "Cloudflare Workers Builds did not return an id for the created build token.",
  );
}

type CloudflareBuildTriggerKind = "production" | "preview";

function matchesTriggerKind(args: {
  trigger: CloudflareBuildTrigger;
  kind: CloudflareBuildTriggerKind;
  defaultBranch: string;
}): boolean {
  const branchIncludes = args.trigger.branch_includes ?? [];
  const branchExcludes = args.trigger.branch_excludes ?? [];
  if (args.kind === "production") {
    return (
      branchIncludes.length === 1 &&
      branchIncludes[0] === args.defaultBranch &&
      branchExcludes.length === 0
    );
  }

  return (
    branchIncludes.includes("*") && branchExcludes.includes(args.defaultBranch)
  );
}

async function listBuildTriggers(args: {
  token: string;
  accountId: string;
  workerTag: string;
}): Promise<CloudflareBuildTrigger[]> {
  const raw = await requestCloudflareApi({
    token: args.token,
    method: "GET",
    path: "/accounts/{account_id}/builds/workers/{external_script_id}/triggers",
    params: {
      path: {
        account_id: args.accountId,
        external_script_id: args.workerTag,
      },
    },
  });
  return raw ?? [];
}

async function upsertBuildTrigger(args: {
  token: string;
  accountId: string;
  workerTag: string;
  repoConnectionUuid: string;
  buildTokenUuid: string;
  buildConfig: CloudflareBuildConfig;
  defaultBranch: string;
  existingTriggers: readonly CloudflareBuildTrigger[];
  kind: CloudflareBuildTriggerKind;
}): Promise<string> {
  const existingTrigger = args.existingTriggers.find((trigger) =>
    matchesTriggerKind({
      trigger,
      kind: args.kind,
      defaultBranch: args.defaultBranch,
    }),
  );
  const triggerName =
    args.kind === "production" ? "Production Deploy" : "Preview Deploy";
  const triggerConfig = {
    build_token_uuid: args.buildTokenUuid,
    trigger_name: triggerName,
    build_command: args.buildConfig.buildCommand,
    deploy_command:
      args.kind === "production"
        ? args.buildConfig.deployCommand
        : args.buildConfig.previewDeployCommand,
    root_directory: args.buildConfig.rootDir,
    branch_includes: args.kind === "production" ? [args.defaultBranch] : ["*"],
    branch_excludes: args.kind === "production" ? [] : [args.defaultBranch],
    path_includes: ["*"],
    path_excludes: [],
  };

  const existingTriggerUuid = existingTrigger?.trigger_uuid;
  if (existingTriggerUuid) {
    const raw = await requestCloudflareApi({
      token: args.token,
      method: "PATCH",
      path: "/accounts/{account_id}/builds/triggers/{trigger_uuid}",
      params: {
        path: {
          account_id: args.accountId,
          trigger_uuid: existingTriggerUuid,
        },
      },
      body: triggerConfig,
    });
    return requireCloudflareString(
      raw?.trigger_uuid,
      `${triggerName} trigger did not return an id.`,
    );
  }

  const raw = await requestCloudflareApi({
    token: args.token,
    method: "POST",
    path: "/accounts/{account_id}/builds/triggers",
    params: {
      path: {
        account_id: args.accountId,
      },
    },
    body: {
      external_script_id: args.workerTag,
      repo_connection_uuid: args.repoConnectionUuid,
      ...triggerConfig,
    },
  });
  return requireCloudflareString(
    raw?.trigger_uuid,
    `${triggerName} trigger did not return an id.`,
  );
}

async function setTriggerEnvironmentVariables(args: {
  token: string;
  accountId: string;
  triggerUuid: string;
  envVars: CloudflareBuildEnvVars;
}): Promise<void> {
  await requestCloudflareApi({
    token: args.token,
    method: "PATCH",
    path: "/accounts/{account_id}/builds/triggers/{trigger_uuid}/environment_variables",
    params: {
      path: {
        account_id: args.accountId,
        trigger_uuid: args.triggerUuid,
      },
    },
    body: args.envVars,
  });
}

async function triggerInitialBuild(args: {
  token: string;
  accountId: string;
  triggerUuid: string;
  branch: string;
}): Promise<void> {
  await requestCloudflareApi({
    token: args.token,
    method: "POST",
    path: "/accounts/{account_id}/builds/triggers/{trigger_uuid}/builds",
    params: {
      path: {
        account_id: args.accountId,
        trigger_uuid: args.triggerUuid,
      },
    },
    body: {
      branch: args.branch,
    },
  });
}

export type ProvisionedCloudflareResources = {
  accountId: string;
  workerName: string;
  workerTag: string;
  productionUrl: string;
};

type EnsureCloudflareResourcesArgs = {
  owner: string;
  repo: string;
  ghRepoId: string;
  ghRepoOwnerId: string;
  defaultBranch: string;
  vaultId: string;
  workerName: string;
  cloudflareToken: string;
  cloudflareAuthMethod: CloudflareAuthMethod;
  accountId: string;
  buildConfig: CloudflareBuildConfig;
  existingWorker: ExistingCloudflareWorkerIdentity;
  convex: CloudflareProvisionConvexState;
  onWorkerResolved: (worker: CloudflareWorkerIdentity) => Promise<void>;
};

type CloudflareAuthMethod = "api_key" | "mcp_oauth";

export async function ensureCloudflareResources(
  args: EnsureCloudflareResourcesArgs,
): Promise<ProvisionedCloudflareResources> {
  let workerName = args.workerName;

  console.log("infra:cloudflare:provision:start", {
    vaultId: args.vaultId,
    accountId: args.accountId,
    workerName,
    repo: `${args.owner}/${args.repo}`,
    defaultBranch: args.defaultBranch,
  });

  let step = "resolve_worker";
  try {
    const worker = await ensureWorker({
      token: args.cloudflareToken,
      accountId: args.accountId,
      workerName: args.workerName,
      existingWorker: args.existingWorker,
    });
    workerName = worker.workerName;

    step = "record_worker_identity";
    await args.onWorkerResolved(worker);

    step = "connect_repository";
    const repoConnectionUuid = await ensureRepositoryConnection({
      token: args.cloudflareToken,
      accountId: args.accountId,
      ghRepoId: args.ghRepoId,
      ghRepoOwnerId: args.ghRepoOwnerId,
      owner: args.owner,
      repo: args.repo,
    });

    step = "list_triggers";
    const existingTriggers = await listBuildTriggers({
      token: args.cloudflareToken,
      accountId: args.accountId,
      workerTag: worker.workerTag,
    });

    step = "resolve_build_token";
    const buildTokenUuid = await resolveBuildTokenUuid({
      token: args.cloudflareToken,
      accountId: args.accountId,
      existingTriggers,
      authMethod: args.cloudflareAuthMethod,
    });

    step = "upsert_triggers";
    const productionTriggerUuid = await upsertBuildTrigger({
      token: args.cloudflareToken,
      accountId: args.accountId,
      workerTag: worker.workerTag,
      repoConnectionUuid,
      buildTokenUuid,
      buildConfig: args.buildConfig,
      defaultBranch: args.defaultBranch,
      existingTriggers,
      kind: "production",
    });
    const previewTriggerUuid = await upsertBuildTrigger({
      token: args.cloudflareToken,
      accountId: args.accountId,
      workerTag: worker.workerTag,
      repoConnectionUuid,
      buildTokenUuid,
      buildConfig: args.buildConfig,
      defaultBranch: args.defaultBranch,
      existingTriggers,
      kind: "preview",
    });

    step = "set_environment_variables";
    await Promise.all([
      setTriggerEnvironmentVariables({
        token: args.cloudflareToken,
        accountId: args.accountId,
        triggerUuid: productionTriggerUuid,
        envVars: buildCloudflareWorkersEnvVars({
          deployKeyName: PROD_CONVEX_DEPLOY_KEY,
          convexDeployKey: args.convex.production.deployKey,
          convexUrl: args.convex.production.cloudUrl,
        }),
      }),
      setTriggerEnvironmentVariables({
        token: args.cloudflareToken,
        accountId: args.accountId,
        triggerUuid: previewTriggerUuid,
        envVars: buildCloudflareWorkersEnvVars({
          deployKeyName: PREVIEW_CONVEX_DEPLOY_KEY,
          convexDeployKey: args.convex.preview.deployKey,
          convexUrl: args.convex.preview.cloudUrl,
        }),
      }),
    ]);

    step = "trigger_initial_build";
    await triggerInitialBuild({
      token: args.cloudflareToken,
      accountId: args.accountId,
      triggerUuid: productionTriggerUuid,
      branch: args.defaultBranch,
    });

    const result: ProvisionedCloudflareResources = {
      accountId: args.accountId,
      workerName: worker.workerName,
      workerTag: worker.workerTag,
      productionUrl: worker.productionUrl,
    };

    console.log("infra:cloudflare:provision:success", {
      vaultId: args.vaultId,
      accountId: result.accountId,
      workerName: result.workerName,
      workerTag: result.workerTag,
      productionUrl: result.productionUrl,
    });

    return result;
  } catch (error) {
    console.error("infra:cloudflare:provision:failed", {
      vaultId: args.vaultId,
      accountId: args.accountId,
      workerName,
      repo: `${args.owner}/${args.repo}`,
      step,
      message: toErrorMessage(error),
    });
    throw error;
  }
}

export type CloudflareStatusReadResult = {
  summary: string;
  endpoint: string;
  raw: string;
  rowCount: number;
};

export type CloudflareLogsReadResult = {
  summary: string;
  endpoint: string;
  raw: string;
  logLineCount: number;
};

type ReadCloudflareWorkerStatusArgs = {
  cloudflareToken: string;
  accountId: string;
  workerName: string;
  workerTag?: string;
};

export async function readCloudflareWorkerStatus(
  args: ReadCloudflareWorkerStatusArgs,
): Promise<CloudflareStatusReadResult> {
  const workerEndpoint = `/accounts/${encodeURIComponent(args.accountId)}/workers/workers/${encodeURIComponent(args.workerName)}`;
  const worker = await requestCloudflareApi({
    token: args.cloudflareToken,
    method: "GET",
    path: "/accounts/{account_id}/workers/workers/{worker_id}",
    params: {
      path: {
        account_id: args.accountId,
        worker_id: args.workerName,
      },
    },
  });
  const workerRecord = requireCloudflareResult(
    worker,
    `Cloudflare Worker ${args.workerName} response did not include a Worker.`,
  );
  const workerTag =
    args.workerTag ?? readCloudflareWorkerTag(workerRecord, args.workerName);
  const triggers = await listBuildTriggers({
    token: args.cloudflareToken,
    accountId: args.accountId,
    workerTag,
  });

  return {
    summary: `Cloudflare Worker status for ${args.workerName}`,
    endpoint: `${workerEndpoint} + Workers Builds triggers`,
    raw: JSON.stringify({ worker: workerRecord, triggers }, null, 2),
    rowCount: 1,
  };
}

type ReadCloudflareLogsArgs = {
  cloudflareToken: string;
  accountId: string;
  workerName: string;
  workerTag: string;
  maxEntries: number;
};

export async function readCloudflareBuildLogs(
  args: ReadCloudflareLogsArgs,
): Promise<CloudflareLogsReadResult> {
  const maxEntries = clamp(args.maxEntries, 1, 50);
  const buildsEndpoint = `/accounts/${encodeURIComponent(args.accountId)}/builds/workers/${encodeURIComponent(args.workerTag)}/builds`;
  const buildsPayload = await requestCloudflareApi({
    token: args.cloudflareToken,
    method: "GET",
    path: "/accounts/{account_id}/builds/workers/{external_script_id}/builds",
    params: {
      path: {
        account_id: args.accountId,
        external_script_id: args.workerTag,
      },
      query: {
        page: 1,
        per_page: maxEntries,
      },
    },
  });
  const builds = buildsPayload ?? [];
  const selectedBuilds = builds.slice(0, maxEntries);

  const logsByBuild = await Promise.all(
    selectedBuilds.map(async (build) => {
      const buildUuid = build.build_uuid;
      if (!buildUuid) {
        return {
          build,
          logs: { error: "Build UUID missing from Cloudflare response" },
        };
      }

      const logsEndpoint = `/accounts/${encodeURIComponent(args.accountId)}/builds/builds/${encodeURIComponent(buildUuid)}/logs`;
      const logsPayload = await requestCloudflareApi({
        token: args.cloudflareToken,
        method: "GET",
        path: "/accounts/{account_id}/builds/builds/{build_uuid}/logs",
        params: {
          path: {
            account_id: args.accountId,
            build_uuid: buildUuid,
          },
        },
      });

      return {
        endpoint: logsEndpoint,
        buildUuid,
        build,
        logs: logsPayload,
      };
    }),
  );

  return {
    summary: `Cloudflare build logs for Worker ${args.workerName}`,
    endpoint: `${buildsEndpoint} + build logs`,
    raw:
      logsByBuild.length > 0
        ? JSON.stringify(logsByBuild, null, 2)
        : "No build entries returned.",
    logLineCount: logsByBuild.length,
  };
}

type DeleteCloudflareResourcesArgs = {
  accountId: string;
  workerName: string;
  workerTag: string;
  cloudflareToken: string;
};

async function deleteCloudflareBuildTrigger(args: {
  accountId: string;
  triggerUuid: string;
  cloudflareToken: string;
}): Promise<void> {
  try {
    await requestCloudflareApi({
      token: args.cloudflareToken,
      method: "DELETE",
      path: "/accounts/{account_id}/builds/triggers/{trigger_uuid}",
      params: {
        path: {
          account_id: args.accountId,
          trigger_uuid: args.triggerUuid,
        },
      },
    });
  } catch (error) {
    if (!isCloudflareWorkerNotFoundError(error)) {
      throw error;
    }
  }
}

export async function deleteCloudflareResources(
  args: DeleteCloudflareResourcesArgs,
): Promise<void> {
  const triggers = await listBuildTriggers({
    token: args.cloudflareToken,
    accountId: args.accountId,
    workerTag: args.workerTag,
  }).catch((error: unknown) => {
    if (isCloudflareWorkerNotFoundError(error)) {
      return [];
    }
    throw error;
  });
  await Promise.all(
    triggers.map(async (trigger) => {
      const triggerUuid = trigger.trigger_uuid;
      if (!triggerUuid) {
        return;
      }
      await deleteCloudflareBuildTrigger({
        accountId: args.accountId,
        triggerUuid,
        cloudflareToken: args.cloudflareToken,
      });
    }),
  );
  await requestCloudflareApi({
    token: args.cloudflareToken,
    method: "DELETE",
    path: "/accounts/{account_id}/workers/workers/{worker_id}",
    params: {
      path: {
        account_id: args.accountId,
        worker_id: args.workerName,
      },
    },
  });
}

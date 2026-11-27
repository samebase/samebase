import { parse, validate } from "convex-helpers/validators";
import { ConvexError, Infer, v } from "convex/values";
import {
  parseWithoutSecretValues,
  readAlchemySetupStatus,
  readDeployedStacks,
  vAlchemyConvexDeploymentState,
  vAlchemyConvexProjectState,
  type AlchemyRepository,
} from "../../shared/alchemyState";
import {
  ALCHEMY_CONNECTION_UNAVAILABLE,
  CLOUDFLARE_STORE_UNREADABLE,
  CONNECT_CONVEX_TO_CHECK_STACK,
  DESTROY_ALCHEMY_STACK_FIRST,
  GITHUB_STORE_UNREADABLE,
  RECONNECT_CLOUDFLARE_TO_CHECK_STACK,
  vAlchemyNoConnection,
  vAlchemyLiveDeployments,
  vAlchemyRepositoryReply,
  vAlchemySetupStatus,
  vAlchemyStacksRead,
  vAlchemyStoredStage,
  vCloudflareStacksRead,
  vGitHubStacksRead,
  vOtherNameStacksRead,
  type AlchemySetupStatus,
  type AlchemyStack,
  type AlchemyStacksRead,
  type AlchemyStateObservation,
  type AlchemyStoredStage,
  type CloudflareStacksRead,
  type GitHubStacksRead,
  type OtherNameStacksRead,
} from "../../shared/alchemyStateModel";
import type { Id } from "../_generated/dataModel";
import { env, type ActionCtx } from "../_generated/server";
import * as management from "@distilled.cloud/convex/management";
import { parseConvexDeploymentRegion } from "../../shared/convexDeploymentRegions";

import { listConvexManagementProjects, runConvexManagement } from "../convexManagementApi";
import { action } from "../functions";
import { readRepositoryCloudflareStacks } from "./cloudflareStateStore";
import { readRepositoryGitHubStacks } from "./githubStateStore";
import { limiter } from "./requestLimiter";
import {
  CONVEX_CONNECTION_REQUIRED,
  fetchConvexDeploymentJson,
  readConvexInspectionTarget,
  withConvexInspectionDeployKey,
  type ConvexInspectionTarget,
} from "./convexDeploymentInspection";
import {
  readConvexProductionDeployment,
  readConvexProjectResource,
} from "./convexProjectResources";
import { buildConvexDeploymentDashboardUrl } from "./providerDashboardUrls";

const { array, id, literal, object, string, union } = v;

/** The Convex project of a team whose production deployment holds the Alchemy state of the team. */
const ALCHEMY_STATE_PROJECT_NAME = "alchemy-state-store";

/**
The reply of `state:stacks`: the name of every stack of the store with a resource or an output, in
name order.

@see https://github.com/samebase/samebase/blob/e992b030f0b5cb4da9959a6fa4b17be3d7a23bbf/packages/alchemy-convex/src/store/component/state.ts#L53-L78
*/
const vStoreStacksReply = object({ status: literal("success"), value: array(string()) });

/**
The reply of `state:readStack` `{ stack }` of store version 7: every stage of the stack in name
order, with the JSON texts that the rows hold. A secret is still in its `__redacted__` object, sealed
or in clear text. A stack that the store does not hold has no stages. The function is an internal
query of the root app: only `POST /api/function` reaches it, with a deploy key that allows
`deployment:functions:runInternalQueries`. A function error fails the request, which
`fetchConvexDeploymentJson` throws.

@see https://github.com/samebase/samebase/blob/e992b030f0b5cb4da9959a6fa4b17be3d7a23bbf/packages/alchemy-convex/src/store/component/state.ts#L292-L345
*/
const vStoreStackReply = object({
  status: literal("success"),
  value: object({ stages: array(vAlchemyStoredStage) }),
});

/**
The reply of `state:getOutput` `{ stack, stage }`: the JSON text of the stage's output, opened when
it is sealed, null when the stage has none.

@see https://github.com/samebase/samebase/blob/db7ab89017a6b8e6fbcfd2fa41f9b4ee1a3bb4e2/packages/alchemy-convex/src/store/convex/state.ts#L165-L173
*/
const vStoreOutputReply = object({ status: literal("success"), value: union(string(), v.null()) });

/** At most this many reads of the store at once. */
const STORE_REQUEST_LIMIT = 16;

/** A stored stage without secret values, as `reader:repository` gives it. */
function withoutSecretValues(stage: AlchemyStoredStage): AlchemyStoredStage {
  return {
    name: stage.name,
    resources: stage.resources.map((resource) => ({
      fqn: resource.fqn,
      value: JSON.stringify(parseWithoutSecretValues(resource.value)),
    })),
    output: stage.output === null ? null : JSON.stringify(parseWithoutSecretValues(stage.output)),
  };
}

/** A custom domain's destination, or null for one that Samebase does not show. */
function readCustomDomainDestination(destination: string): "convexCloud" | "convexSite" | null {
  switch (destination) {
    case "convexCloud":
    case "convexSite":
      return destination;
    default:
      return null;
  }
}

/** The production deployment of the connected team's `alchemy-state-store` project. */
async function findAlchemyDeployment(target: Pick<ConvexInspectionTarget, "teamId" | "token">) {
  const project = (
    await listConvexManagementProjects({ token: target.token, teamId: target.teamId })
  ).find((candidate) => candidate.name === ALCHEMY_STATE_PROJECT_NAME);
  // A store project without a production deployment holds no state yet.
  return project
    ? await readConvexProductionDeployment({ token: target.token, projectId: String(project.id) })
    : null;
}

/** A stack named `owner/name` or `owner/name/<folder>` for the repository. */
function isNamedForRepository(name: string, repository: AlchemyRepository) {
  const fullName = repository.githubRepositoryFullName;
  return name === fullName || name.startsWith(`${fullName}/`);
}

/**
The stacks of the repository in the store, in name order: each stack named `owner/name` or
`owner/name/<folder>`, and each stack of another name whose `prod` output has a run record that
matches the repository (`readDeployedStacks`), or, when it has no `prod` output, any stage that does.
A repository renamed after its first deploy keeps its stack's first name, because the names of the
stack's resources follow it, and its next deploy writes the new name in the run record. Each stack
of another name costs one read of its `prod` output, and one read of the stack when it has none.
*/
async function readRepositoryStackNames(args: {
  deployKey: string;
  deploymentUrl: string;
  repository: AlchemyRepository;
}) {
  const call = async (body: { path: string; args: Record<string, string> }) =>
    await fetchConvexDeploymentJson({
      authorization: `Convex ${args.deployKey}`,
      deploymentUrl: args.deploymentUrl,
      path: "/api/function",
      body: { path: body.path, args: body.args, format: "json" },
    });
  const names = parse(vStoreStacksReply, await call({ path: "state:stacks", args: {} })).value;
  const limited = limiter(STORE_REQUEST_LIMIT);
  const belongs = await Promise.all(
    names.map(async (name) => {
      if (isNamedForRepository(name, args.repository)) {
        return true;
      }
      const output = parse(
        vStoreOutputReply,
        await limited(
          async () => await call({ path: "state:getOutput", args: { stack: name, stage: "prod" } }),
        ),
      ).value;
      // A stack with no `prod` output can hold a preview stage of the repository.
      const stages =
        output === null
          ? parse(
              vStoreStackReply,
              await limited(
                async () => await call({ path: "state:readStack", args: { stack: name } }),
              ),
            ).value.stages
          : [{ name: "prod", resources: [], output }];
      return readDeployedStacks([{ name, stages }], args.repository, "convex").length > 0;
    }),
  );
  return names.filter((_, index) => belongs[index]);
}

/**
Reads the stacks of a repository from the Alchemy state store of a Convex team, the production
deployment of the team's `alchemy-state-store` project: `state:stacks`, then one `state:readStack`
for each stack of the repository (`readRepositoryStackNames`) that `keep` accepts. The secret values
are removed first, and `readDeployedStacks` keeps the stages that Samebase shows. Of the other stacks
of the team, only the run records are used.
*/
async function readStoreStacks(args: {
  repository: AlchemyRepository;
  target: Pick<ConvexInspectionTarget, "authMethod" | "teamId" | "token">;
  keep: (name: string) => boolean;
}): Promise<AlchemyStacksRead> {
  const deployment = await findAlchemyDeployment(args.target);
  if (!deployment) {
    return { store: "missing" };
  }

  const replies = await withConvexInspectionDeployKey(
    { deployment, purpose: "alchemyState", target: args.target },
    async (deployKey) => {
      const names = await readRepositoryStackNames({
        deployKey,
        deploymentUrl: deployment.deploymentUrl,
        repository: args.repository,
      });
      return await Promise.all(
        names.filter(args.keep).map(async (name) => ({
          name,
          reply: await fetchConvexDeploymentJson({
            authorization: `Convex ${deployKey}`,
            deploymentUrl: deployment.deploymentUrl,
            path: "/api/function",
            body: { path: "state:readStack", args: { stack: name }, format: "json" },
          }),
        })),
      );
    },
  );

  return {
    store: "found",
    stacks: readDeployedStacks(
      replies.map(({ name, reply }) => ({
        name,
        stages: parse(vStoreStackReply, reply).value.stages.map(withoutSecretValues),
      })),
      args.repository,
      "convex",
    ),
  };
}

/** Every stack of a repository in the store of a Convex team (`readStoreStacks`). */
export async function readAlchemyStacks(args: {
  repository: AlchemyRepository;
  target: Pick<ConvexInspectionTarget, "authMethod" | "teamId" | "token">;
}): Promise<AlchemyStacksRead> {
  return await readStoreStacks({
    repository: args.repository,
    target: args.target,
    keep: () => true,
  });
}

/** The setup status of a repository_actions repository, from one read of the store. */
async function readRepositorySetupStatus(
  ctx: Pick<ActionCtx, "runQuery">,
  args: { repositoryId: Id<"repositories">; userId: Id<"users"> },
): Promise<AlchemySetupStatus> {
  const target = await readConvexInspectionTarget(ctx, {
    repositoryId: args.repositoryId,
    userId: args.userId,
  });
  const read = await readAlchemyStacks({ repository: target, target });
  return readAlchemySetupStatus(read.store === "found" ? read.stacks : []);
}

/** The inspection target of a store read, null without a Convex connection to the team. */
async function readStoreTarget(
  ctx: Pick<ActionCtx, "runQuery">,
  args: { repositoryId: Id<"repositories">; userId: Id<"users"> },
) {
  try {
    return await readConvexInspectionTarget(ctx, {
      repositoryId: args.repositoryId,
      userId: args.userId,
    });
  } catch (error) {
    if (error instanceof ConvexError && error.data === CONVEX_CONNECTION_REQUIRED) {
      return null;
    }
    throw error;
  }
}

/**
Throws unless the team's store holds no stack of the repository (`readRepositoryStackNames`):
deleting the GitHub repository deletes the Destroy app workflow and leaves the stack running. A stack
named for the repository counts by its name alone, so this also counts a stack that
`readAlchemyStacks` drops, such as one whose deploys never completed or whose outputs hold no run
record. The store of the organization's Cloudflare account is checked
first, by the same names and also by run record, since a stack there can have any name. A Cloudflare
store that Samebase cannot read throws: it could hold a stack. Only no connection, an MCP connection,
and an account without a store leave the decision to the next store. The branch
`alchemy-state-store` of the repository is checked next, from its tree alone: any `.json` file in a
stage folder, with or without a run record, is a stack. A branch that Samebase cannot read throws,
and a repository without the branch leaves the decision to the team's store.
*/
export async function assertRepositoryHasNoStack(
  ctx: Pick<ActionCtx, "runAction" | "runMutation" | "runQuery">,
  args: { repositoryId: Id<"repositories">; userId: Id<"users"> },
) {
  const cloudflare = await readRepositoryCloudflareStacks(ctx, {
    repositoryId: args.repositoryId,
    userId: args.userId,
    stopAtNamedStack: true,
  });
  switch (cloudflare.state) {
    case "found":
      if (cloudflare.namedStack || cloudflare.stacks.length > 0) {
        throw new ConvexError(DESTROY_ALCHEMY_STACK_FIRST);
      }
      break;
    case "reconnect":
      throw new ConvexError(RECONNECT_CLOUDFLARE_TO_CHECK_STACK);
    case "failed":
    case "unsupported_version":
      throw new ConvexError(CLOUDFLARE_STORE_UNREADABLE);
    case "not_connected":
    case "no_store":
      break;
    default:
      cloudflare satisfies never;
  }
  const github = await readRepositoryGitHubStacks(ctx, {
    repositoryId: args.repositoryId,
    userId: args.userId,
    treeOnly: true,
  });
  switch (github.state) {
    case "found":
      if (github.stageFiles) {
        throw new ConvexError(DESTROY_ALCHEMY_STACK_FIRST);
      }
      break;
    case "failed":
      throw new ConvexError(GITHUB_STORE_UNREADABLE);
    case "no_store":
      break;
    default:
      github satisfies never;
  }
  const target = await readStoreTarget(ctx, args);
  if (!target) {
    throw new ConvexError(CONNECT_CONVEX_TO_CHECK_STACK);
  }
  const deployment = await findAlchemyDeployment(target);
  if (!deployment) {
    return;
  }
  const names = await withConvexInspectionDeployKey(
    { deployment, purpose: "alchemyState", target },
    async (deployKey) =>
      await readRepositoryStackNames({
        deployKey,
        deploymentUrl: deployment.deploymentUrl,
        repository: target,
      }),
  );
  if (names.length > 0) {
    throw new ConvexError(DESTROY_ALCHEMY_STACK_FIRST);
  }
}

/**
The stacks of a repository with the live metadata of their production deployments, so that a stack's
address is the one that the overview shows. The result holds no secret value
(`withoutSecretValues`), and it throws when the store cannot be read.
*/
export async function readRepositoryStacks(
  ctx: Pick<ActionCtx, "runQuery">,
  args: { repositoryId: Id<"repositories">; userId: Id<"users"> },
): Promise<AlchemyStateObservation> {
  const target = await readStoreTarget(ctx, args);
  if (!target) {
    return { store: "no_connection" };
  }
  const read = await readAlchemyStacks({ repository: target, target });
  return read.store === "missing"
    ? read
    : { ...read, liveDeployments: await readLiveDeployments(read.stacks, target) };
}

/**
The `Convex.Deployment` resources of the production stages, `prod`, of the stacks, each with its
Convex project and the team of that project when the state names it.
*/
export function readProductionConvexDeployments(stacks: readonly AlchemyStack[]): {
  projectId: string;
  deploymentName: string;
  teamId: string | null;
}[] {
  return stacks.flatMap((stack) => {
    const stage = stack.stages.find((candidate) => candidate.name === "prod");
    const states = (stage?.resources ?? []).map((resource): unknown => JSON.parse(resource.value));
    const projects = states.flatMap((state) =>
      validate(vAlchemyConvexProjectState, state, { allowUnknownFields: true }) ? [state.attr] : [],
    );
    return states.flatMap((state) => {
      if (!validate(vAlchemyConvexDeploymentState, state, { allowUnknownFields: true })) {
        return [];
      }
      const project =
        projects.find((candidate) => candidate.projectId === state.attr.projectId) ??
        state.props.project;
      return [
        {
          projectId: String(state.attr.projectId),
          deploymentName: state.attr.name,
          teamId: project.teamId === undefined ? null : String(project.teamId),
        },
      ];
    });
  });
}

/**
The production deployments of the repository's stacks in the connected team. A store that cannot be
read proves no deployment, like a team without a store.
*/
export async function readTeamProductionDeployments(
  target: Pick<
    ConvexInspectionTarget,
    "authMethod" | "githubRepositoryDatabaseId" | "githubRepositoryFullName" | "teamId" | "token"
  >,
) {
  const read = await readAlchemyStacks({ repository: target, target }).catch(() => ({
    store: "missing" as const,
  }));
  return read.store === "missing"
    ? []
    : readProductionConvexDeployments(read.stacks).filter(
        (deployment) => deployment.teamId === null || deployment.teamId === target.teamId,
      );
}

const vAlchemyConnection = union(
  object({ store: literal("missing") }),
  vAlchemyNoConnection,
  object({ store: literal("live"), deploymentUrl: string(), token: string() }),
);
const vAlchemyConnectionWithSnapshot = union(
  object({ store: literal("missing") }),
  vAlchemyNoConnection,
  object({
    store: literal("live"),
    deploymentUrl: string(),
    token: string(),
    snapshot: vAlchemyStacksRead,
  }),
);
const vReaderAuthorizationReply = object({
  status: literal("success"),
  value: object({ token: string() }),
});
/** The reply of `POST /api/query` for `reader:repository`, the query that the browser subscribes to. */
const vReaderRepositoryReply = object({
  status: literal("success"),
  value: vAlchemyRepositoryReply,
});

/**
Checks Samebase access on every connection and token renewal: the caller reads `target` for the
viewer. Only a five-minute, repository-scoped read token reaches the browser. The deploy key used to
ask the store for that token stays here.
*/
async function connectReader(
  target: ConvexInspectionTarget,
  userId: Id<"users">,
): Promise<Infer<typeof vAlchemyConnection>> {
  try {
    const deployment = await findAlchemyDeployment(target);
    if (!deployment) {
      return { store: "missing" };
    }

    return await withConvexInspectionDeployKey(
      { deployment, purpose: "alchemyReader", target },
      async (deployKey): Promise<Infer<typeof vAlchemyConnection>> => {
        const { token } = parse(
          vReaderAuthorizationReply,
          await fetchConvexDeploymentJson({
            authorization: `Convex ${deployKey}`,
            deploymentUrl: deployment.deploymentUrl,
            path: "/api/function",
            body: {
              path: "reader:authorize",
              args: {
                repository: target.githubRepositoryFullName,
                subject: `${env.CONVEX_CLOUD_URL}:${userId}`,
              },
              format: "json",
            },
          }),
        ).value;
        return { store: "live", deploymentUrl: deployment.deploymentUrl, token };
      },
    );
  } catch {
    throw new ConvexError(ALCHEMY_CONNECTION_UNAVAILABLE);
  }
}

export const connect = action({
  access: "access_dashboard",
  args: { repositoryId: id("repositories") },
  returns: vAlchemyConnection,
  handler: async (ctx, args): Promise<Infer<typeof vAlchemyConnection>> => {
    const target = await readStoreTarget(ctx, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });
    return target ? await connectReader(target, ctx.viewer.userId) : { store: "no_connection" };
  },
});

/**
`connect` with one read of `reader:repository` through the issued token, for the loaders of the
repository overview and the Alchemy page: the page renders the read in its first paint, and the
browser subscribes with the same token. The read gives the stacks that `readDeployedStacks` keeps,
the same as the browser subscription.
*/
export const connectWithSnapshot = action({
  access: "access_dashboard",
  args: { repositoryId: id("repositories") },
  returns: vAlchemyConnectionWithSnapshot,
  handler: async (ctx, args): Promise<Infer<typeof vAlchemyConnectionWithSnapshot>> => {
    const target = await readStoreTarget(ctx, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });
    if (!target) {
      return { store: "no_connection" };
    }
    const connection = await connectReader(target, ctx.viewer.userId);
    if (connection.store !== "live") {
      return connection;
    }

    try {
      const { value } = parse(
        vReaderRepositoryReply,
        await fetchConvexDeploymentJson({
          authorization: `Bearer ${connection.token}`,
          deploymentUrl: connection.deploymentUrl,
          path: "/api/query",
          body: { path: "reader:repository", args: {}, format: "json" },
        }),
      );
      return {
        ...connection,
        snapshot: {
          store: value.store,
          stacks: readDeployedStacks(value.stacks, target, "convex"),
        },
      };
    } catch {
      throw new ConvexError(ALCHEMY_CONNECTION_UNAVAILABLE);
    }
  },
});

/**
The stacks of a repository in the Alchemy state store of its organization's Cloudflare account
(`Cloudflare.state()`), with the metadata of their Convex production deployments when the
organization has a Convex connection to the repository's team. It needs no Convex connection. The
read takes some seconds, so the page starts it in the browser and does not wait for it.
*/
export const readCloudflareStacks = action({
  access: "access_dashboard",
  args: { repositoryId: id("repositories") },
  returns: vCloudflareStacksRead,
  handler: async (ctx, args): Promise<CloudflareStacksRead> => {
    const reader = { repositoryId: args.repositoryId, userId: ctx.viewer.userId };
    const read = await readRepositoryCloudflareStacks(ctx, {
      repositoryId: reader.repositoryId,
      userId: reader.userId,
      stopAtNamedStack: false,
    });
    if (read.state !== "found") {
      return read;
    }
    const target = read.stacks.length > 0 ? await readStoreTarget(ctx, reader) : null;
    return {
      state: "found",
      stacks: read.stacks,
      liveDeployments: target ? await readLiveDeployments(read.stacks, target) : [],
    };
  },
});

/**
The stacks of a repository on its branch `alchemy-state-store` (the GitHub state store of
`@samebase/alchemy-kit`), with the metadata of their Convex production deployments when the
organization has a Convex connection to the repository's team. It needs no Convex connection. The
page starts the read in the browser and does not wait for it.
*/
export const readGitHubStacks = action({
  access: "access_dashboard",
  args: { repositoryId: id("repositories") },
  returns: vGitHubStacksRead,
  handler: async (ctx, args): Promise<GitHubStacksRead> => {
    const reader = { repositoryId: args.repositoryId, userId: ctx.viewer.userId };
    const read = await readRepositoryGitHubStacks(ctx, {
      repositoryId: reader.repositoryId,
      userId: reader.userId,
      treeOnly: false,
    });
    if (read.state !== "found") {
      return read;
    }
    const target = read.stacks.length > 0 ? await readStoreTarget(ctx, reader) : null;
    return {
      state: "found",
      stacks: read.stacks,
      liveDeployments: target ? await readLiveDeployments(read.stacks, target) : [],
    };
  },
});

/**
The stacks of a repository in the store of its Convex team that the browser subscription does not
give: the stacks of the repository (`readRepositoryStackNames`) whose name is not `owner/name` and
does not start with `owner/name/`, such as the stack of a renamed repository. Without a Convex
connection or a store it gives no stack. The page starts the read in the browser.
*/
export const readOtherNameStacks = action({
  access: "access_dashboard",
  args: { repositoryId: id("repositories") },
  returns: vOtherNameStacksRead,
  handler: async (ctx, args): Promise<OtherNameStacksRead> => {
    const target = await readStoreTarget(ctx, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });
    if (!target) {
      return { stacks: [], liveDeployments: [] };
    }
    const read = await readStoreStacks({
      repository: target,
      target,
      keep: (name) => !isNamedForRepository(name, target),
    });
    return read.store === "found"
      ? { stacks: read.stacks, liveDeployments: await readLiveDeployments(read.stacks, target) }
      : { stacks: [], liveDeployments: [] };
  },
});

/** The setup status of a repository_actions repository, for its overview page. */
export const readSetupStatus = action({
  access: "access_dashboard",
  args: { repositoryId: id("repositories") },
  returns: vAlchemySetupStatus,
  handler: async (ctx, args): Promise<AlchemySetupStatus> =>
    await readRepositorySetupStatus(ctx, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    }),
});

/** Provider metadata changes separately from Alchemy state and does not need a store subscription. */
export const readDeploymentMetadata = action({
  access: "access_dashboard",
  args: { repositoryId: id("repositories") },
  returns: vAlchemyLiveDeployments,
  handler: async (ctx, args): Promise<Infer<typeof vAlchemyLiveDeployments>> => {
    const target = await readConvexInspectionTarget(ctx, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });
    const read = await readAlchemyStacks({ repository: target, target });
    return read.store === "missing" ? [] : await readLiveDeployments(read.stacks, target);
  },
});

async function readLiveDeployments(
  stacks: AlchemyStack[],
  target: Pick<ConvexInspectionTarget, "teamId" | "token">,
) {
  return await Promise.all(
    readProductionConvexDeployments(stacks).map(async (deployment) => {
      const [project, live, customDomains] = await Promise.all([
        readConvexProjectResource({
          token: target.token,
          teamId: target.teamId,
          projectId: deployment.projectId,
        }).catch(() => null),
        readConvexProductionDeployment({
          token: target.token,
          projectId: deployment.projectId,
        }).catch(() => null),
        runConvexManagement(target.token, management.listCustomDomains, {
          deploymentName: deployment.deploymentName,
        })
          .then(({ domains }) => domains)
          .catch(() => []),
      ]);
      return {
        deploymentName: deployment.deploymentName,
        dashboardUrl: project
          ? buildConvexDeploymentDashboardUrl({
              teamSlug: project.teamSlug,
              projectSlug: project.slug,
              deploymentName: deployment.deploymentName,
            })
          : null,
        region:
          live?.name === deployment.deploymentName
            ? parseConvexDeploymentRegion(live.region)
            : null,
        customDomains: customDomains
          .filter(({ verificationTime }) => verificationTime)
          .sort(
            (left, right) =>
              left.creationTime - right.creationTime || left.domain.localeCompare(right.domain),
          )
          .flatMap(({ domain, requestDestination }) => {
            const destination = readCustomDomainDestination(requestDestination);
            return destination ? [{ domain, requestDestination: destination }] : [];
          }),
      };
    }),
  );
}

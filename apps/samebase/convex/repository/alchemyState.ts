import { notEmpty } from "@samebase/dependent/main";
import { parse, validate } from "convex-helpers/validators";
import { ConvexError, Infer, v } from "convex/values";
import {
  ALCHEMY_REDACTED_MARKER,
  vAlchemyConvexDeploymentState,
  vAlchemyConvexProjectState,
} from "../../shared/alchemyState";
import {
  ALCHEMY_CONNECTION_UNAVAILABLE,
  vAlchemyRunRecord,
  vAlchemyLiveDeployments,
  vAlchemyStacksRead,
  type AlchemyStage,
  type AlchemyStack,
  type AlchemyStacksRead,
} from "../../shared/alchemyStateModel";
import type { Id } from "../_generated/dataModel";
import { env, type ActionCtx } from "../_generated/server";
import {
  createConvexManagementClient,
  listConvexManagementProjects,
} from "../convexManagementApi/client";
import { ConvexManagement } from "../convexManagementApi/generated/sdk.gen";
import { action } from "../functions";
import { isRecord } from "../jsonUtils";
import {
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
const ALCHEMY_STATE_PROJECT_NAME = "samebase";

/**
The key of the run record of the last full deploy in a stage output.

@see https://github.com/samebase/alchemy-convex/blob/v0.9.0/src/RunRecord.ts#L16
*/
const RUN_RECORD_KEY = "samebase.run";

/**
The reply of `state:stacks`: the name of every stack of the store with a resource or an output, in
name order.

@see https://github.com/samebase/alchemy-convex/blob/v0.9.0/src/store/convex/state.ts#L74-L99
*/
const vStoreStacksReply = object({ status: literal("success"), value: array(string()) });

/**
The reply of `state:readStack` `{ stack }` of store version 3 (samebase/alchemy-convex 0.9.0): every
stage of the stack in name order, each with its resources in fqn order and its output, as the JSON
texts that the rows hold, and `record`, the run record of the run that last wrote the stage. A first
deploy has its record before it writes its output (`output: null`). `record` is null when the last
write carried no record, such as a run before 0.9.0. A stack that the store does not hold has no
stages. The function is an internal query of the root app: only `POST /api/function` reaches it,
with a deploy key that allows `deployment:functions:runInternalQueries`. A function error fails the
request, which `fetchConvexDeploymentJson` throws.

@see https://github.com/samebase/alchemy-convex/blob/v0.9.0/src/store/convex/state.ts#L242-L291
*/
const vStoreStackReply = object({
  status: literal("success"),
  value: object({
    stages: array(
      object({
        stage: string(),
        record: union(vAlchemyRunRecord, v.null()),
        resources: array(object({ fqn: string(), value: string() })),
        output: union(string(), v.null()),
      }),
    ),
  }),
});
type StoreStage = Infer<typeof vStoreStackReply>["value"]["stages"][number];

/**
Alchemy state holds each `Redacted` value in clear text. This parses a JSON text of the state, keeps
the key of each secret, and replaces its value with `null`, so the value never leaves the action.
*/
function parseWithoutSecretValues(text: string): unknown {
  return JSON.parse(text, (_key, current: unknown) =>
    isRecord(current) && ALCHEMY_REDACTED_MARKER in current
      ? { [ALCHEMY_REDACTED_MARKER]: null }
      : current,
  );
}

/**
A stage whose current run record names `repository`, including a deploy with no output yet. The
deployed commit is the one of the run record in the output, which the last full deploy wrote.
*/
function readStage(stage: StoreStage, repository: string): AlchemyStage | null {
  const { record } = stage;
  if (record?.repository !== repository) {
    return null;
  }
  const output = stage.output === null ? {} : parseWithoutSecretValues(stage.output);
  if (!isRecord(output)) {
    return null;
  }

  const { [RUN_RECORD_KEY]: deployed, ...stackOutput } = output;
  return {
    name: stage.stage,
    record,
    deployedHeadCommit:
      validate(vAlchemyRunRecord, deployed, { allowUnknownFields: true }) &&
      deployed.repository === repository
        ? deployed.headCommit
        : null,
    resources: stage.resources.map((resource) => ({
      fqn: resource.fqn,
      value: JSON.stringify(parseWithoutSecretValues(resource.value)),
    })),
    output: JSON.stringify(stackOutput),
  };
}

/** The production deployment of the connected team's `samebase` project. */
async function findAlchemyDeployment(target: Pick<ConvexInspectionTarget, "teamId" | "token">) {
  const project = (
    await listConvexManagementProjects({ token: target.token, teamId: target.teamId })
  ).find((candidate) => candidate.name === ALCHEMY_STATE_PROJECT_NAME);
  // A store project without a production deployment holds no state yet.
  return project
    ? await readConvexProductionDeployment({ token: target.token, projectId: project.id })
    : null;
}

/**
Reads the stacks of a repository from the Alchemy state store of a Convex team, the production
deployment of the team's `samebase` project: `state:stacks`, then one `state:readStack` for each
stack named `owner/name` or `owner/name/<folder>`. A stack keeps the stages whose run record names
the repository. Other stacks of the team are not read.
*/
export async function readAlchemyStacks(args: {
  /** The GitHub `owner/name` of the repository. */
  repository: string;
  target: Pick<ConvexInspectionTarget, "authMethod" | "teamId" | "token">;
}): Promise<AlchemyStacksRead> {
  const deployment = await findAlchemyDeployment(args.target);
  if (!deployment) {
    return { store: "missing" };
  }

  const replies = await withConvexInspectionDeployKey(
    { deployment, purpose: "alchemyState", target: args.target },
    async (deployKey) => {
      const names = parse(
        vStoreStacksReply,
        await fetchConvexDeploymentJson({
          authorization: `Convex ${deployKey}`,
          deploymentUrl: deployment.deploymentUrl,
          path: "/api/function",
          body: { path: "state:stacks", args: {}, format: "json" },
        }),
      ).value.filter((name) => name === args.repository || name.startsWith(`${args.repository}/`));
      return await Promise.all(
        names.map(async (name) => ({
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
    stacks: replies.flatMap(({ name, reply }) => {
      const stages = parse(vStoreStackReply, reply)
        .value.stages.map((stage) => readStage(stage, args.repository))
        .filter(notEmpty);
      return stages.length === 0 ? [] : [{ name, stages }];
    }),
  };
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

const vAlchemyConnection = union(
  object({ store: literal("missing") }),
  object({ store: literal("live"), deploymentUrl: string(), token: string() }),
);
const vAlchemyConnectionWithSnapshot = union(
  object({ store: literal("missing") }),
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
const vReaderRepositoryReply = object({ status: literal("success"), value: vAlchemyStacksRead });

/**
Checks Samebase access on every connection and token renewal. Only a five-minute, repository-scoped
read token reaches the browser. The deploy key used to ask the store for that token stays here.
*/
async function connectReader(
  ctx: Pick<ActionCtx, "runQuery">,
  args: { repositoryId: Id<"repositories">; userId: Id<"users"> },
): Promise<Infer<typeof vAlchemyConnection>> {
  const target = await readConvexInspectionTarget(ctx, {
    repositoryId: args.repositoryId,
    userId: args.userId,
  });
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
                subject: `${env.CONVEX_CLOUD_URL}:${args.userId}`,
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
  handler: async (ctx, args): Promise<Infer<typeof vAlchemyConnection>> =>
    await connectReader(ctx, { repositoryId: args.repositoryId, userId: ctx.viewer.userId }),
});

/**
`connect` with one read of `reader:repository` through the issued token, for the loaders of the
repository overview and the Alchemy page: the page renders the read in its first paint, and the
browser subscribes with the same token.
*/
export const connectWithSnapshot = action({
  access: "access_dashboard",
  args: { repositoryId: id("repositories") },
  returns: vAlchemyConnectionWithSnapshot,
  handler: async (ctx, args): Promise<Infer<typeof vAlchemyConnectionWithSnapshot>> => {
    const connection = await connectReader(ctx, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });
    if (connection.store === "missing") {
      return connection;
    }

    try {
      const { value: snapshot } = parse(
        vReaderRepositoryReply,
        await fetchConvexDeploymentJson({
          authorization: `Bearer ${connection.token}`,
          deploymentUrl: connection.deploymentUrl,
          path: "/api/query",
          body: { path: "reader:repository", args: {}, format: "json" },
        }),
      );
      return { ...connection, snapshot };
    } catch {
      throw new ConvexError(ALCHEMY_CONNECTION_UNAVAILABLE);
    }
  },
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
    const read = await readAlchemyStacks({ repository: target.githubRepositoryFullName, target });
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
        ConvexManagement.GET["/deployments/{deployment_name}/custom_domains"]({
          client: createConvexManagementClient({ token: target.token }),
          path: { deployment_name: deployment.deploymentName },
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
        region: live?.name === deployment.deploymentName ? live.region : null,
        customDomains: customDomains
          .filter(({ verificationTime }) => verificationTime)
          .sort(
            (left, right) =>
              left.creationTime - right.creationTime || left.domain.localeCompare(right.domain),
          )
          .map(({ domain, requestDestination }) => ({ domain, requestDestination })),
      };
    }),
  );
}

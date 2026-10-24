import { notEmpty } from "@samebase/dependent/main";
import { parse, validate } from "convex-helpers/validators";
import { Infer, v } from "convex/values";
import {
  ALCHEMY_REDACTED_MARKER,
  vAlchemyConvexDeploymentState,
  vAlchemyConvexProjectState,
} from "../../shared/alchemyState";
import {
  vAlchemyRunRecord,
  vAlchemyStateObservation,
  vAlchemyLiveDeployments,
  type AlchemyStage,
  type AlchemyStack,
  type AlchemyStateObservation,
  type AlchemyStacksRead,
} from "../../shared/alchemyStateModel";
import { internal } from "../_generated/api";
import { env } from "../_generated/server";
import { listConvexManagementProjects } from "../convexManagementApi/client";
import { action } from "../functions";
import { isRecord } from "../jsonUtils";
import {
  fetchConvexDeploymentJson,
  withConvexInspectionDeployKey,
  type ConvexInspectionTarget,
} from "./convexDeploymentInspection";
import {
  readConvexProductionDeployment,
  readConvexProjectResource,
} from "./convexProjectResources";
import { buildConvexDeploymentDashboardUrl } from "./providerDashboardUrls";

const { array, id, literal, number, object, optional, string, union } = v;

/** The Convex project of a team whose production deployment holds the Alchemy state of the team. */
const ALCHEMY_STATE_PROJECT_NAME = "alchemy-state";

/**
The key of the run record in a stage output.

@see https://github.com/samebase/alchemy-convex/blob/v0.8.0/src/RunRecord.ts#L16
*/
const RUN_RECORD_KEY = "samebase.run";

/**
The reply of `state:stacks`: the name of every stack of the store with a resource or an output, in
name order.

@see https://github.com/samebase/alchemy-convex/blob/v0.8.0/src/store/convex/state.ts#L63-L88
*/
const vStoreStacksReply = object({ status: literal("success"), value: array(string()) });

/**
The reply of `state:readStack` `{ stack }`: every stage of the stack in name order, each with its
resources in fqn order and its output, as the JSON texts that the rows hold. A stack that the store
does not hold has no stages. The function name is a wire contract of samebase/alchemy-convex since
store version 2 (0.7.0): a name is never renamed or removed. The function is an internal query of
the root app: only `POST /api/function` reaches it, with a deploy key that allows
`deployment:functions:runInternalQueries`. A function error fails the request, which
`fetchConvexDeploymentJson` throws.

@see https://github.com/samebase/alchemy-convex/blob/v0.8.0/src/store/convex/state.ts#L221-L265
*/
const vStoreStackReply = object({
  status: literal("success"),
  value: object({
    stages: array(
      object({
        stage: string(),
        record: optional(union(vAlchemyRunRecord, v.null())),
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

/** A stage whose current run record names `repository`, including a deploy with no output yet. */
function readStage(stage: StoreStage, repository: string): AlchemyStage | null {
  const output = stage.output === null ? {} : parseWithoutSecretValues(stage.output);
  if (!isRecord(output)) {
    return null;
  }
  const { [RUN_RECORD_KEY]: outputRecord, ...stackOutput } = output;
  const record = stage.record ?? outputRecord;
  if (!validate(vAlchemyRunRecord, record, { allowUnknownFields: true })) {
    return null;
  }

  const recorded = parse(vAlchemyRunRecord, record);
  const deployedHeadCommit =
    validate(vAlchemyRunRecord, outputRecord, { allowUnknownFields: true }) &&
    outputRecord.repository === repository
      ? outputRecord.headCommit
      : null;
  return recorded.repository === repository
    ? {
        name: stage.stage,
        record: recorded,
        deployedHeadCommit: stage.record === undefined ? undefined : deployedHeadCommit,
        resources: stage.resources.map((resource) => ({
          fqn: resource.fqn,
          value: JSON.stringify(parseWithoutSecretValues(resource.value)),
        })),
        output: JSON.stringify(stackOutput),
      }
    : null;
}

/** The production deployment of the connected team's `alchemy-state` project. */
async function findAlchemyDeployment(target: Pick<ConvexInspectionTarget, "teamId" | "token">) {
  const project = (
    await listConvexManagementProjects({ token: target.token, teamId: target.teamId })
  ).find((candidate) => candidate.name === ALCHEMY_STATE_PROJECT_NAME);
  // A store project without a production deployment holds no state yet.
  return project
    ? await readConvexProductionDeployment({ token: target.token, projectId: project.id })
    : null;
}

async function readStacks(args: {
  repository: string;
  deployKey: string;
  deploymentUrl: string;
}): Promise<Extract<AlchemyStacksRead, { store: "found" }>> {
  const names = parse(
    vStoreStacksReply,
    await fetchConvexDeploymentJson({
      deployKey: args.deployKey,
      deploymentUrl: args.deploymentUrl,
      path: "/api/function",
      body: { path: "state:stacks", args: {}, format: "json" },
    }),
  ).value.filter((name) => name === args.repository || name.startsWith(`${args.repository}/`));
  const replies = await Promise.all(
    names.map(async (name) => ({
      name,
      reply: await fetchConvexDeploymentJson({
        deployKey: args.deployKey,
        deploymentUrl: args.deploymentUrl,
        path: "/api/function",
        body: { path: "state:readStack", args: { stack: name }, format: "json" },
      }),
    })),
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
Reads only stacks named `owner/name` or `owner/name/<folder>` and stages whose run record names the
repository. Server inspection and clients of stores before version 3 use this HTTP read path.
*/
export async function readAlchemyStacks(args: {
  repository: string;
  target: Pick<ConvexInspectionTarget, "authMethod" | "teamId" | "token">;
}): Promise<AlchemyStacksRead> {
  const deployment = await findAlchemyDeployment(args.target);
  if (!deployment) {
    return { store: "missing" };
  }
  return await withConvexInspectionDeployKey(
    { deployment, purpose: "alchemyState", target: args.target },
    (deployKey) =>
      readStacks({
        repository: args.repository,
        deployKey,
        deploymentUrl: deployment.deploymentUrl,
      }),
  );
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
Reads the stacks of the repository from the Alchemy state store of the Convex team that the
organization connected: their stages with the run record of each, the resources of each stage, and
the stage output, plus the live region of each production Convex deployment.
*/
export const observe = action({
  access: "access_dashboard",
  args: {
    repositoryId: id("repositories"),
  },
  returns: vAlchemyStateObservation,
  handler: async (ctx, args): Promise<AlchemyStateObservation> => {
    const target = await ctx.runQuery(internal.repository.convexDeploymentInspection.readTarget, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });
    const read = await readAlchemyStacks({ repository: target.githubRepositoryFullName, target });
    if (read.store === "missing") {
      return read;
    }

    const liveDeployments = await readLiveDeployments(read.stacks, target);
    return { ...read, liveDeployments };
  },
});

const vAlchemyConnection = union(
  object({ store: literal("missing") }),
  object({ store: literal("snapshot"), observation: vAlchemyStateObservation }),
  object({ store: literal("live"), deploymentUrl: string(), token: string() }),
);
const vStoreVersionReply = object({ status: literal("success"), value: number() });
const vReaderAuthorizationReply = object({
  status: literal("success"),
  value: object({ token: string() }),
});

/**
Checks Samebase access on every connection and token renewal. Only a five-minute, repository-scoped
read token reaches the browser. The deploy key used to ask the store for that token stays here.
Stores before version 3 retain their snapshot view until their next provider upgrade.
*/
export const connect = action({
  access: "access_dashboard",
  args: { repositoryId: id("repositories") },
  returns: vAlchemyConnection,
  handler: async (ctx, args): Promise<Infer<typeof vAlchemyConnection>> => {
    const target = await ctx.runQuery(internal.repository.convexDeploymentInspection.readTarget, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });
    const deployment = await findAlchemyDeployment(target);
    if (!deployment) {
      return { store: "missing" };
    }

    return await withConvexInspectionDeployKey(
      { deployment, purpose: "alchemyReader", target },
      async (deployKey): Promise<Infer<typeof vAlchemyConnection>> => {
        const version = parse(
          vStoreVersionReply,
          await fetchConvexDeploymentJson({
            deployKey,
            deploymentUrl: deployment.deploymentUrl,
            path: "/api/function",
            body: { path: "state:version", args: {}, format: "json" },
          }),
        ).value;
        if (version < 3) {
          const read = await readStacks({
            repository: target.githubRepositoryFullName,
            deployKey,
            deploymentUrl: deployment.deploymentUrl,
          });
          return {
            store: "snapshot",
            observation: {
              ...read,
              liveDeployments: await readLiveDeployments(read.stacks, target),
            },
          };
        }

        const { token } = parse(
          vReaderAuthorizationReply,
          await fetchConvexDeploymentJson({
            deployKey,
            deploymentUrl: deployment.deploymentUrl,
            path: "/api/function",
            body: {
              path: "reader:authorize",
              args: {
                repository: target.githubRepositoryFullName,
                subject: `${env.CONVEX_CLOUD_URL}:${ctx.viewer.userId}`,
              },
              format: "json",
            },
          }),
        ).value;
        return { store: "live", deploymentUrl: deployment.deploymentUrl, token };
      },
    );
  },
});

/** Provider metadata changes separately from Alchemy state and does not need a store subscription. */
export const readDeploymentMetadata = action({
  access: "access_dashboard",
  args: { repositoryId: id("repositories") },
  returns: vAlchemyLiveDeployments,
  handler: async (ctx, args): Promise<Infer<typeof vAlchemyLiveDeployments>> => {
    const target = await ctx.runQuery(internal.repository.convexDeploymentInspection.readTarget, {
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
      const [project, live] = await Promise.all([
        readConvexProjectResource({
          token: target.token,
          teamId: target.teamId,
          projectId: deployment.projectId,
        }).catch(() => null),
        readConvexProductionDeployment({
          token: target.token,
          projectId: deployment.projectId,
        }).catch(() => null),
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
      };
    }),
  );
}

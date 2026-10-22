import { notEmpty } from "@samebase/dependent/main";
import { parse, validate } from "convex-helpers/validators";
import { Infer, v } from "convex/values";
import {
  ALCHEMY_REDACTED_MARKER,
  vAlchemyConvexDeploymentState,
  vAlchemyConvexProjectState,
} from "../../shared/alchemyState";
import { internal } from "../_generated/api";
import { vConvexDeploymentRegion } from "../convexDeploymentRegionModel";
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

const { array, id, literal, number, object, string, union } = v;

/** The Convex project of a team whose production deployment holds the Alchemy state of the team. */
const ALCHEMY_STATE_PROJECT_NAME = "alchemy-state";

/**
The key of the run record in a stage output.

@see https://github.com/samebase/alchemy-convex/blob/v0.8.0/src/RunRecord.ts#L16
*/
const RUN_RECORD_KEY = "samebase.run";

/**
The run record that @samebase/alchemy-convex adds to each stage output it writes: the run of the
last full deploy of the stage. It holds no secret.

@see https://github.com/samebase/alchemy-convex/blob/v0.8.0/src/RunRecord.ts#L22-L39
*/
const vRunRecord = object({
  version: literal(1),
  /** GitHub `owner/name`. */
  repository: string(),
  /**
  The stack file from the repository root, with POSIX separators, such as `apps/x/alchemy.run.ts`:
  the working directory of the run plus `alchemy.run.ts`.
  */
  stackFile: string(),
  /** The head branch of a pull request, else the pushed branch. */
  branch: string(),
  /** The pull request whose head was deployed; null for a push and for a laptop. */
  pullRequest: union(number(), v.null()),
  /** The deployed commit, 40 hex characters. */
  headCommit: string(),
  /** The GitHub Actions run and attempt; null for a laptop. */
  runUrl: union(string(), v.null()),
  source: union(literal("github-actions"), literal("laptop")),
  /** ISO 8601, when the record was written. */
  recordedAt: string(),
});

/** A stage whose output holds a run record of version 1. */
const vAlchemyStage = object({
  name: string(),
  record: vRunRecord,
  /** `value` is the JSON text of Alchemy's `encodeState` without secret values. */
  resources: array(object({ fqn: string(), value: string() })),
  /** The JSON text of the stage output without the run record and without secret values. */
  output: string(),
});
export type AlchemyStage = Infer<typeof vAlchemyStage>;

/**
A stack of the repository with the stages whose run record names the repository, in name order.
The stack of the repository root is named after the repository, `owner/name`, and a stack in a
folder after the repository and the folder, such as `owner/name/apps/web`.
*/
const vAlchemyStack = object({ name: string(), stages: array(vAlchemyStage) });
export type AlchemyStack = Infer<typeof vAlchemyStack>;

const vAlchemyStateObservation = union(
  object({ store: literal("missing") }),
  object({
    store: literal("found"),
    /** The stacks of the repository with at least one stage, in name order. */
    stacks: array(vAlchemyStack),
    /**
    Each Convex deployment of the production stages, read live like the production deployment of
    an attached project: its dashboard link from the project read, null when that read fails, and
    its region from the deployment read, null when that read fails or names another deployment.
    */
    liveDeployments: array(
      object({
        deploymentName: string(),
        dashboardUrl: union(string(), v.null()),
        region: union(vConvexDeploymentRegion, v.null()),
      }),
    ),
  }),
);
type AlchemyStateObservation = Infer<typeof vAlchemyStateObservation>;
/** The store read of `observe`, before its live reads. */
type AlchemyStacksRead =
  | { store: "missing" }
  | Omit<Extract<AlchemyStateObservation, { store: "found" }>, "liveDeployments">;

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

/** The stage when its output holds a run record of version 1 that names `repository`, else null. */
function readStage(stage: StoreStage, repository: string): AlchemyStage | null {
  const output = stage.output === null ? null : parseWithoutSecretValues(stage.output);
  if (!isRecord(output)) {
    return null;
  }
  const { [RUN_RECORD_KEY]: record, ...stackOutput } = output;
  if (!validate(vRunRecord, record, { allowUnknownFields: true })) {
    return null;
  }

  const recorded = parse(vRunRecord, record);
  return recorded.repository === repository
    ? {
        name: stage.stage,
        record: recorded,
        resources: stage.resources.map((resource) => ({
          fqn: resource.fqn,
          value: JSON.stringify(parseWithoutSecretValues(resource.value)),
        })),
        output: JSON.stringify(stackOutput),
      }
    : null;
}

/**
Reads the stacks of a repository from the Alchemy state store of a Convex team, the production
deployment of the team's `alchemy-state` project: `state:stacks`, then one `state:readStack` for each
stack named `owner/name` or `owner/name/<folder>`. A stack keeps the stages whose run record names
the repository. Other stacks of the team are not read.
*/
export async function readAlchemyStacks(args: {
  /** The GitHub `owner/name` of the repository. */
  repository: string;
  target: Pick<ConvexInspectionTarget, "authMethod" | "teamId" | "token">;
}): Promise<AlchemyStacksRead> {
  const project = (
    await listConvexManagementProjects({ token: args.target.token, teamId: args.target.teamId })
  ).find((candidate) => candidate.name === ALCHEMY_STATE_PROJECT_NAME);
  // A store project without a production deployment holds no state yet.
  const deployment = project
    ? await readConvexProductionDeployment({ token: args.target.token, projectId: project.id })
    : null;
  if (!deployment) {
    return { store: "missing" };
  }

  const replies = await withConvexInspectionDeployKey(
    { deployment, purpose: "alchemyState", target: args.target },
    async (deployKey) => {
      const names = parse(
        vStoreStacksReply,
        await fetchConvexDeploymentJson({
          deployKey,
          deploymentUrl: deployment.deploymentUrl,
          path: "/api/function",
          body: { path: "state:stacks", args: {}, format: "json" },
        }),
      ).value.filter((name) => name === args.repository || name.startsWith(`${args.repository}/`));
      return await Promise.all(
        names.map(async (name) => ({
          name,
          reply: await fetchConvexDeploymentJson({
            deployKey,
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

    const liveDeployments = await Promise.all(
      readProductionConvexDeployments(read.stacks).map(async (deployment) => {
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
    return { ...read, liveDeployments };
  },
});

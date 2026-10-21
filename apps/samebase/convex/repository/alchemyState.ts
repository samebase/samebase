import { parse, validate } from "convex-helpers/validators";
import { Infer, v } from "convex/values";
import {
  ALCHEMY_REDACTED_MARKER,
  findProductionStage,
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

@see https://github.com/samebase/alchemy-convex/blob/v0.7.0/src/RunRecord.ts#L16
*/
const RUN_RECORD_KEY = "samebase.run";

/**
The run record that @samebase/alchemy-convex 0.7.0 adds to each stage output it writes: the run of
the last full deploy of the stage. It holds no secret.

@see https://github.com/samebase/alchemy-convex/blob/v0.7.0/src/RunRecord.ts#L22-L39
*/
const vRunRecord = object({
  version: literal(1),
  /** GitHub `owner/name`. */
  repository: string(),
  /** The stack file from the repository root, with POSIX separators, such as `apps/x/alchemy.run.ts`. */
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

const vAlchemyStage = object({
  name: string(),
  /**
  recorded = the stage output holds a run record of version 1.

  none = the stage has no output yet, or an output without a run record, such as one written
  before @samebase/alchemy-convex 0.7.0.

  unknown = the run record has another version or a shape that this reader does not know.
  */
  run: union(
    object({ state: literal("recorded"), record: vRunRecord }),
    object({ state: literal("none") }),
    object({ state: literal("unknown") }),
  ),
  /** `value` is the JSON text of Alchemy's `encodeState` without secret values. */
  resources: array(object({ fqn: string(), value: string() })),
  /**
  The JSON text of the stage output without the run record and without secret values, or
  `null` before the first output.
  */
  output: union(string(), v.null()),
});
export type AlchemyStage = Infer<typeof vAlchemyStage>;

const vAlchemyStateObservation = union(
  object({ store: literal("missing") }),
  object({
    store: literal("found"),
    /** The stack of the repository, keyed by its GitHub `owner/name`. */
    stack: string(),
    /**
    Each Convex deployment of the production stage, read live like the production deployment of
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
    stages: array(vAlchemyStage),
  }),
);
type AlchemyStateObservation = Infer<typeof vAlchemyStateObservation>;
/** The store read of `observe`, before its live reads. */
type AlchemyStackRead =
  | { store: "missing" }
  | Omit<Extract<AlchemyStateObservation, { store: "found" }>, "liveDeployments">;

/**
The reply of `state:readStack` `{ stack }`: every stage of the stack in name order, each with its
resources in fqn order and its output, as the JSON texts that the rows hold. A stack that the store
does not hold has no stages. The function name is a wire contract of samebase/alchemy-convex since
store version 2 (0.7.0): a name is never renamed or removed. The function is an internal query of
the root app: only `POST /api/function` reaches it, with a deploy key that allows
`deployment:functions:runInternalQueries`. A function error fails the request, which
`fetchConvexDeploymentJson` throws.

@see https://github.com/samebase/alchemy-convex/blob/v0.7.0/src/store/convex/state.ts#L221-L265
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

function readStage(stage: StoreStage): AlchemyStage {
  const resources = stage.resources.map((resource) => ({
    fqn: resource.fqn,
    value: JSON.stringify(parseWithoutSecretValues(resource.value)),
  }));
  const output = stage.output === null ? null : parseWithoutSecretValues(stage.output);
  if (!isRecord(output) || !(RUN_RECORD_KEY in output)) {
    return {
      name: stage.stage,
      run: { state: "none" },
      resources,
      output: output === null ? null : JSON.stringify(output),
    };
  }

  const { [RUN_RECORD_KEY]: record, ...stackOutput } = output;
  return {
    name: stage.stage,
    run: validate(vRunRecord, record, { allowUnknownFields: true })
      ? { state: "recorded", record: parse(vRunRecord, record) }
      : { state: "unknown" },
    resources,
    output: JSON.stringify(stackOutput),
  };
}

/**
Reads one stack in one `state:readStack` call from the Alchemy state store of a Convex team: the
production deployment of the team's `alchemy-state` project. Other stacks of the team are not read.
*/
export async function readAlchemyStack(args: {
  /** The GitHub `owner/name` of the repository. */
  stack: string;
  target: Pick<ConvexInspectionTarget, "authMethod" | "teamId" | "token">;
}): Promise<AlchemyStackRead> {
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

  const reply = await withConvexInspectionDeployKey(
    { deployment, purpose: "alchemyState", target: args.target },
    async (deployKey) =>
      await fetchConvexDeploymentJson({
        deployKey,
        deploymentUrl: deployment.deploymentUrl,
        path: "/api/function",
        body: { path: "state:readStack", args: { stack: args.stack }, format: "json" },
      }),
  );

  return {
    store: "found",
    stack: args.stack,
    stages: parse(vStoreStackReply, reply).value.stages.map(readStage),
  };
}

/**
The `Convex.Deployment` resources of the production stage of a stack, each with its Convex project
and the team of that project when the state names it.
*/
export function readProductionConvexDeployments(stages: readonly AlchemyStage[]): {
  projectId: string;
  deploymentName: string;
  teamId: string | null;
}[] {
  const stage = findProductionStage(stages);
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
}

/**
Reads the stack of the repository from the Alchemy state store of the Convex team that the
organization connected: its stages with the run record of each, the resources of each stage, and
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
    const read = await readAlchemyStack({ stack: target.githubRepositoryFullName, target });
    if (read.store === "missing") {
      return read;
    }

    const liveDeployments = await Promise.all(
      readProductionConvexDeployments(read.stages).map(async (deployment) => {
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

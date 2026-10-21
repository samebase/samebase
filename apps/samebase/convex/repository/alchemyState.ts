import {
  array as sureArray,
  literal as sureLiteral,
  nil as sureNil,
  object as sureObject,
  string as sureString,
  union as sureUnion,
} from "@samebase/sure";
import { Infer, v } from "convex/values";
import { ALCHEMY_REDACTED_MARKER } from "../../shared/alchemyState";
import { internal } from "../_generated/api";
import { listConvexManagementProjects } from "../convexManagementApi/client";
import { action } from "../functions";
import { isRecord } from "../jsonUtils";
import {
  fetchConvexDeploymentJson,
  withConvexInspectionDeployKey,
} from "./convexDeploymentInspection";
import { readConvexProductionDeployment } from "./convexProjectResources";

const { array, id, literal, object, string, union } = v;

/** The Convex project of a team whose production deployment holds the Alchemy state of the team. */
const ALCHEMY_STATE_PROJECT_NAME = "alchemy-state";

const vAlchemyStateObservation = union(
  object({ store: literal("missing") }),
  object({
    store: literal("found"),
    /** The stack of the repository, keyed by its GitHub `owner/name`. */
    stack: string(),
    stages: array(
      object({
        name: string(),
        /** `value` is the JSON text of Alchemy's `encodeState` without secret values. */
        resources: array(object({ fqn: string(), value: string() })),
        /** The JSON text of the stage output without secret values, or `null` before the first output. */
        output: union(string(), v.null()),
      }),
    ),
  }),
);
type AlchemyStateObservation = Infer<typeof vAlchemyStateObservation>;

/**
The function names of the store are a wire contract of samebase/alchemy-convex: a name is never
renamed or removed. Each one is an internal query of the root app: only `POST /api/function`
reaches it, with a deploy key that allows `deployment:functions:runInternalQueries`. A function
error fails the request, which `fetchConvexDeploymentJson` throws.

- `state:stages` `{ stack }`: the stage names of the stack, in index order.
- `state:list` `{ stack, stage }`: the resource fqns of the stage, in index order.
- `state:get` `{ stack, stage, fqn }`: the JSON text of the resource state, or `null`.
- `state:getOutput` `{ stack, stage }`: the JSON text of the stage output, or `null`.

@see https://github.com/samebase/alchemy-convex
*/
const sureNamesReply = sureObject({ status: sureLiteral("success"), value: sureArray(sureString) });
const sureTextReply = sureObject({
  status: sureLiteral("success"),
  value: sureUnion(sureString, sureNil),
});

/**
Alchemy state holds each `Redacted` value in clear text. This keeps the key of each secret and
replaces its value with `null`, so the value never leaves the action.
*/
function withoutSecretValues(text: string): string {
  const value: unknown = JSON.parse(text, (_key, current: unknown) =>
    isRecord(current) && ALCHEMY_REDACTED_MARKER in current
      ? { [ALCHEMY_REDACTED_MARKER]: null }
      : current,
  );
  return JSON.stringify(value);
}

/**
Reads the stack of the repository from the Alchemy state store of the Convex team that the
organization connected: its stages, the resources of each stage, and the stage output. The store is
the production deployment of the team's `alchemy-state` project. Other stacks of the team are not
read.
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
    const project = (
      await listConvexManagementProjects({ token: target.token, teamId: target.teamId })
    ).find((candidate) => candidate.name === ALCHEMY_STATE_PROJECT_NAME);
    // A store project without a production deployment holds no state yet.
    const deployment = project
      ? await readConvexProductionDeployment({ token: target.token, projectId: project.id })
      : null;
    if (!deployment) {
      return { store: "missing" };
    }

    const stack = target.githubRepositoryFullName;
    const stages = await withConvexInspectionDeployKey(
      { deployment, purpose: "alchemyState", target },
      async (deployKey) => {
        const run = async (path: string, functionArgs: Record<string, string>) =>
          await fetchConvexDeploymentJson({
            deployKey,
            deploymentUrl: deployment.deploymentUrl,
            path: "/api/function",
            body: { path, args: functionArgs, format: "json" },
          });
        const names = async (path: string, functionArgs: Record<string, string>) => {
          const [valid, reply] = sureNamesReply(await run(path, functionArgs));
          if (!valid) {
            throw new Error(`Convex returned an unexpected reply to ${path}.`);
          }
          return reply.value;
        };
        const text = async (path: string, functionArgs: Record<string, string>) => {
          const [valid, reply] = sureTextReply(await run(path, functionArgs));
          if (!valid) {
            throw new Error(`Convex returned an unexpected reply to ${path}.`);
          }
          return reply.value === null ? null : withoutSecretValues(reply.value);
        };

        return await Promise.all(
          (await names("state:stages", { stack })).map(async (stage) => {
            const [fqns, output] = await Promise.all([
              names("state:list", { stack, stage }),
              text("state:getOutput", { stack, stage }),
            ]);
            const resources = await Promise.all(
              fqns.map(async (fqn) => ({
                fqn,
                value: await text("state:get", { stack, stage, fqn }),
              })),
            );
            return {
              name: stage,
              // A deploy that runs during this read can delete a resource after `state:list`.
              resources: resources.flatMap(({ fqn, value }) =>
                value === null ? [] : [{ fqn, value }],
              ),
              output,
            };
          }),
        );
      },
    );

    return { store: "found", stack, stages };
  },
});

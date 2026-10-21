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
import { action } from "../functions";
import { isRecord } from "../jsonUtils";
import {
  fetchConvexDeploymentJson,
  findConvexProductionDeployment,
  withConvexInspectionDeployKey,
} from "./convexDeploymentInspection";

const { array, id, object, string, union } = v;

/** The store is the alchemyState component that the app mounts under its default name. */
const ALCHEMY_STATE_COMPONENT_PATH = "alchemyState";

const vAlchemyStateObservation = object({
  deploymentName: string(),
  stacks: array(
    object({
      name: string(),
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
  ),
});
type AlchemyStateObservation = Infer<typeof vAlchemyStateObservation>;

/**
The function names of the store are a wire contract of samebase/alchemy-convex: a name is never
renamed or removed. Each function runs through `POST <deployment>/api/function` with the component
path, because `/api/query` ignores a component path. A query needs a deploy key with
`deployment:data:view`. A function error is HTTP 560, which `fetchConvexDeploymentJson` throws.

- `state:stacks` `{}`: the stack names, in index order.
- `state:stages` `{ stack }`: the stage names of the stack, in index order.
- `state:list` `{ stack, stage }`: the resource fqns of the stage, in index order.
- `state:get` `{ stack, stage, fqn }`: the JSON text of the resource state, or `null`.
- `state:getOutput` `{ stack, stage }`: the JSON text of the stage output, or `null`.

@see https://github.com/samebase/alchemy-convex/blob/d20307f5681c699016466a54a5ea462037db7896/src/component/state.ts#L36-L159
@see https://github.com/samebase/alchemy-convex/blob/d20307f5681c699016466a54a5ea462037db7896/src/State.ts#L47-L51
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
Reads the Alchemy state that the stacks of the repository keep in the alchemyState component of
`deploymentName`: each stack, its stages, the resources of each stage, and the stage output. The
deployment must be the production deployment of a Convex project attached to the repository.
*/
export const observe = action({
  access: "access_dashboard",
  args: {
    repositoryId: id("repositories"),
    deploymentName: string(),
  },
  returns: vAlchemyStateObservation,
  handler: async (ctx, args): Promise<AlchemyStateObservation> => {
    const target = await ctx.runQuery(internal.repository.convexDeploymentInspection.readTarget, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });
    const deployment = await findConvexProductionDeployment({
      deploymentName: args.deploymentName,
      target,
    });

    const stacks = await withConvexInspectionDeployKey(
      { deployment, purpose: "alchemyState", target },
      async (deployKey) => {
        const run = async (path: string, functionArgs: Record<string, string>) =>
          await fetchConvexDeploymentJson({
            deployKey,
            deploymentUrl: deployment.deploymentUrl,
            path: "/api/function",
            body: {
              componentPath: ALCHEMY_STATE_COMPONENT_PATH,
              path,
              args: functionArgs,
              format: "json",
            },
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
          (await names("state:stacks", {})).map(async (stack) => ({
            name: stack,
            stages: await Promise.all(
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
            ),
          })),
        );
      },
    );

    return { deploymentName: deployment.name, stacks };
  },
});

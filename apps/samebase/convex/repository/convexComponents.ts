import {
  array as sureArray,
  literal as sureLiteral,
  nil as sureNil,
  object as sureObject,
  string as sureString,
  union as sureUnion,
} from "@samebase/sure";
import { Infer, v } from "convex/values";
import { internal } from "../_generated/api";
import { action } from "../functions";
import { readConvexProductionDeployment } from "./convexProjectResources";
import {
  fetchConvexSystemQuery,
  withConvexInspectionDeployKey,
} from "./convexDeploymentInspection";

const { array, id, literal, object, string, union } = v;

const vConvexComponentState = union(literal("active"), literal("unmounted"));
const vConvexComponentsObservation = object({
  deploymentName: string(),
  components: array(
    object({
      id: string(),
      name: string(),
      path: string(),
      state: vConvexComponentState,
    }),
  ),
});
type ConvexComponentsObservation = Infer<typeof vConvexComponentsObservation>;

/**
Rows of the Convex dashboard's `_system/frontend/components:list` system query. Convex does not
document this query, so the rows are validated here. The root app row has `name: null` and
`path: ""`. Nested component paths join instance names with `/`, such as `workflow/workpool`.

@see https://github.com/get-convex/convex-backend/blob/5a633b42800113d393f0db162f8fc67f5bf01e14/npm-packages/system-udfs/convex/_system/frontend/components.ts#L4-L40
*/
const sureConvexComponentRows = sureArray(
  sureObject({
    id: sureString,
    name: sureUnion(sureString, sureNil),
    path: sureString,
    state: sureUnion(sureLiteral("active"), sureLiteral("unmounted")),
  }),
);

/** Reads the component tree of the project's production deployment. */
export const observe = action({
  access: "access_dashboard",
  args: {
    repositoryId: id("repositories"),
    convexProjectId: id("repositoryConvexProjects"),
  },
  returns: vConvexComponentsObservation,
  handler: async (ctx, args): Promise<ConvexComponentsObservation> => {
    const target = await ctx.runQuery(internal.repository.convexDeploymentInspection.readTarget, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
      convexProjectId: args.convexProjectId,
    });
    const deployment = await readConvexProductionDeployment({
      token: target.token,
      projectId: target.project.projectId,
    });
    if (!deployment) {
      throw new Error("Convex project has no production deployment.");
    }

    const response = await withConvexInspectionDeployKey(
      { deployment, purpose: "components", target },
      async (deployKey) =>
        await fetchConvexSystemQuery({
          deployKey,
          deploymentUrl: deployment.deploymentUrl,
          path: "_system/frontend/components:list",
          queryArgs: {},
        }),
    );
    const [valid, rows] = sureConvexComponentRows(response?.value);
    if (!valid) {
      throw new Error("Convex returned an unexpected component list.");
    }

    return {
      deploymentName: deployment.name,
      components: rows
        .flatMap((row) =>
          row.name === null
            ? []
            : [{ id: row.id, name: row.name, path: row.path, state: row.state }],
        )
        .sort((left, right) => left.path.localeCompare(right.path)),
    };
  },
});

import {
  array as sureArray,
  literal as sureLiteral,
  nil as sureNil,
  number as sureNumber,
  object as sureObject,
  optional as sureOptional,
  string as sureString,
  tuple as sureTuple,
  union as sureUnion,
  unknown as sureUnknown,
} from "@samebase/sure";
import { Infer, v } from "convex/values";
import { action } from "../functions";
import { isRecord } from "../jsonUtils";
import { readAlchemyStacks, readProductionConvexDeployments } from "./alchemyState";
import { readConvexProductionDeployment } from "./convexProjectResources";
import { fieldsFromDeclaredDocumentType, readDeclaredTables } from "./convexDeclaredSchema";
import {
  fetchConvexSystemQueryBatch,
  readConvexInspectionTarget,
  withConvexInspectionDeployKey,
  type ConvexInspectionTarget,
} from "./convexDeploymentInspection";

const { array, boolean, id, literal, number, object, string, union } = v;

const vConvexComponentsObservation = object({
  deploymentName: string(),
  components: array(
    object({
      id: string(),
      name: string(),
      path: string(),
      state: union(literal("active"), literal("unmounted")),
      httpPrefix: union(string(), v.null()),
      fileCount: number(),
      tables: array(
        object({
          name: string(),
          documentCount: number(),
          /** `null` when the component schema does not declare the table. */
          schema: union(
            object({
              fields: array(object({ path: string(), kind: string(), optional: boolean() })),
              indexes: array(object({ name: string(), fields: array(string()) })),
            }),
            v.null(),
          ),
        }),
      ),
      functions: array(
        object({ module: string(), name: string(), type: string(), visibility: string() }),
      ),
      crons: array(object({ name: string(), functionPath: string(), schedule: string() })),
    }),
  ),
});
type ConvexComponentsObservation = Infer<typeof vConvexComponentsObservation>;

/**
Convex does not document the dashboard system queries below, so their results are validated here.
The root app row of `components:list` has `name: null` and `path: ""`. Nested component paths join
instance names with `/`, such as `workflow/workpool`.

@see https://github.com/get-convex/convex-backend/blob/5a633b42800113d393f0db162f8fc67f5bf01e14/npm-packages/system-udfs/convex/_system/frontend/components.ts#L4-L40
@see https://github.com/get-convex/convex-backend/blob/5a633b42800113d393f0db162f8fc67f5bf01e14/npm-packages/system-udfs/convex/_system/frontend/modules.ts#L15-L41
*/
const sureComponentRows = sureArray(
  sureObject({
    id: sureString,
    name: sureUnion(sureString, sureNil),
    path: sureString,
    state: sureUnion(sureLiteral("active"), sureLiteral("unmounted")),
    httpPrefix: sureUnion(sureString, sureNil),
  }),
);
/** `cronSpecs[].udfArgs` holds the literal cron arguments, which can be secrets, so it is not read. */
const sureModulesByComponent = sureArray(
  sureTuple([
    sureUnion(sureString, sureNil),
    sureArray(
      sureTuple([
        sureString,
        sureObject({
          functions: sureArray(
            sureObject({
              name: sureString,
              udfType: sureString,
              visibility: sureObject({ kind: sureString }),
            }),
          ),
          cronSpecs: sureOptional(
            sureArray(
              sureTuple([
                sureString,
                sureObject({ udfPath: sureString, cronSchedule: sureUnknown }),
              ]),
            ),
          ),
        }),
      ]),
    ),
  ]),
);
const sureTableNames = sureArray(sureString);
/** `active` is the deployed schema as JSON text; it is missing when the component declares no schema. */
const sureSchemas = sureArray(sureObject({ active: sureOptional(sureString) }));
const sureCounts = sureArray(sureNumber);

/**
Reads the components of `deploymentName` with their functions, crons, tables, and files. The
deployment must be the production deployment of a Convex project attached to the repository, or of
a project that the production stage of the repository's Alchemy stack deploys.
*/
/**
The Convex projects that the production stages of the repository stacks deploy as `deploymentName`
in the team of the repository.
*/
async function readStackProjectIds(
  target: ConvexInspectionTarget,
  deploymentName: string,
): Promise<string[]> {
  // A store that cannot be read proves no deployment, like a team without a store.
  const read = await readAlchemyStacks({
    repository: target.githubRepositoryFullName,
    target,
  }).catch(() => ({ store: "missing" as const }));
  return read.store === "missing"
    ? []
    : readProductionConvexDeployments(read.stacks).flatMap((deployment) =>
        deployment.deploymentName === deploymentName &&
        (deployment.teamId === null || deployment.teamId === target.teamId)
          ? [deployment.projectId]
          : [],
      );
}

export const observe = action({
  access: "access_dashboard",
  args: {
    repositoryId: id("repositories"),
    deploymentName: string(),
  },
  returns: vConvexComponentsObservation,
  handler: async (ctx, args): Promise<ConvexComponentsObservation> => {
    const target = await readConvexInspectionTarget(ctx, {
      repositoryId: args.repositoryId,
      userId: ctx.viewer.userId,
    });
    // A failed lookup of another project must not block a deployment that matched.
    const readDeployments = async (projectIds: readonly string[]) =>
      await Promise.allSettled(
        projectIds.map(
          async (projectId) =>
            await readConvexProductionDeployment({ token: target.token, projectId }),
        ),
      );
    const findDeployment = (lookups: Awaited<ReturnType<typeof readDeployments>>) =>
      lookups
        .flatMap((lookup) => (lookup.status === "fulfilled" && lookup.value ? [lookup.value] : []))
        .find((candidate) => candidate.name === args.deploymentName);
    const attachedLookups = await readDeployments(
      target.projects.map((project) => project.projectId),
    );
    const stackLookups = findDeployment(attachedLookups)
      ? []
      : await readDeployments(await readStackProjectIds(target, args.deploymentName));
    const lookups = [...attachedLookups, ...stackLookups];
    const deployment = findDeployment(lookups);
    if (!deployment) {
      const failedLookup = lookups.find((lookup) => lookup.status === "rejected");
      if (failedLookup) {
        throw failedLookup.reason;
      }
      throw new Error("This repository has no Convex production deployment with this name.");
    }

    const components = await withConvexInspectionDeployKey(
      { deployment, purpose: "components", target },
      async (deployKey) => {
        const query = async (queries: { path: string; args: Record<string, unknown> }[]) =>
          queries.length === 0
            ? []
            : await fetchConvexSystemQueryBatch({
                deployKey,
                deploymentUrl: deployment.deploymentUrl,
                queries,
              });

        const [rowsValue, modulesValue] = await query([
          { path: "_system/frontend/components:list", args: {} },
          { path: "_system/frontend/modules:listForAllComponents", args: {} },
        ]);
        const [validRows, rows] = sureComponentRows(rowsValue);
        const [validModules, modulesByComponent] = sureModulesByComponent(modulesValue);
        if (!validRows || !validModules) {
          throw new Error("Convex returned an unexpected component list.");
        }
        const componentRows = rows
          .flatMap((row) => (row.name === null ? [] : [{ ...row, name: row.name }]))
          .sort((left, right) => left.path.localeCompare(right.path));

        const [tableMappingValues, fileCountValues, schemaValues] = await Promise.all([
          query(
            componentRows.map((row) => ({
              path: "_system/frontend/getTableMapping:default",
              args: { componentId: row.id },
            })),
          ),
          query(
            componentRows.map((row) => ({
              path: "_system/frontend/fileStorageV2:numFiles",
              args: { componentId: row.id },
            })),
          ),
          query(
            componentRows.map((row) => ({
              path: "_system/frontend/getSchemas:default",
              args: { componentId: row.id },
            })),
          ),
        ]);
        const [validSchemas, schemas] = sureSchemas(schemaValues);
        if (!validSchemas) {
          throw new Error("Convex returned an unexpected schema.");
        }
        const declaredTablesByComponent = schemas.map(({ active }) => {
          const schema: unknown = active ? JSON.parse(active) : null;
          return readDeclaredTables(schema);
        });
        const [validFileCounts, fileCounts] = sureCounts(fileCountValues);
        if (!validFileCounts) {
          throw new Error("Convex returned an unexpected file count.");
        }
        const tableNamesByComponent = tableMappingValues.map((mapping) => {
          const [validTableNames, tableNames] = sureTableNames(
            isRecord(mapping) ? Object.values(mapping) : null,
          );
          if (!validTableNames) {
            throw new Error("Convex returned an unexpected table list.");
          }
          // System tables such as `_scheduled_jobs` have no `tableSize`; `numFiles` counts files.
          return tableNames
            .filter((tableName) => !tableName.startsWith("_"))
            .sort((left, right) => left.localeCompare(right));
        });

        const tables = componentRows.flatMap((row, index) =>
          tableNamesByComponent[index].map((tableName) => ({ componentId: row.id, tableName })),
        );
        const [validDocumentCounts, documentCounts] = sureCounts(
          await query(
            tables.map((table) => ({
              path: "_system/frontend/tableSize:default",
              args: { componentId: table.componentId, tableName: table.tableName },
            })),
          ),
        );
        if (!validDocumentCounts) {
          throw new Error("Convex returned an unexpected table size.");
        }

        return componentRows.map((row, index) => {
          const modules =
            modulesByComponent.find(([componentId]) => componentId === row.id)?.[1] ?? [];
          return {
            id: row.id,
            name: row.name,
            path: row.path,
            state: row.state,
            httpPrefix: row.httpPrefix,
            fileCount: fileCounts[index],
            tables: tables.flatMap((table, tableIndex) => {
              if (table.componentId !== row.id) {
                return [];
              }
              const declaredTable = declaredTablesByComponent[index].find(
                (candidate) => candidate.tableName === table.tableName,
              );
              return [
                {
                  name: table.tableName,
                  documentCount: documentCounts[tableIndex],
                  schema: declaredTable
                    ? {
                        fields: fieldsFromDeclaredDocumentType(declaredTable.documentType).map(
                          (field) => ({
                            path: field.path,
                            kind: field.kind,
                            optional: field.optional,
                          }),
                        ),
                        indexes: declaredTable.indexes,
                      }
                    : null,
                },
              ];
            }),
            functions: modules
              .flatMap(([module, { functions }]) =>
                functions.map((fn) => ({
                  module,
                  name: fn.name,
                  type: fn.udfType,
                  visibility: fn.visibility.kind,
                })),
              )
              .sort(
                (left, right) =>
                  left.module.localeCompare(right.module) || left.name.localeCompare(right.name),
              ),
            crons: modules
              .flatMap(([, { cronSpecs }]) =>
                (cronSpecs ?? []).map(([name, spec]) => ({
                  name,
                  functionPath: spec.udfPath,
                  schedule: JSON.stringify(spec.cronSchedule),
                })),
              )
              .sort((left, right) => left.name.localeCompare(right.name)),
          };
        });
      },
    );

    return { deploymentName: deployment.name, components };
  },
});

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@hey-api/openapi-ts";
import traverse from "json-schema-traverse";
import { isRecord } from "@samebase/dependent/main";

import { valibotResolvers } from "./lib/valibotResolvers.ts";
import { samebaseAppFilePath } from "../../../scripts/lib/trackedFilePath.ts";

const sourceUrl = "https://api.convex.dev/v1/openapi.json";
const convexManagementOpenApiSchemaId = "https://api.convex.dev/v1/openapi.json";
const appRoot = fileURLToPath(new URL("../", import.meta.url));
const openApiDocumentOutputPath = fileURLToPath(
  new URL(
    `../${samebaseAppFilePath("convex/convexManagementApi/openApi.generated.json")}`,
    import.meta.url,
  ),
);
const decimalPathsOutputPath = fileURLToPath(
  new URL(
    `../${samebaseAppFilePath("convex/convexManagementApi/responseDecimalPaths.generated.ts")}`,
    import.meta.url,
  ),
);
const sdkOutputPath = fileURLToPath(
  new URL("../convex/convexManagementApi/generated", import.meta.url),
);

/**
Convex publishes these identifiers as int64 schemas, but Samebase treats provider
IDs as opaque decimal strings so large values cannot lose precision in JS.
*/
const convexManagementDecimalIdSchemaNames = [
  "AccessTokenId",
  "CustomRoleId",
  "DeploymentId",
  "MemberId",
  "ProjectId",
  "TeamId",
] as const;
const convexManagementDecimalIdSchemaRefs = new Set(
  convexManagementDecimalIdSchemaNames.map((schemaName) => `#/components/schemas/${schemaName}`),
);

const convexManagementOperationMethods = ["get", "post", "patch"] as const;

type ConvexManagementOperationMethod = (typeof convexManagementOperationMethods)[number];

type ConvexManagementResponseNumberPathKind = "decimalId" | "safeNumber";

type ConvexManagementResponseNumberPath = {
  kind: ConvexManagementResponseNumberPathKind;
  path: string[];
};

type ConvexManagementResponseEntry = {
  method: ConvexManagementOperationMethod;
  path: string;
  decimalPaths: string[][];
};

const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`Failed to fetch ${sourceUrl}: ${response.status}`);
const documentJson = parseJsonSchemaDocument(await response.text());
const responseEntries = collectConvexManagementResponseEntries(documentJson);

function parseJsonSchemaDocument(documentText: string) {
  const payload: unknown = JSON.parse(documentText);
  if (
    isRecord(payload) &&
    typeof payload.openapi === "string" &&
    isRecord(payload.info) &&
    isRecord(payload.paths)
  )
    return payload;
  throw new Error(`${sourceUrl} did not return an OpenAPI document.`);
}

function normalizeConvexManagementIdSchemas(document: unknown) {
  const schemas = readRecordPath(document, ["components", "schemas"]);
  for (const schemaName of convexManagementDecimalIdSchemaNames) {
    const schema = schemas[schemaName];
    if (!isRecord(schema) || schema.type !== "integer" || schema.format !== "int64") {
      throw new Error(`${sourceUrl} schema ${schemaName} is no longer an int64 schema.`);
    }
    schemas[schemaName] = { description: schema.description, pattern: "^[0-9]+$", type: "string" };
  }
}

function readRecordPath(root: unknown, pathSegments: readonly string[]): Record<string, unknown> {
  let value = root;
  for (const segment of pathSegments) {
    if (!isRecord(value)) {
      throw new Error(`Expected ${pathSegments.join(".")} to be an object.`);
    }
    value = value[segment];
  }
  if (isRecord(value)) {
    return value;
  }
  throw new Error(`Expected ${pathSegments.join(".")} to be an object.`);
}

function collectConvexManagementResponseEntries(
  document: Record<string, unknown>,
): ConvexManagementResponseEntry[] {
  const paths = readRecordPath(document, ["paths"]);
  const entries: ConvexManagementResponseEntry[] = [];

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!isRecord(pathItem)) {
      throw new Error(`Expected path ${path} to be an object.`);
    }
    for (const method of convexManagementOperationMethods) {
      const operation = pathItem[method];
      if (operation === undefined) {
        continue;
      }
      if (!isRecord(operation)) {
        throw new Error(`Expected ${method.toUpperCase()} ${path} to be an object.`);
      }
      const schemas = readSuccessJsonResponseSchemas({
        method,
        operation,
        path,
      });
      entries.push({
        method,
        path,
        decimalPaths: collectConvexManagementDecimalPaths({
          document,
          method,
          path,
          schemas,
        }),
      });
    }
  }

  return entries;
}

function collectConvexManagementDecimalPaths(args: {
  document: Record<string, unknown>;
  method: ConvexManagementOperationMethod;
  path: string;
  schemas: Record<string, unknown>[];
}): string[][] {
  const numberPaths = new Map<string, ConvexManagementResponseNumberPath>();
  const endpointLabel = `${args.method.toUpperCase()} ${args.path}`;
  for (const schema of args.schemas) {
    collectConvexManagementDecimalPathsForSchema({
      document: args.document,
      endpointLabel,
      numberPaths,
      path: [],
      schema,
      seenRefs: new Set(),
    });
  }
  return Array.from(numberPaths.values())
    .filter((numberPath) => numberPath.kind === "decimalId")
    .map((numberPath) => numberPath.path)
    .sort(compareConvexManagementDecimalPaths);
}

function collectConvexManagementDecimalPathsForSchema(args: {
  document: Record<string, unknown>;
  endpointLabel: string;
  numberPaths: Map<string, ConvexManagementResponseNumberPath>;
  path: string[];
  schema: unknown;
  seenRefs: Set<string>;
}): void {
  if (!isRecord(args.schema)) {
    return;
  }

  const ref = args.schema["$ref"];
  if (typeof ref === "string") {
    if (convexManagementDecimalIdSchemaRefs.has(readConvexManagementLocalRef(ref))) {
      addConvexManagementResponseNumberPath({
        ...args,
        kind: "decimalId",
      });
      return;
    }

    if (args.seenRefs.has(ref)) {
      return;
    }
    const resolvedSchema = readConvexManagementOpenApiRef(args.document, ref);
    const nextSeenRefs = new Set(args.seenRefs);
    nextSeenRefs.add(ref);
    collectConvexManagementDecimalPathsForSchema({
      ...args,
      schema: resolvedSchema,
      seenRefs: nextSeenRefs,
    });
    return;
  }

  if (isConvexManagementNumericSchema(args.schema)) {
    addConvexManagementResponseNumberPath({
      ...args,
      kind: "safeNumber",
    });
  }

  const arrayItems = args.schema.items;
  if (arrayItems !== undefined) {
    collectConvexManagementDecimalPathsForSchema({
      ...args,
      path: [...args.path, "*"],
      schema: arrayItems,
    });
  }

  const properties = args.schema.properties;
  if (isRecord(properties)) {
    for (const [propertyName, propertySchema] of Object.entries(properties)) {
      collectConvexManagementDecimalPathsForSchema({
        ...args,
        path: [...args.path, propertyName],
        schema: propertySchema,
      });
    }
  }

  for (const key of ["oneOf", "anyOf", "allOf"]) {
    const schemas = args.schema[key];
    if (!Array.isArray(schemas)) {
      continue;
    }
    for (const schema of schemas) {
      collectConvexManagementDecimalPathsForSchema({
        ...args,
        schema,
      });
    }
  }

  const additionalProperties = args.schema.additionalProperties;
  if (isRecord(additionalProperties)) {
    collectConvexManagementDecimalPathsForSchema({
      ...args,
      path: [...args.path, "*"],
      schema: additionalProperties,
    });
  }
}

function addConvexManagementResponseNumberPath(args: {
  endpointLabel: string;
  kind: ConvexManagementResponseNumberPathKind;
  numberPaths: Map<string, ConvexManagementResponseNumberPath>;
  path: string[];
}): void {
  const key = formatConvexManagementDecimalPathKey(args.path);
  const existing = args.numberPaths.get(key);
  if (existing !== undefined && existing.kind !== args.kind) {
    throw new Error(
      `${args.endpointLabel} response schema uses ${formatConvexManagementDecimalPath(args.path)} as both ${formatConvexManagementResponseNumberPathKind(existing.kind)} and ${formatConvexManagementResponseNumberPathKind(args.kind)}.`,
    );
  }
  if (existing === undefined) {
    args.numberPaths.set(key, {
      kind: args.kind,
      path: args.path,
    });
  }
}

function isConvexManagementNumericSchema(schema: Record<string, unknown>): boolean {
  const type = schema.type;
  if (type === "integer" || type === "number") {
    return true;
  }
  return Array.isArray(type) && type.some((item) => item === "integer" || item === "number");
}

function readConvexManagementLocalRef(ref: string): string {
  const localRefPrefix = "#/";
  const documentRefPrefix = `${convexManagementOpenApiSchemaId}#/`;
  if (ref.startsWith(localRefPrefix)) {
    return ref;
  }
  if (ref.startsWith(documentRefPrefix)) {
    return `#/${ref.slice(documentRefPrefix.length)}`;
  }
  return ref;
}

function readConvexManagementOpenApiRef(document: Record<string, unknown>, ref: string): unknown {
  const localRef = readConvexManagementLocalRef(ref);
  if (!localRef.startsWith("#/")) {
    throw new Error(`Unsupported Convex Management OpenAPI ref ${ref}.`);
  }

  const segments = localRef.slice(2).split("/").map(unescapeJsonPointerSegment);
  let value: unknown = document;
  for (const segment of segments) {
    if (Array.isArray(value)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= value.length) {
        throw new Error(`Could not resolve Convex Management OpenAPI ref ${ref}.`);
      }
      value = value[index];
      continue;
    }
    if (!isRecord(value)) {
      throw new Error(`Could not resolve Convex Management OpenAPI ref ${ref}.`);
    }
    const nextValue = value[segment];
    if (nextValue === undefined) {
      throw new Error(`Could not resolve Convex Management OpenAPI ref ${ref}.`);
    }
    value = nextValue;
  }
  return value;
}

function unescapeJsonPointerSegment(segment: string): string {
  return segment.replaceAll("~1", "/").replaceAll("~0", "~");
}

function formatConvexManagementDecimalPathKey(path: readonly string[]): string {
  return path.join("\u0000");
}

function formatConvexManagementDecimalPath(path: readonly string[]): string {
  if (path.length === 0) {
    return "the root response";
  }
  return `/${path.join("/")}`;
}

function formatConvexManagementResponseNumberPathKind(
  kind: ConvexManagementResponseNumberPathKind,
): string {
  switch (kind) {
    case "decimalId":
      return "a decimal ID";
    case "safeNumber":
      return "a JavaScript-safe number";
  }
  kind satisfies never;
  return kind;
}

function compareConvexManagementDecimalPaths(left: readonly string[], right: readonly string[]) {
  return formatConvexManagementDecimalPathKey(left).localeCompare(
    formatConvexManagementDecimalPathKey(right),
  );
}

function readSuccessJsonResponseSchemas(args: {
  method: ConvexManagementOperationMethod;
  operation: Record<string, unknown>;
  path: string;
}): Record<string, unknown>[] {
  const responses = args.operation["responses"];
  if (!isRecord(responses)) {
    throw new Error(
      `Expected ${args.method.toUpperCase()} ${args.path} responses to be an object.`,
    );
  }

  const schemas: Record<string, unknown>[] = [];
  for (const [status, response] of Object.entries(responses)) {
    const statusCode = Number(status);
    if (!Number.isInteger(statusCode) || statusCode < 200 || statusCode > 299) {
      continue;
    }
    if (!isRecord(response)) {
      throw new Error(
        `Expected ${args.method.toUpperCase()} ${args.path} response ${status} to be an object.`,
      );
    }
    const content = response["content"];
    if (content === undefined) {
      continue;
    }
    if (!isRecord(content)) {
      throw new Error(
        `Expected ${args.method.toUpperCase()} ${args.path} response ${status} content to be an object.`,
      );
    }
    const jsonMediaType = content["application/json"];
    if (jsonMediaType === undefined) {
      continue;
    }
    if (!isRecord(jsonMediaType)) {
      throw new Error(
        `Expected ${args.method.toUpperCase()} ${args.path} response ${status} application/json media type to be an object.`,
      );
    }
    if (jsonMediaType["schema"] === undefined) {
      throw new Error(
        `Expected ${args.method.toUpperCase()} ${args.path} response ${status} application/json to have a schema.`,
      );
    }

    schemas.push({
      $ref: `${convexManagementOpenApiSchemaId}#/paths/${escapeJsonPointer(args.path)}/${args.method}/responses/${escapeJsonPointer(status)}/content/application~1json/schema`,
    });
  }

  return schemas;
}

function escapeJsonPointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

// Defaults describe provider behavior. The SDK validates the input but returns
// the original value. Formats were not checked by the previous AJV boundary.
function prepareSchema(schema: unknown) {
  if (isRecord(schema))
    traverse(schema, {
      cb: (node) => {
        delete node["default"];
        delete node["format"];
      },
    });
}

function visitSchemaContainers(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) visitSchemaContainers(item);
    return;
  }
  if (!isRecord(value)) return;
  if (value["in"] === "path" && (value["name"] === "team_id" || value["name"] === "project_id")) {
    // The client trims and checks decimal path IDs before sending the request.
    value["schema"] = { type: "string" };
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "example" || key === "examples" || key.startsWith("x-")) continue;
    if (key === "schema") prepareSchema(child);
    else visitSchemaContainers(child);
  }
}

writeFileSync(openApiDocumentOutputPath, `${JSON.stringify(documentJson, null, 2)}\n`);
const decimalPaths = Object.fromEntries(
  convexManagementOperationMethods.map((method) => [
    method.toUpperCase(),
    Object.fromEntries(
      responseEntries
        .filter((entry) => entry.method === method)
        .map((entry) => [entry.path, entry.decimalPaths]),
    ),
  ]),
);
writeFileSync(
  decimalPathsOutputPath,
  `// Generated from ${sourceUrl}. Do not edit by hand.

export type ConvexManagementResponseDecimalPath = readonly string[];

export const convexManagementResponseDecimalPaths = ${JSON.stringify(decimalPaths, null, 2)} as const;
`,
);

await createClient({
  input: openApiDocumentOutputPath,
  parser: {
    filters: {
      // Keep component validators for lossless-ID coverage without unused SDK methods.
      orphans: true,
      operations: {
        include: [
          "GET /token_details",
          "GET /teams/{team_id}/projects",
          "GET /teams/{team_id}/list_deployments",
          "GET /projects/{project_id}",
          "GET /projects/{project_id}/deployment",
          "GET /projects/{project_id}/list_deployments",
          "POST /teams/{team_id}/create_project",
          "POST /projects/{project_id}/create_deployment",
          "POST /projects/{project_id}/delete",
          "POST /deployments/{deployment_name}/create_deploy_key",
          "POST /deployments/{deployment_name}/delete_deploy_key",
          "POST /projects/{project_id}/create_preview_deploy_key",
          "POST /projects/{project_id}/delete_preview_deploy_key",
        ],
      },
    },
    patch: {
      input(document) {
        if (!("components" in document)) throw new Error("Expected a Convex OpenAPI 3 document.");
        normalizeConvexManagementIdSchemas(document);
        const components = document.components;
        for (const schema of Object.values(components?.schemas ?? {})) prepareSchema(schema);
        for (const container of [
          document.paths,
          components?.parameters,
          components?.headers,
          components?.requestBodies,
          components?.responses,
        ])
          visitSchemaContainers(container);
      },
    },
  },
  output: { path: sdkOutputPath },
  plugins: [
    "@hey-api/typescript",
    { name: "@hey-api/client-fetch", throwOnError: true },
    {
      name: "valibot",
      $resolvers: valibotResolvers,
    },
    {
      name: "@hey-api/sdk",
      client: false,
      validator: true,
      responseStyle: "data",
      operations: {
        strategy: "single",
        containerName: "ConvexManagement",
        methods: "static",
        nesting: (operation) => [operation.method.toUpperCase(), operation.path],
        methodName: { casing: "preserve" },
        segmentName: { casing: "preserve" },
      },
    },
  ],
});

execFileSync(
  "pnpm",
  ["exec", "vp", "fmt", sdkOutputPath, decimalPathsOutputPath, openApiDocumentOutputPath],
  {
    cwd: appRoot,
    stdio: "inherit",
  },
);

if (process.argv.includes("--verify")) {
  const outputs = [openApiDocumentOutputPath, sdkOutputPath, decimalPathsOutputPath];
  execFileSync("git", ["diff", "--exit-code", "HEAD", "--", ...outputs], {
    cwd: appRoot,
    stdio: "inherit",
  });
  const untracked = execFileSync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "--", ...outputs],
    {
      cwd: appRoot,
      encoding: "utf8",
    },
  );
  if (untracked.trim())
    throw new Error(`Convex Management API generation added untracked files:\n${untracked}`);
}

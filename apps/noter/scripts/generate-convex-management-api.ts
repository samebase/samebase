import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Ajv2020, type AnySchema } from "ajv/dist/2020.js";
import { standaloneCode } from "ajv/dist/standalone/index.js";
import openapiTS, {
  astToString,
  COMMENT_HEADER,
  STRING,
  type OpenAPI3,
  type SchemaObject,
  type TransformNodeOptions,
} from "openapi-typescript";

const sourceUrl = "https://api.convex.dev/v1/openapi.json";
const convexManagementOpenApiSchemaId =
  "https://api.convex.dev/v1/openapi.json";
const appRoot = fileURLToPath(new URL("../", import.meta.url));
const openApiDocumentOutputPath = fileURLToPath(
  new URL(
    "../convex/convexManagementApi/openApi.generated.json",
    import.meta.url,
  ),
);
const validatorsOutputPath = fileURLToPath(
  new URL(
    "../convex/convexManagementApi/validators.generated.js",
    import.meta.url,
  ),
);
const validatorTypesOutputPath = fileURLToPath(
  new URL(
    "../convex/convexManagementApi/validators.generated.d.ts",
    import.meta.url,
  ),
);
const typesOutputPath = "convex/convexManagementApi/types.generated.d.ts";
const typesOutputFilePath = fileURLToPath(
  new URL(`../${typesOutputPath}`, import.meta.url),
);
const generatedFormatPaths = [
  "convex/convexManagementApi/openApi.generated.json",
  typesOutputPath,
  "convex/convexManagementApi/validators.generated.js",
  "convex/convexManagementApi/validators.generated.d.ts",
];
const convexManagementDecimalIdSchemaNames = [
  "DeploymentId",
  "MemberId",
  "ProjectId",
  "TeamId",
] as const;
const convexManagementDecimalIdSchemaRefs = new Set(
  convexManagementDecimalIdSchemaNames.map(
    (schemaName) => `#/components/schemas/${schemaName}`,
  ),
);
const convexManagementOperationMethods = ["get", "post"] as const;
type ConvexManagementOperationMethod =
  (typeof convexManagementOperationMethods)[number];
type ConvexManagementResponseValidatorEntry = {
  method: ConvexManagementOperationMethod;
  path: string;
  operationId: string;
  exportName: string | null;
  schema: AnySchema | null;
  schemaId: string | null;
};

// openapi-fetch gives callsites compile-time path/body/response types, but it
// does not runtime-validate provider JSON. Convex cannot compile AJV schemas at
// request time, so this script emits standalone validators during generation.
const response = await fetch(sourceUrl);
if (!response.ok) {
  throw new Error(`Failed to fetch ${sourceUrl}: ${response.status}`);
}

const documentText = await response.text();
const documentJson = parseJsonSchemaDocument(documentText);
const validationDocumentJson =
  normalizeConvexManagementValidationDocument(documentJson);
const responseValidatorEntries =
  collectConvexManagementResponseValidatorEntries(documentJson);
const ajv = new Ajv2020({
  allErrors: true,
  code: { esm: true, source: true },
  strict: false,
  validateSchema: false,
});
ajv.addFormat("int32", true);
ajv.addFormat("int64", true);
const validatorSchemaIds = buildConvexManagementValidatorSchemaIds(
  responseValidatorEntries,
);

function parseJsonSchemaDocument(documentText: string): OpenAPI3 {
  const payload: unknown = JSON.parse(documentText);
  if (isOpenApiDocument(payload)) {
    return payload;
  }
  throw new Error(`${sourceUrl} did not return an OpenAPI document.`);
}

function isJsonSchemaDocument(payload: unknown): payload is AnySchema {
  return (
    typeof payload === "boolean" ||
    (!!payload && typeof payload === "object" && !Array.isArray(payload))
  );
}

function isOpenApiDocument(payload: unknown): payload is OpenAPI3 {
  return (
    isRecord(payload) &&
    typeof payload.openapi === "string" &&
    isRecord(payload.info)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeConvexManagementValidationDocument(
  document: OpenAPI3,
): AnySchema {
  const normalizedDocument: unknown = structuredClone(document);
  const schemas = readRecordPath(normalizedDocument, ["components", "schemas"]);

  for (const schemaName of convexManagementDecimalIdSchemaNames) {
    const schema = schemas[schemaName];
    if (!isConvexManagementInt64IdSchema(schema)) {
      throw new Error(
        `${sourceUrl} schema ${schemaName} is no longer an int64 schema.`,
      );
    }
    schemas[schemaName] = {
      description: schema.description,
      pattern: "^[0-9]+$",
      type: "string",
    };
  }

  if (isJsonSchemaDocument(normalizedDocument)) {
    return normalizedDocument;
  }
  throw new Error("Failed to build normalized Convex Management API schema.");
}

function readRecordPath(
  root: unknown,
  pathSegments: readonly string[],
): Record<string, unknown> {
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

function isConvexManagementInt64IdSchema(
  value: unknown,
): value is { description?: string; format: "int64"; type: "integer" } {
  return (
    isRecord(value) && value.type === "integer" && value.format === "int64"
  );
}

function collectConvexManagementResponseValidatorEntries(
  document: OpenAPI3,
): ConvexManagementResponseValidatorEntry[] {
  const paths = readRecordPath(document, ["paths"]);
  const entries: ConvexManagementResponseValidatorEntry[] = [];
  const usedExportNames = new Set<string>();

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
        throw new Error(
          `Expected ${method.toUpperCase()} ${path} to be an object.`,
        );
      }
      const operationId = operation["operationId"];
      if (typeof operationId !== "string" || !operationId) {
        throw new Error(
          `Expected ${method.toUpperCase()} ${path} to have an operationId.`,
        );
      }

      const schemas = readSuccessJsonResponseSchemas({
        method,
        operation,
        path,
      });
      const exportName =
        schemas.length === 0
          ? null
          : buildUniqueValidatorExportName({
              method,
              operationId,
              path,
              usedExportNames,
            });
      const schemaId =
        exportName === null
          ? null
          : `noter://convex-management-api/${exportName}`;

      entries.push({
        method,
        path,
        operationId,
        exportName,
        schema: combineJsonResponseSchemas(schemas),
        schemaId,
      });
    }
  }

  return entries;
}

function readSuccessJsonResponseSchemas(args: {
  method: ConvexManagementOperationMethod;
  operation: Record<string, unknown>;
  path: string;
}): AnySchema[] {
  const responses = args.operation["responses"];
  if (!isRecord(responses)) {
    throw new Error(
      `Expected ${args.method.toUpperCase()} ${args.path} responses to be an object.`,
    );
  }

  const schemas: AnySchema[] = [];
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

function combineJsonResponseSchemas(schemas: AnySchema[]): AnySchema | null {
  if (schemas.length === 0) {
    return null;
  }
  if (schemas.length === 1) {
    return schemas[0];
  }
  return { anyOf: schemas };
}

function escapeJsonPointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function buildUniqueValidatorExportName(args: {
  method: ConvexManagementOperationMethod;
  operationId: string;
  path: string;
  usedExportNames: Set<string>;
}): string {
  const operationName = toPascalIdentifier(args.operationId);
  const baseName = `ajv${operationName || "Operation"}Response`;
  if (!args.usedExportNames.has(baseName)) {
    args.usedExportNames.add(baseName);
    return baseName;
  }

  const fallbackName = `ajv${toPascalIdentifier(`${args.method} ${args.path}`)}Response`;
  if (!args.usedExportNames.has(fallbackName)) {
    args.usedExportNames.add(fallbackName);
    return fallbackName;
  }

  throw new Error(
    `Could not create a unique validator export for ${args.method.toUpperCase()} ${args.path}.`,
  );
}

function toPascalIdentifier(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join("");
}

function buildConvexManagementValidatorSchemaIds(
  entries: ConvexManagementResponseValidatorEntry[],
): Record<string, string> {
  const schemaIds: Record<string, string> = {};
  for (const entry of entries) {
    if (entry.exportName !== null && entry.schemaId !== null) {
      schemaIds[entry.exportName] = entry.schemaId;
    }
  }
  return schemaIds;
}

function formatConvexManagementResponseValidatorsJs(
  entries: ConvexManagementResponseValidatorEntry[],
): string {
  return `export const convexManagementResponseValidators = {
${formatConvexManagementResponseValidatorMethodJs(entries, "get")}
${formatConvexManagementResponseValidatorMethodJs(entries, "post")}
};
`;
}

function formatConvexManagementResponseValidatorMethodJs(
  entries: ConvexManagementResponseValidatorEntry[],
  method: ConvexManagementOperationMethod,
): string {
  const methodEntries = entries.filter((entry) => entry.method === method);
  return `  ${method.toUpperCase()}: {
${methodEntries
  .map((entry) => {
    const value = entry.exportName ?? "null";
    return `    ${JSON.stringify(entry.path)}: ${value},`;
  })
  .join("\n")}
  },
`;
}

function formatConvexManagementResponseValidatorsDts(
  entries: ConvexManagementResponseValidatorEntry[],
): string {
  return `export const convexManagementResponseValidators: {
${formatConvexManagementResponseValidatorMethodDts(entries, "get")}
${formatConvexManagementResponseValidatorMethodDts(entries, "post")}
};
`;
}

function formatConvexManagementResponseValidatorMethodDts(
  entries: ConvexManagementResponseValidatorEntry[],
  method: ConvexManagementOperationMethod,
): string {
  const methodEntries = entries.filter((entry) => entry.method === method);
  return `  ${method.toUpperCase()}: {
${methodEntries
  .map((entry) => {
    const value =
      entry.exportName === null
        ? "null"
        : `AjvStandaloneValidateFunction<SuccessResponseJSON<operations[${JSON.stringify(entry.operationId)}]>>`;
    return `    ${JSON.stringify(entry.path)}: ${value};`;
  })
  .join("\n")}
  };
`;
}

function transformConvexManagementOpenApiType(
  schemaObject: SchemaObject,
  options: TransformNodeOptions,
) {
  if (
    options.path &&
    convexManagementDecimalIdSchemaRefs.has(options.path) &&
    schemaObject.type === "integer" &&
    schemaObject.format === "int64"
  ) {
    return STRING;
  }
  return undefined;
}

writeFileSync(
  openApiDocumentOutputPath,
  `${JSON.stringify(documentJson, null, 2)}\n`,
);

const openApiTypeAst = await openapiTS(documentJson, {
  rootTypes: true,
  rootTypesNoSchemaPrefix: true,
  transform: transformConvexManagementOpenApiType,
});
writeFileSync(
  typesOutputFilePath,
  `${COMMENT_HEADER}${astToString(openApiTypeAst)}\n`,
);

ajv.addSchema(validationDocumentJson, convexManagementOpenApiSchemaId);
for (const entry of responseValidatorEntries) {
  if (entry.schema !== null && entry.schemaId !== null) {
    ajv.addSchema(entry.schema, entry.schemaId);
  }
}

writeFileSync(
  validatorsOutputPath,
  `// Generated from ${sourceUrl}. Do not edit by hand.\n/* eslint-disable */\n\n${standaloneCode(ajv, validatorSchemaIds)}\n${formatConvexManagementResponseValidatorsJs(responseValidatorEntries)}`,
);
writeFileSync(
  validatorTypesOutputPath,
  `// Generated from ${sourceUrl}. Do not edit by hand.\n\nimport type { SuccessResponseJSON } from "openapi-typescript-helpers";\nimport type { operations } from "./types.generated";\n\nexport type AjvStandaloneValidationError = {\n  instancePath: string;\n  keyword?: string;\n  message?: string;\n  params?: unknown;\n};\n\nexport type AjvStandaloneValidateFunction<T> = {\n  (payload: unknown): payload is T;\n  errors: AjvStandaloneValidationError[] | null;\n};\n\n${formatConvexManagementResponseValidatorsDts(responseValidatorEntries)}`,
);

execFileSync("pnpm", ["exec", "vp", "fmt", ...generatedFormatPaths], {
  cwd: appRoot,
  stdio: "inherit",
});

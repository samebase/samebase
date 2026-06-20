import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Ajv2020, type AnySchema } from "ajv/dist/2020.js";
import { standaloneCode } from "ajv/dist/standalone/index.js";
import openapiTS, { astToString, COMMENT_HEADER, type OpenAPI3 } from "openapi-typescript";
import { includes, isRecord } from "@noter-md/dependent/main";

import { samebaseAppFilePath } from "../../../scripts/lib/trackedFilePath.ts";

const sourceUrl = "https://raw.githubusercontent.com/cloudflare/api-schemas/main/openapi.json";
const sourceFetchTimeoutMs = 30_000;
const cloudflareApiOpenApiSchemaId = "samebase://cloudflare-api/openApi.generated.json";
const appRoot = fileURLToPath(new URL("../", import.meta.url));
const openApiDocumentOutputPath = fileURLToPath(
  new URL(
    `../${samebaseAppFilePath("convex/cloudflareApi/openApi.generated.json")}`,
    import.meta.url,
  ),
);
const validatorsOutputPath = fileURLToPath(
  new URL(
    `../${samebaseAppFilePath("convex/cloudflareApi/validators.generated.js")}`,
    import.meta.url,
  ),
);
const validatorTypesOutputPath = fileURLToPath(
  new URL(
    `../${samebaseAppFilePath("convex/cloudflareApi/validators.generated.d.ts")}`,
    import.meta.url,
  ),
);
const typesOutputPath = samebaseAppFilePath("convex/cloudflareApi/types.generated.d.ts");
const typesOutputFilePath = fileURLToPath(new URL(`../${typesOutputPath}`, import.meta.url));
const generatedFormatPaths = [
  samebaseAppFilePath("convex/cloudflareApi/openApi.generated.json"),
  typesOutputPath,
  samebaseAppFilePath("convex/cloudflareApi/validators.generated.js"),
  samebaseAppFilePath("convex/cloudflareApi/validators.generated.d.ts"),
];
const cloudflareApiFamilyPathPrefixes = [
  "/accounts/{account_id}/workers",
  "/accounts/{account_id}/builds",
] as const;
const cloudflareApiExactPaths = ["/accounts", "/user/tokens/verify"] as const;
const cloudflareApiOperationMethods = ["delete", "get", "patch", "post", "put"] as const;
const ajvIgnoredFormats = [
  "binary",
  "byte",
  "date",
  "date-time",
  "double",
  "email",
  "float",
  "hostname",
  "int32",
  "int64",
  "ipv4",
  "ipv6",
  "uri",
  "uuid",
] as const;

type JsonRecord = Record<string, unknown>;
type OpenAPI3WithPaths = OpenAPI3 & {
  paths: NonNullable<OpenAPI3["paths"]>;
};
type CloudflareApiOperationMethod = (typeof cloudflareApiOperationMethods)[number];
type CloudflareApiResponseValidatorEntry = {
  method: CloudflareApiOperationMethod;
  path: string;
  operationId: string;
  exportName: string | null;
  schema: AnySchema | null;
  schemaId: string | null;
};

// The full Cloudflare schema covers every product. Noter pins a generated
// family subset so Workers/Builds additions drift visibly without pulling
// unrelated Cloudflare products into this boundary.
const response = await fetch(sourceUrl, {
  signal: AbortSignal.timeout(sourceFetchTimeoutMs),
});
if (!response.ok) {
  throw new Error(`Failed to fetch ${sourceUrl}: ${response.status}`);
}

const documentText = await response.text();
const documentJson = parseJsonSchemaDocument(documentText);
const subsetDocumentJson = buildCloudflareApiSubsetDocument(documentJson);
const typeDocumentJson = normalizeCloudflareApiTypeDocument(subsetDocumentJson);
const validationDocumentJson = normalizeCloudflareApiValidationDocument(subsetDocumentJson);
const responseValidatorEntries = collectCloudflareApiResponseValidatorEntries(subsetDocumentJson);
const ajv = new Ajv2020({
  allErrors: true,
  code: { esm: true, source: true },
  strict: false,
  validateSchema: false,
});
for (const format of ajvIgnoredFormats) {
  ajv.addFormat(format, true);
}
const validatorSchemaIds = buildCloudflareApiValidatorSchemaIds(responseValidatorEntries);

function parseJsonSchemaDocument(documentText: string): OpenAPI3WithPaths {
  const payload: unknown = JSON.parse(documentText);
  if (isOpenApiDocument(payload)) {
    return payload;
  }
  throw new Error(`${sourceUrl} did not return an OpenAPI document.`);
}

// eslint-disable-next-line noter/no-hand-written-type-predicate -- index-signature schema shape over unknown: control flow earns only boolean | object, never ajv's AnySchema object shape
function isJsonSchemaDocument(payload: unknown): payload is AnySchema {
  return (
    typeof payload === "boolean" ||
    (!!payload && typeof payload === "object" && !Array.isArray(payload))
  );
}

// eslint-disable-next-line noter/no-hand-written-type-predicate -- fetched-document interface over unknown: the probes witness openapi/info/paths as records, never the nested OpenAPI3 interface
function isOpenApiDocument(payload: unknown): payload is OpenAPI3WithPaths {
  return (
    isRecord(payload) &&
    typeof payload.openapi === "string" &&
    isRecord(payload.info) &&
    isRecord(payload.paths)
  );
}

function readOptionalString(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function normalizeCloudflareApiValidationDocument(document: OpenAPI3): AnySchema {
  const normalizedDocument: unknown = structuredClone(document);
  normalizeOpenApiSchemaKeywords(normalizedDocument);

  if (isJsonSchemaDocument(normalizedDocument)) {
    return normalizedDocument;
  }
  throw new Error("Failed to build normalized Cloudflare API schema.");
}

function normalizeCloudflareApiTypeDocument(document: OpenAPI3): OpenAPI3 {
  const normalizedDocument: unknown = structuredClone(document);
  removeAdditionalPropertiesFalse(normalizedDocument);

  if (isOpenApiDocument(normalizedDocument)) {
    return normalizedDocument;
  }
  throw new Error("Failed to build Cloudflare API type document.");
}

function removeAdditionalPropertiesFalse(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      removeAdditionalPropertiesFalse(item);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }

  // Cloudflare has request bodies, including Worker creation, that compose
  // response-shaped schemas with additionalProperties: false. That generates
  // impossible openapi-fetch body types, while AJV still validates responses
  // against the unmodified subset document.
  if (value["additionalProperties"] === false) {
    delete value["additionalProperties"];
  }

  for (const item of Object.values(value)) {
    removeAdditionalPropertiesFalse(item);
  }
}

function normalizeOpenApiSchemaKeywords(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      normalizeOpenApiSchemaKeywords(item);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }

  normalizeOpenApiExclusiveLimit({
    record: value,
    exclusiveKey: "exclusiveMinimum",
    inclusiveKey: "minimum",
  });
  normalizeOpenApiExclusiveLimit({
    record: value,
    exclusiveKey: "exclusiveMaximum",
    inclusiveKey: "maximum",
  });

  for (const item of Object.values(value)) {
    normalizeOpenApiSchemaKeywords(item);
  }
}

function normalizeOpenApiExclusiveLimit(args: {
  record: JsonRecord;
  exclusiveKey: "exclusiveMaximum" | "exclusiveMinimum";
  inclusiveKey: "maximum" | "minimum";
}): void {
  const exclusiveValue = args.record[args.exclusiveKey];
  if (typeof exclusiveValue !== "boolean") {
    return;
  }

  if (exclusiveValue) {
    const inclusiveValue = args.record[args.inclusiveKey];
    if (typeof inclusiveValue !== "number") {
      throw new Error(
        `Cloudflare API schema has ${args.exclusiveKey}: true without numeric ${args.inclusiveKey}.`,
      );
    }
    args.record[args.exclusiveKey] = inclusiveValue;
    delete args.record[args.inclusiveKey];
    return;
  }

  delete args.record[args.exclusiveKey];
}

function buildCloudflareApiSubsetDocument(document: OpenAPI3WithPaths): OpenAPI3 {
  const selectedPaths = collectSelectedCloudflareApiPaths(document);
  ensureCloudflareApiOperationIds(selectedPaths);
  const info = readCloudflareApiSubsetInfo(document);
  const subsetDocument: JsonRecord = {
    openapi: document.openapi,
    info,
    paths: selectedPaths,
    components: {},
  };

  if (document.servers !== undefined) {
    subsetDocument.servers = structuredClone(document.servers);
  }
  if (document.security !== undefined) {
    subsetDocument.security = structuredClone(document.security);
  }

  collectReferencedComponents({
    source: document,
    target: subsetDocument,
    root: selectedPaths,
  });
  normalizeObservedCloudflareApiResponseShapes(subsetDocument);

  if (isOpenApiDocument(subsetDocument)) {
    return subsetDocument;
  }
  throw new Error("Failed to build Cloudflare API subset document.");
}

function normalizeObservedCloudflareApiResponseShapes(document: JsonRecord) {
  // Cloudflare /accounts returns null for this field when no abuse contact
  // email is set, while the upstream schema currently declares only string.
  markSchemaNullable(
    document,
    "#/components/schemas/iam_account/properties/settings/properties/abuse_contact_email",
  );
  // Workers Builds operation schemas own the concrete result shape. The shared
  // envelope currently says result is an object, which rejects list endpoints
  // whose documented and observed result is an array.
  removeBuildsApiResponseResultShape(document);
}

function markSchemaNullable(document: JsonRecord, pointer: string): void {
  const schema = readJsonPointer(document, pointer);
  if (!isRecord(schema)) {
    throw new Error(`Expected Cloudflare API schema ${pointer} to be an object.`);
  }
  schema["nullable"] = true;
}

/**
 * Lets Workers Builds operations define their own `result` shapes.
 *
 * Cloudflare composes Builds responses with `allOf`: the shared
 * `builds_APIResponse` envelope plus an operation-specific schema. `allOf`
 * validates both schemas independently, so a shared `result: object` does not
 * get overridden by an endpoint's `result: array`; it makes array-list
 * responses impossible. Keep the shared schema to envelope fields only, then
 * let each operation's schema carry the concrete `result` contract.
 */
function removeBuildsApiResponseResultShape(document: JsonRecord): void {
  const schema = readRecordPath(document, ["components", "schemas", "builds_APIResponse"]);
  const properties = readRecordPath(schema, ["properties"]);
  delete properties["result"];

  const required = schema["required"];
  if (Array.isArray(required)) {
    schema["required"] = required.filter((field) => field !== "result");
  }
}

function ensureCloudflareApiOperationIds(paths: JsonRecord): void {
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!isRecord(pathItem)) {
      throw new Error(`Expected selected path ${path} to be an object.`);
    }

    for (const method of cloudflareApiOperationMethods) {
      const operation = pathItem[method];
      if (operation === undefined) {
        continue;
      }
      if (!isRecord(operation)) {
        throw new Error(`Expected ${method.toUpperCase()} ${path} to be an object.`);
      }
      const operationId = operation["operationId"];
      if (typeof operationId === "string" && operationId.length > 0) {
        continue;
      }

      operation["operationId"] = `samebase ${method} ${path}`;
    }
  }
}

function collectSelectedCloudflareApiPaths(document: OpenAPI3WithPaths): JsonRecord {
  const selectedPaths: JsonRecord = {};
  const entries = Object.entries(document.paths).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  for (const [path, pathItem] of entries) {
    if (!isSelectedCloudflareApiPath(path)) {
      continue;
    }
    selectedPaths[path] = structuredClone(pathItem);
  }

  if (Object.keys(selectedPaths).length === 0) {
    throw new Error("Cloudflare API subset did not match any paths.");
  }

  return selectedPaths;
}

function isSelectedCloudflareApiPath(path: string): boolean {
  return (
    includes(cloudflareApiExactPaths, path) ||
    cloudflareApiFamilyPathPrefixes.some((prefix) => path.startsWith(prefix))
  );
}

function readCloudflareApiSubsetInfo(document: OpenAPI3): JsonRecord {
  const sourceInfo = isRecord(document.info) ? document.info : {};
  return {
    title: "Cloudflare Samebase API Family Subset",
    version: readOptionalString(sourceInfo, "version") ?? "0.0.0",
    description:
      "Generated subset for Samebase-owned Cloudflare Workers and Workers Builds API families.",
  };
}

function collectReferencedComponents(args: {
  source: OpenAPI3;
  target: JsonRecord;
  root: unknown;
}): void {
  const seen = new Set<string>();

  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }
    if (!isRecord(value)) {
      return;
    }

    const ref = readOptionalString(value, "$ref");
    if (ref?.startsWith("#/components/") && !seen.has(ref)) {
      seen.add(ref);
      const resolved = readJsonPointer(args.source, ref);
      setJsonPointer(args.target, ref, resolved);
      visit(resolved);
    }

    for (const entry of Object.values(value)) {
      visit(entry);
    }
  }

  visit(args.root);
}

function readJsonPointer(root: unknown, pointer: string): unknown {
  if (!pointer.startsWith("#/")) {
    throw new Error(`Cloudflare API subset cannot resolve external ref ${pointer}.`);
  }

  let value = root;
  for (const segment of parseJsonPointerSegments(pointer)) {
    if (!isRecord(value)) {
      throw new Error(`Cloudflare API ref ${pointer} passed through a non-object.`);
    }
    value = value[segment];
  }

  if (value === undefined) {
    throw new Error(`Cloudflare API ref ${pointer} was not found.`);
  }
  return value;
}

function setJsonPointer(root: JsonRecord, pointer: string, value: unknown): void {
  const segments = parseJsonPointerSegments(pointer);
  let target = root;
  for (const segment of segments.slice(0, -1)) {
    const existing = target[segment];
    if (isRecord(existing)) {
      target = existing;
      continue;
    }

    const next: JsonRecord = {};
    target[segment] = next;
    target = next;
  }

  const finalSegment = segments[segments.length - 1];
  if (!finalSegment) {
    throw new Error(`Cloudflare API ref ${pointer} has no final segment.`);
  }
  target[finalSegment] = structuredClone(value);
}

function parseJsonPointerSegments(pointer: string): string[] {
  return pointer
    .slice(2)
    .split("/")
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function collectCloudflareApiResponseValidatorEntries(
  document: OpenAPI3,
): CloudflareApiResponseValidatorEntry[] {
  const paths = readRecordPath(document, ["paths"]);
  const entries: CloudflareApiResponseValidatorEntry[] = [];
  const usedExportNames = new Set<string>();

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!isRecord(pathItem)) {
      throw new Error(`Expected path ${path} to be an object.`);
    }
    for (const method of cloudflareApiOperationMethods) {
      const operation = pathItem[method];
      if (operation === undefined) {
        continue;
      }
      if (!isRecord(operation)) {
        throw new Error(`Expected ${method.toUpperCase()} ${path} to be an object.`);
      }
      const operationId = operation["operationId"];
      if (typeof operationId !== "string" || !operationId) {
        throw new Error(`Expected ${method.toUpperCase()} ${path} to have an operationId.`);
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
      const schemaId = exportName === null ? null : `samebase://cloudflare-api/${exportName}`;

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

function readRecordPath(root: unknown, pathSegments: readonly string[]): JsonRecord {
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

function readSuccessJsonResponseSchemas(args: {
  method: CloudflareApiOperationMethod;
  operation: JsonRecord;
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
      $ref: `${cloudflareApiOpenApiSchemaId}#/paths/${escapeJsonPointer(args.path)}/${args.method}/responses/${escapeJsonPointer(status)}/content/application~1json/schema`,
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
  method: CloudflareApiOperationMethod;
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

function buildCloudflareApiValidatorSchemaIds(
  entries: CloudflareApiResponseValidatorEntry[],
): Record<string, string> {
  const schemaIds: Record<string, string> = {};
  for (const entry of entries) {
    if (entry.exportName !== null && entry.schemaId !== null) {
      schemaIds[entry.exportName] = entry.schemaId;
    }
  }
  return schemaIds;
}

function formatCloudflareApiResponseValidatorsJs(
  entries: CloudflareApiResponseValidatorEntry[],
): string {
  return `export const cloudflareApiResponseValidators = {
${formatCloudflareApiResponseValidatorMethodJs(entries, "delete")}
${formatCloudflareApiResponseValidatorMethodJs(entries, "get")}
${formatCloudflareApiResponseValidatorMethodJs(entries, "patch")}
${formatCloudflareApiResponseValidatorMethodJs(entries, "post")}
${formatCloudflareApiResponseValidatorMethodJs(entries, "put")}
};
`;
}

function formatCloudflareApiResponseValidatorMethodJs(
  entries: CloudflareApiResponseValidatorEntry[],
  method: CloudflareApiOperationMethod,
): string {
  const methodEntries = entries.filter((entry) => entry.method === method);
  let validatorEntries = "";
  for (const entry of methodEntries) {
    const value = entry.exportName ?? "null";
    validatorEntries = `${validatorEntries}    ${JSON.stringify(entry.path)}: ${value},
`;
  }
  return `  ${method.toUpperCase()}: {
${validatorEntries}
  },
`;
}

function formatCloudflareApiResponseValidatorsDts(
  entries: CloudflareApiResponseValidatorEntry[],
): string {
  return `export const cloudflareApiResponseValidators: {
${formatCloudflareApiResponseValidatorMethodDts(entries, "delete")}
${formatCloudflareApiResponseValidatorMethodDts(entries, "get")}
${formatCloudflareApiResponseValidatorMethodDts(entries, "patch")}
${formatCloudflareApiResponseValidatorMethodDts(entries, "post")}
${formatCloudflareApiResponseValidatorMethodDts(entries, "put")}
};
`;
}

function formatCloudflareApiResponseValidatorMethodDts(
  entries: CloudflareApiResponseValidatorEntry[],
  method: CloudflareApiOperationMethod,
): string {
  const methodEntries = entries.filter((entry) => entry.method === method);
  let validatorEntries = "";
  for (const entry of methodEntries) {
    const value =
      entry.exportName === null
        ? "null"
        : `AjvStandaloneValidateFunction<SuccessResponseJSON<operations[${JSON.stringify(entry.operationId)}]>>`;
    validatorEntries = `${validatorEntries}    ${JSON.stringify(entry.path)}: ${value};
`;
  }
  return `  ${method.toUpperCase()}: {
${validatorEntries}
  };
`;
}

function formatCloudflareApiOpenApiTypes(
  openApiTypeAst: Awaited<ReturnType<typeof openapiTS>>,
): string {
  return astToString(openApiTypeAst)
    .replaceAll("$Read<any>", "$Read<unknown>")
    .replaceAll("$Write<any>", "$Write<unknown>");
}

writeFileSync(openApiDocumentOutputPath, `${JSON.stringify(subsetDocumentJson, null, 2)}\n`);

const openApiTypeAst = await openapiTS(typeDocumentJson, {
  emptyObjectsUnknown: true,
  readWriteMarkers: true,
  rootTypes: true,
  rootTypesNoSchemaPrefix: true,
});
writeFileSync(
  typesOutputFilePath,
  `${COMMENT_HEADER}${formatCloudflareApiOpenApiTypes(openApiTypeAst)}\n`,
);

ajv.addSchema(validationDocumentJson, cloudflareApiOpenApiSchemaId);
for (const entry of responseValidatorEntries) {
  if (entry.schema !== null && entry.schemaId !== null) {
    ajv.addSchema(entry.schema, entry.schemaId);
  }
}

writeFileSync(
  validatorsOutputPath,
  `// Generated from ${sourceUrl}. Do not edit by hand.\n/* eslint-disable */\n\n${standaloneCode(ajv, validatorSchemaIds)}\n${formatCloudflareApiResponseValidatorsJs(responseValidatorEntries)}`,
);
writeFileSync(
  validatorTypesOutputPath,
  `// Generated from ${sourceUrl}. Do not edit by hand.\n\nimport type { SuccessResponseJSON } from "openapi-typescript-helpers";\nimport type { operations } from "./types.generated";\n\nexport type AjvStandaloneValidationError = {\n  instancePath: string;\n  keyword?: string;\n  message?: string;\n  params?: unknown;\n};\n\nexport type AjvStandaloneValidateFunction<T> = {\n  (payload: unknown): payload is T;\n  errors: AjvStandaloneValidationError[] | null;\n};\n\n${formatCloudflareApiResponseValidatorsDts(responseValidatorEntries)}`,
);

execFileSync("pnpm", ["exec", "vp", "fmt", ...generatedFormatPaths], {
  cwd: appRoot,
  stdio: "inherit",
});
execFileSync("pnpm", ["exec", "vp", "check", "--fix", ...generatedFormatPaths], {
  cwd: appRoot,
  stdio: "inherit",
});

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
const ajv = new Ajv2020({
  allErrors: true,
  code: { esm: true, source: true },
  strict: false,
  validateSchema: false,
});
ajv.addFormat("int32", true);
ajv.addFormat("int64", true);

const validatorSchemaIds = {
  ajvPlatformTokenDetailsResponse:
    "noter://convex-management-api/PlatformTokenDetailsResponse",
  ajvPlatformProjectDetailsList:
    "noter://convex-management-api/PlatformProjectDetailsList",
  ajvPlatformCreateProjectResponse:
    "noter://convex-management-api/PlatformCreateProjectResponse",
  ajvPlatformDeploymentResponse:
    "noter://convex-management-api/PlatformDeploymentResponse",
  ajvPlatformDeploymentResponseList:
    "noter://convex-management-api/PlatformDeploymentResponseList",
  ajvPlatformCreateDeployKeyResponse:
    "noter://convex-management-api/PlatformCreateDeployKeyResponse",
  ajvConvexOAuthTokenResponse:
    "noter://convex-management-api/ConvexOAuthTokenResponse",
};

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
ajv.addSchema(
  {
    $ref: `${convexManagementOpenApiSchemaId}#/components/schemas/PlatformTokenDetailsResponse`,
  },
  validatorSchemaIds.ajvPlatformTokenDetailsResponse,
);
ajv.addSchema(
  {
    type: "array",
    items: {
      $ref: `${convexManagementOpenApiSchemaId}#/components/schemas/PlatformProjectDetails`,
    },
  },
  validatorSchemaIds.ajvPlatformProjectDetailsList,
);
ajv.addSchema(
  {
    $ref: `${convexManagementOpenApiSchemaId}#/components/schemas/PlatformCreateProjectResponse`,
  },
  validatorSchemaIds.ajvPlatformCreateProjectResponse,
);
ajv.addSchema(
  {
    $ref: `${convexManagementOpenApiSchemaId}#/components/schemas/PlatformDeploymentResponse`,
  },
  validatorSchemaIds.ajvPlatformDeploymentResponse,
);
ajv.addSchema(
  {
    type: "array",
    items: {
      $ref: `${convexManagementOpenApiSchemaId}#/components/schemas/PlatformDeploymentResponse`,
    },
  },
  validatorSchemaIds.ajvPlatformDeploymentResponseList,
);
ajv.addSchema(
  {
    $ref: `${convexManagementOpenApiSchemaId}#/components/schemas/PlatformCreateDeployKeyResponse`,
  },
  validatorSchemaIds.ajvPlatformCreateDeployKeyResponse,
);
ajv.addSchema(
  {
    type: "object",
    additionalProperties: true,
    required: ["access_token", "token_type"],
    properties: {
      access_token: { type: "string", pattern: "^.+$" },
      token_type: { const: "bearer" },
    },
  },
  validatorSchemaIds.ajvConvexOAuthTokenResponse,
);

writeFileSync(
  validatorsOutputPath,
  `// Generated from ${sourceUrl}. Do not edit by hand.\n/* eslint-disable */\n\n${standaloneCode(ajv, validatorSchemaIds)}\n`,
);
writeFileSync(
  validatorTypesOutputPath,
  `// Generated from ${sourceUrl}. Do not edit by hand.\n\nimport type {\n  PlatformCreateDeployKeyResponse,\n  PlatformCreateProjectResponse,\n  PlatformDeploymentResponse,\n  PlatformProjectDetails,\n  PlatformTokenDetailsResponse,\n} from "./types.generated";\nimport type { ConvexOAuthTokenResponse } from "./oauthToken";\n\nexport type AjvStandaloneValidationError = {\n  instancePath: string;\n  keyword?: string;\n  message?: string;\n  params?: unknown;\n};\n\nexport type AjvStandaloneValidateFunction<T> = {\n  (payload: unknown): payload is T;\n  errors: AjvStandaloneValidationError[] | null;\n};\n\nexport const ajvPlatformTokenDetailsResponse: AjvStandaloneValidateFunction<PlatformTokenDetailsResponse>;\nexport const ajvPlatformProjectDetailsList: AjvStandaloneValidateFunction<PlatformProjectDetails[]>;\nexport const ajvPlatformCreateProjectResponse: AjvStandaloneValidateFunction<PlatformCreateProjectResponse>;\nexport const ajvPlatformDeploymentResponse: AjvStandaloneValidateFunction<PlatformDeploymentResponse>;\nexport const ajvPlatformDeploymentResponseList: AjvStandaloneValidateFunction<PlatformDeploymentResponse[]>;\nexport const ajvPlatformCreateDeployKeyResponse: AjvStandaloneValidateFunction<PlatformCreateDeployKeyResponse>;\nexport const ajvConvexOAuthTokenResponse: AjvStandaloneValidateFunction<ConvexOAuthTokenResponse>;\n`,
);

execFileSync("pnpm", ["exec", "vp", "fmt", ...generatedFormatPaths], {
  cwd: appRoot,
  stdio: "inherit",
});

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import standaloneCode from "ajv/dist/standalone/index.js";

const sourceUrl = "https://api.convex.dev/v1/openapi.json";
const convexManagementOpenApiSchemaId =
  "https://api.convex.dev/v1/openapi.json";
const appRoot = fileURLToPath(new URL("../", import.meta.url));
const openApiOutputPath = fileURLToPath(
  new URL("../convex/convexManagementOpenApi.generated.ts", import.meta.url),
);
const validatorsOutputPath = fileURLToPath(
  new URL(
    "../convex/convexManagementApiValidators.generated.js",
    import.meta.url,
  ),
);
const validatorTypesOutputPath = fileURLToPath(
  new URL(
    "../convex/convexManagementApiValidators.generated.d.ts",
    import.meta.url,
  ),
);
const typesOutputPath = "convex/convexManagementApiTypes.generated.ts";

const response = await fetch(sourceUrl);
if (!response.ok) {
  throw new Error(`Failed to fetch ${sourceUrl}: ${response.status}`);
}

const documentText = await response.text();
const documentJson: unknown = JSON.parse(documentText);
const tempDir = mkdtempSync(path.join(tmpdir(), "noter-convex-openapi-"));
const tempOpenApiPath = path.join(tempDir, "openapi.json");
const ajv = new Ajv2020({
  allErrors: true,
  code: { esm: true, source: true },
  strict: false,
  validateSchema: false,
});
ajv.addFormat("int32", true);
ajv.addFormat("int64", true);

const validatorSchemaIds = {
  vPlatformTokenDetailsResponse:
    "noter://convex-management-api/PlatformTokenDetailsResponse",
  vPlatformProjectDetailsList:
    "noter://convex-management-api/PlatformProjectDetailsList",
  vPlatformCreateProjectResponse:
    "noter://convex-management-api/PlatformCreateProjectResponse",
  vPlatformDeploymentResponse:
    "noter://convex-management-api/PlatformDeploymentResponse",
  vPlatformDeploymentResponseList:
    "noter://convex-management-api/PlatformDeploymentResponseList",
  vPlatformCreateDeployKeyResponse:
    "noter://convex-management-api/PlatformCreateDeployKeyResponse",
  vConvexOAuthTokenResponse:
    "noter://convex-management-api/ConvexOAuthTokenResponse",
};

try {
  writeFileSync(tempOpenApiPath, `${JSON.stringify(documentJson, null, 2)}\n`);
  writeFileSync(
    openApiOutputPath,
    `// Generated from ${sourceUrl}. Do not edit by hand.\n\nexport const convexManagementOpenApiDocument: Record<string, unknown> = ${JSON.stringify(documentJson, null, 2)};\n`,
  );

  execFileSync(
    "pnpm",
    [
      "exec",
      "openapi-typescript",
      tempOpenApiPath,
      "--output",
      typesOutputPath,
      "--root-types",
      "--root-types-no-schema-prefix",
    ],
    { cwd: appRoot, stdio: "inherit" },
  );

  ajv.addSchema(documentJson, convexManagementOpenApiSchemaId);
  ajv.addSchema(
    {
      $ref: `${convexManagementOpenApiSchemaId}#/components/schemas/PlatformTokenDetailsResponse`,
    },
    validatorSchemaIds.vPlatformTokenDetailsResponse,
  );
  ajv.addSchema(
    {
      type: "array",
      items: {
        $ref: `${convexManagementOpenApiSchemaId}#/components/schemas/PlatformProjectDetails`,
      },
    },
    validatorSchemaIds.vPlatformProjectDetailsList,
  );
  ajv.addSchema(
    {
      $ref: `${convexManagementOpenApiSchemaId}#/components/schemas/PlatformCreateProjectResponse`,
    },
    validatorSchemaIds.vPlatformCreateProjectResponse,
  );
  ajv.addSchema(
    {
      $ref: `${convexManagementOpenApiSchemaId}#/components/schemas/PlatformDeploymentResponse`,
    },
    validatorSchemaIds.vPlatformDeploymentResponse,
  );
  ajv.addSchema(
    {
      type: "array",
      items: {
        $ref: `${convexManagementOpenApiSchemaId}#/components/schemas/PlatformDeploymentResponse`,
      },
    },
    validatorSchemaIds.vPlatformDeploymentResponseList,
  );
  ajv.addSchema(
    {
      $ref: `${convexManagementOpenApiSchemaId}#/components/schemas/PlatformCreateDeployKeyResponse`,
    },
    validatorSchemaIds.vPlatformCreateDeployKeyResponse,
  );
  ajv.addSchema(
    {
      type: "object",
      additionalProperties: true,
      required: ["access_token", "token_type"],
      properties: {
        access_token: { type: "string" },
        token_type: { type: "string" },
        refresh_token: { type: "string" },
        expires_in: { type: "integer", minimum: 0 },
        scope: { type: "string" },
      },
    },
    validatorSchemaIds.vConvexOAuthTokenResponse,
  );

  writeFileSync(
    validatorsOutputPath,
    `// Generated from ${sourceUrl}. Do not edit by hand.\n/* eslint-disable */\n\n${standaloneCode(ajv, validatorSchemaIds)}\n`,
  );
  writeFileSync(
    validatorTypesOutputPath,
    `// Generated from ${sourceUrl}. Do not edit by hand.\n\nimport type {\n  PlatformCreateDeployKeyResponse,\n  PlatformCreateProjectResponse,\n  PlatformDeploymentResponse,\n  PlatformProjectDetails,\n  PlatformTokenDetailsResponse,\n} from "./convexManagementApiTypes.generated";\nimport type { ConvexOAuthTokenResponse } from "./convexManagementApi";\n\nexport type StandaloneValidationError = {\n  instancePath: string;\n  message?: string;\n};\n\nexport type StandaloneValidateFunction<T> = {\n  (payload: unknown): payload is T;\n  errors: StandaloneValidationError[] | null;\n};\n\nexport const vPlatformTokenDetailsResponse: StandaloneValidateFunction<PlatformTokenDetailsResponse>;\nexport const vPlatformProjectDetailsList: StandaloneValidateFunction<PlatformProjectDetails[]>;\nexport const vPlatformCreateProjectResponse: StandaloneValidateFunction<PlatformCreateProjectResponse>;\nexport const vPlatformDeploymentResponse: StandaloneValidateFunction<PlatformDeploymentResponse>;\nexport const vPlatformDeploymentResponseList: StandaloneValidateFunction<PlatformDeploymentResponse[]>;\nexport const vPlatformCreateDeployKeyResponse: StandaloneValidateFunction<PlatformCreateDeployKeyResponse>;\nexport const vConvexOAuthTokenResponse: StandaloneValidateFunction<ConvexOAuthTokenResponse>;\n`,
  );
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

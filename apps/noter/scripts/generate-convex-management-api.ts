import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const sourceUrl = "https://api.convex.dev/v1/openapi.json";
const appRoot = fileURLToPath(new URL("../", import.meta.url));
const openApiDocumentOutputPath = fileURLToPath(
  new URL(
    "../convex/convexManagementApi/openApi.generated.json",
    import.meta.url,
  ),
);
const generatedOutputPath = fileURLToPath(
  new URL("../convex/convexManagementApi/generated", import.meta.url),
);
const heyApiConfigPath = fileURLToPath(
  new URL("../.tmp/convex-management-openapi-ts.config.mjs", import.meta.url),
);
const generatedOutputFormatPath = "convex/convexManagementApi/generated";
const openApiDocumentFormatPath =
  "convex/convexManagementApi/openApi.generated.json";
const generatedFormatPaths = [
  openApiDocumentFormatPath,
  generatedOutputFormatPath,
];
const generatedEslintDisablePaths = new Set([
  "client/client.gen.ts",
  "client/utils.gen.ts",
  "core/bodySerializer.gen.ts",
  "core/params.gen.ts",
  "core/pathSerializer.gen.ts",
  "core/queryKeySerializer.gen.ts",
  "core/serverSentEvents.gen.ts",
  "core/types.gen.ts",
  "core/utils.gen.ts",
  "sdk.gen.ts",
]);
const generatedImportRewrites = new Map([
  [
    "client.gen.ts",
    [
      [
        "import { type ClientOptions, type Config, createClient, createConfig } from './client';",
        `import { createClient } from './client/client.gen';
import type { ClientOptions, Config } from './client/types.gen';
import { createConfig } from './client/utils.gen';`,
      ],
    ],
  ],
  ["sdk.gen.ts", [["from './client'", "from './client/types.gen'"]]],
]);
const convexManagementDecimalIdSchemaNames = [
  "CustomRoleId",
  "DeploymentId",
  "MemberId",
  "ProjectId",
  "TeamId",
] as const;
const convexManagementOperationFilters = [
  "GET /token_details",
  "GET /teams/{team_id}/list_projects",
  "POST /teams/{team_id}/create_project",
  "GET /projects/{project_id}",
  "GET /projects/{project_id}/deployment",
  "GET /projects/{project_id}/list_deployments",
  "POST /projects/{project_id}/create_deployment",
  "POST /projects/{project_id}/delete",
  "GET /deployments/{deployment_name}",
  "POST /deployments/{deployment_name}/create_deploy_key",
  "POST /deployments/{deployment_name}/delete",
] as const;

// Hey API owns the typed SDK and response validators. The schema patch is the
// app boundary rule: provider IDs must arrive as decimal strings or fail closed.
const response = await fetch(sourceUrl);
if (!response.ok) {
  throw new Error(`Failed to fetch ${sourceUrl}: ${response.status}`);
}

const documentText = await response.text();
const documentJson = parseJsonDocument(documentText);
if (!isOpenApiDocument(documentJson)) {
  throw new Error(`${sourceUrl} did not return an OpenAPI document.`);
}

writeFileSync(
  openApiDocumentOutputPath,
  `${JSON.stringify(documentJson, null, 2)}\n`,
);

rmSync(generatedOutputPath, { force: true, recursive: true });
mkdirSync(dirname(heyApiConfigPath), { recursive: true });
writeFileSync(
  heyApiConfigPath,
  `const decimalIdSchemaNames = ${JSON.stringify(convexManagementDecimalIdSchemaNames)};

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function patchDecimalIdSchema(schema) {
  if (!isRecord(schema)) {
    throw new Error("Convex decimal ID schema patch expected an object schema.");
  }
  if (schema.type !== "integer" || schema.format !== "int64") {
    throw new Error("Convex decimal ID schemas must remain OpenAPI int64 schemas before the Hey API patch.");
  }

  schema.type = "string";
  schema.pattern = "^[0-9]+$";
  delete schema.format;
  delete schema.minimum;
  delete schema.maximum;
}

const decimalIdSchemaPatches = Object.fromEntries(
  decimalIdSchemaNames.map((schemaName) => [schemaName, patchDecimalIdSchema]),
);

export default {
  input: ${JSON.stringify(openApiDocumentOutputPath)},
  output: ${JSON.stringify(generatedOutputPath)},
  plugins: [
    "@hey-api/client-fetch",
    "zod",
    {
      name: "@hey-api/sdk",
      auth: true,
      validator: {
        response: "zod",
      },
    },
  ],
  parser: {
    filters: {
      operations: {
        include: ${JSON.stringify(convexManagementOperationFilters)},
      },
      orphans: false,
    },
    patch: {
      schemas: decimalIdSchemaPatches,
    },
  },
};
`,
);

try {
  execFileSync("pnpm", ["exec", "openapi-ts", "-f", heyApiConfigPath], {
    cwd: appRoot,
    stdio: "inherit",
  });
} finally {
  rmSync(heyApiConfigPath, { force: true });
}

for (const path of collectGeneratedTypeScriptPaths(generatedOutputPath)) {
  const relativePath = path.slice(`${generatedOutputPath}/`.length);
  const source = rewriteGeneratedImports({
    relativePath,
    source: readFileSync(path, "utf8"),
  });
  if (
    generatedEslintDisablePaths.has(relativePath) &&
    !source.includes("/* eslint-disable */")
  ) {
    writeFileSync(
      path,
      source.replace(
        "// This file is auto-generated by @hey-api/openapi-ts\n",
        "// This file is auto-generated by @hey-api/openapi-ts\n/* eslint-disable */\n",
      ),
    );
    continue;
  }
  writeFileSync(path, source);
}

execFileSync("pnpm", ["exec", "vp", "fmt", ...generatedFormatPaths], {
  cwd: appRoot,
  stdio: "inherit",
});

function parseJsonDocument(documentText: string): unknown {
  try {
    return JSON.parse(documentText);
  } catch (error) {
    throw new Error(
      `${sourceUrl} returned invalid JSON: ${error instanceof Error ? error.message : "parse failed"}`,
    );
  }
}

function isOpenApiDocument(payload: unknown): boolean {
  return (
    isRecord(payload) &&
    typeof payload.openapi === "string" &&
    isRecord(payload.info)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function collectGeneratedTypeScriptPaths(rootPath: string): string[] {
  const paths: string[] = [];
  for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
    const path = `${rootPath}/${entry.name}`;
    if (entry.isDirectory()) {
      paths.push(...collectGeneratedTypeScriptPaths(path));
    } else if (entry.isFile() && path.endsWith(".ts")) {
      paths.push(path);
    }
  }
  return paths.sort();
}

function rewriteGeneratedImports(args: {
  relativePath: string;
  source: string;
}): string {
  const replacements = generatedImportRewrites.get(args.relativePath);
  if (!replacements) {
    return args.source;
  }

  let rewritten = args.source;
  for (const [from, to] of replacements) {
    if (!rewritten.includes(from)) {
      throw new Error(
        `Generated ${args.relativePath} no longer contains expected import: ${from}`,
      );
    }
    rewritten = rewritten.replaceAll(from, to);
  }
  return rewritten;
}

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const HELP_TEXT = `Usage: node ./scripts/evaluate-hey-api-convex-management-api.ts

Generates an ignored Hey API client spike under .tmp and verifies the OpenAPI
response-validation behavior needed before replacing the current AJV path.`;

const decimalIdSchemaNames = [
  "CustomRoleId",
  "DeploymentId",
  "MemberId",
  "ProjectId",
  "TeamId",
] as const;

const appRoot = new URL("../", import.meta.url);
const sourceDocumentPath = fileURLToPath(
  new URL(
    "../convex/convexManagementApi/openApi.generated.json",
    import.meta.url,
  ),
);
const outputRootPath = fileURLToPath(
  new URL("../.tmp/hey-api-convex-management-api/", import.meta.url),
);
const configPath = `${outputRootPath}openapi-ts.config.mjs`;
const generatedClientPath = `${outputRootPath}client`;

if (process.argv.includes("--help")) {
  console.log(HELP_TEXT);
  process.exit(0);
}

if (!existsSync(sourceDocumentPath)) {
  throw new Error(`Missing OpenAPI document at ${sourceDocumentPath}.`);
}

rmSync(outputRootPath, { force: true, recursive: true });
mkdirSync(outputRootPath, { recursive: true });

writeFileSync(
  configPath,
  `const decimalIdSchemaNames = ${JSON.stringify(decimalIdSchemaNames)};

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
  input: ${JSON.stringify(sourceDocumentPath)},
  output: ${JSON.stringify(generatedClientPath)},
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
        include: [
          "GET /teams/{team_id}/list_projects",
          "GET /token_details",
        ],
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

execFileSync("pnpm", ["exec", "openapi-ts", "-f", configPath], {
  cwd: fileURLToPath(appRoot),
  stdio: "inherit",
});

const sdkSource = readGeneratedFile("sdk.gen.ts");
const zodSource = readGeneratedFile("zod.gen.ts");
const clientSource = readGeneratedFile("client/client.gen.ts");

assertIncludes({
  description: "SDK functions include generated response validators",
  haystack: sdkSource,
  needle:
    "responseValidator: async (data) => await zListProjectsResponse.parseAsync(data)",
});
assertIncludes({
  description: "TeamId schema is patched to a decimal string validator",
  haystack: zodSource,
  needle: "export const zTeamId = z.string().regex(/^[0-9]+$/);",
});
assertIncludes({
  description: "ProjectId schema is patched to a decimal string validator",
  haystack: zodSource,
  needle: "export const zProjectId = z.string().regex(/^[0-9]+$/);",
});
assertIncludes({
  description:
    "Generated fetch client still parses JSON with JSON.parse before validation",
  haystack: clientSource,
  needle: "data = text ? JSON.parse(text) : {};",
});

const generatedZod = await import(
  pathToFileURL(`${generatedClientPath}/zod.gen.ts`).href
);
const listProjectsResponse = readGeneratedSchema(
  generatedZod,
  "zListProjectsResponse",
);
const tokenDetailsResponse = readGeneratedSchema(
  generatedZod,
  "zGetTokenDetailsResponse",
);

const validProject = {
  createTime: 1_710_000_000_000,
  id: "9223372036854775807",
  name: "Noter",
  slug: "noter",
  teamId: "9223372036854775806",
  teamSlug: "noter-team",
};
const validTeamToken = {
  createTime: 1_710_000_000_000,
  name: "team token",
  teamId: "9223372036854775806",
  type: "teamToken",
};

assertSafeParse({
  description: "string project IDs pass generated response validation",
  expected: true,
  result: listProjectsResponse.safeParse([validProject]),
});
assertSafeParse({
  description: "numeric project IDs fail closed after the schema patch",
  expected: false,
  result: listProjectsResponse.safeParse([
    { ...validProject, id: Number.MAX_SAFE_INTEGER + 1 },
  ]),
});
assertSafeParse({
  description: "numeric team IDs fail closed after the schema patch",
  expected: false,
  result: listProjectsResponse.safeParse([
    { ...validProject, teamId: Number.MAX_SAFE_INTEGER + 1 },
  ]),
});
assertSafeParse({
  description: "string token team IDs pass generated response validation",
  expected: true,
  result: tokenDetailsResponse.safeParse(validTeamToken),
});
assertSafeParse({
  description: "numeric token team IDs fail closed after the schema patch",
  expected: false,
  result: tokenDetailsResponse.safeParse({
    ...validTeamToken,
    teamId: Number.MAX_SAFE_INTEGER + 1,
  }),
});

console.log(
  `Hey API Convex evaluation passed.

Generated client: ${generatedClientPath}

Result:
- Hey API can wire generated Zod response validators into generated SDK calls.
- Patched Convex provider ID schemas validate as decimal strings.
- Numeric provider IDs fail closed instead of becoming corrupted strings.
- The stock generated fetch client still uses JSON.parse before validation, so
  accepting numeric unsafe IDs would require a custom lossless parse path.`,
);

function readGeneratedFile(path: string): string {
  return readFileSync(`${generatedClientPath}/${path}`, "utf8");
}

function assertIncludes(args: {
  description: string;
  haystack: string;
  needle: string;
}): void {
  if (!args.haystack.includes(args.needle)) {
    throw new Error(`Hey API evaluation failed: ${args.description}.`);
  }
}

type SafeParseSchema = {
  safeParse(payload: unknown): SafeParseResult;
};

type SafeParseResult = {
  success: boolean;
};

function readGeneratedSchema(
  moduleRecord: unknown,
  name: string,
): SafeParseSchema {
  if (!isRecord(moduleRecord)) {
    throw new Error("Generated Zod module did not import as an object.");
  }

  const schema = moduleRecord[name];
  if (isSafeParseSchema(schema)) {
    return schema;
  }

  throw new Error(`Generated Zod module is missing ${name}.`);
}

function assertSafeParse(args: {
  description: string;
  expected: boolean;
  result: SafeParseResult;
}): void {
  if (args.result.success !== args.expected) {
    throw new Error(`Hey API evaluation failed: ${args.description}.`);
  }
}

function isSafeParseSchema(value: unknown): value is SafeParseSchema {
  return isRecord(value) && typeof value.safeParse === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

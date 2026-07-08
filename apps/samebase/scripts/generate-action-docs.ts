import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { array, boolean, isObject, object, optional, string, type InferGood } from "@samebase/sure";
import { createServer } from "vite";

import { formatWithVpFmt } from "../../../scripts/format-with-vp-fmt.ts";
import { samebaseAppFilePath } from "../../../scripts/lib/trackedFilePath.ts";
import {
  appInfo,
  negativeTestCases,
  testCases,
  toolJustifications,
} from "./chatgptAppSubmissionSource.ts";

/**
Renders the action catalog into every generated agent-facing surface (rfcs/093 Phase 2b):
public/docs/actions/<id>.md reference pages, public/llms.txt, and the root
chatgpt-app-submission.json. Run through `pnpm run generate:action-docs`;
`pnpm run verify:action-docs` guards drift in CI.
*/

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(currentDir, "..");
const repoRoot = path.resolve(appDir, "../..");
const actionsOutputDir = path.resolve(appDir, "public/docs/actions");
const llmsTxtPath = path.resolve(appDir, "public/llms.txt");
const submissionPath = path.resolve(repoRoot, "chatgpt-app-submission.json");

const actionContractSchema = object({
  id: string,
  access: string,
  doc: string,
  mcp: object({
    name: string,
    description: string,
    safety: string,
    annotations: object({
      readOnlyHint: boolean,
      openWorldHint: boolean,
      destructiveHint: boolean,
    }),
  }),
});
type ActionContractDoc = InferGood<typeof actionContractSchema>;

const toolJsonSchema = object({
  required: optional(array(string)),
});

const contractSourceByMcpName: Record<string, string> = {
  vault_dashboard_getUserVaults: samebaseAppFilePath("convex/vault/contracts/getUserVaults.ts"),
  vault_actions_createRepository: samebaseAppFilePath("convex/vault/contracts/createRepository.ts"),
  vault_actions_connectRepository: samebaseAppFilePath(
    "convex/vault/contracts/connectRepository.ts",
  ),
  vault_convex_listProjects: samebaseAppFilePath("convex/vault/contracts/convexListProjects.ts"),
  vault_cloudflare_listAccounts: samebaseAppFilePath(
    "convex/vault/contracts/cloudflareListAccounts.ts",
  ),
  vault_cloudflare_listWorkers: samebaseAppFilePath(
    "convex/vault/contracts/cloudflareListWorkers.ts",
  ),
  vault_convex_connectExistingProject: samebaseAppFilePath(
    "convex/vault/contracts/convexConnectExistingProject.ts",
  ),
  vault_cloudflare_connectExistingWorker: samebaseAppFilePath(
    "convex/vault/contracts/cloudflareConnectExistingWorker.ts",
  ),
  vault_cloudflare_wireBuilds: samebaseAppFilePath(
    "convex/vault/contracts/cloudflareWireBuilds.ts",
  ),
  vault_cloudflare_wireConvexBuildAccess: samebaseAppFilePath(
    "convex/vault/contracts/cloudflareWireConvexBuildAccess.ts",
  ),
  vault_actions_retryInfrastructureProvisioning: samebaseAppFilePath(
    "convex/vault/contracts/retryInfrastructureProvisioning.ts",
  ),
};

type LoadedCatalog = {
  contracts: ActionContractDoc[];
  argumentLinesByMcpName: Map<string, string>;
  /** Wire-shape validator JSON per tool; null for text-only tools. */
  structuredContentJsonByMcpName: Map<string, string | null>;
};

/**
The catalog and schema converter import Convex-convention extensionless modules, so plain Node
cannot resolve them; a middleware-mode vite server loads the app module graph the same way
generate-cloudflare-redirects.ts does. Argument tables are rendered here, while the raw validator
objects are in hand, so the rest of the script works only with sure-validated data.
*/
async function loadCatalog(): Promise<LoadedCatalog> {
  const server = await createServer({
    appType: "custom",
    configFile: false,
    logLevel: "error",
    root: appDir,
    server: {
      middlewareMode: true,
    },
  });

  try {
    const catalogModule = await server.ssrLoadModule(
      `/${samebaseAppFilePath("convex/toolRuntime/actionCatalog.ts")}`,
    );
    const schemasModule = await server.ssrLoadModule(
      `/${samebaseAppFilePath("convex/toolRuntime/convexSchemas.ts")}`,
    );
    const [contractsAreValid, contracts] = array(actionContractSchema)(
      catalogModule.actionContracts,
    );
    if (!contractsAreValid) {
      throw new Error("actionCatalog.ts did not export the expected contract shapes.");
    }
    const convertArgs = schemasModule.convexArgsToToolInputSchema;
    if (typeof convertArgs !== "function") {
      throw new Error("convexSchemas.ts did not export convexArgsToToolInputSchema.");
    }

    const rawContracts = catalogModule.actionContracts;
    if (!Array.isArray(rawContracts)) {
      throw new Error("actionCatalog.ts actionContracts is not an array.");
    }

    const argumentLinesByMcpName = new Map<string, string>();
    const structuredContentJsonByMcpName = new Map<string, string | null>();
    contracts.forEach((contract, index) => {
      const rawContract = rawContracts[index];
      if (
        !isObject(rawContract) ||
        !isObject(rawContract.args) ||
        !isObject(rawContract.mcp) ||
        !isObject(rawContract.mcp.inputDescriptions)
      ) {
        throw new Error(`Contract ${contract.mcp.name} lost its raw shape during load.`);
      }
      const converted = convertArgs(rawContract.args, rawContract.mcp.inputDescriptions);
      const [schemaIsValid, schema] = toolJsonSchema(converted);
      if (!schemaIsValid || !isObject(converted) || !isObject(converted.properties)) {
        throw new Error(`Tool input schema for ${contract.mcp.name} has an unexpected shape.`);
      }
      argumentLinesByMcpName.set(
        contract.mcp.name,
        renderArgumentLines(converted.properties, new Set(schema.required ?? [])),
      );

      // Convex validators expose their JSON metadata; a contract's
      // structuredContent validator is the wire shape an MCP caller receives,
      // rendered verbatim. A contract may omit it only when its returns
      // validator is null (text-only reply); any other omission means an
      // undocumented wire payload, so generation fails.
      const rawStructuredContent = rawContract.structuredContent;
      if (isObject(rawStructuredContent) && rawStructuredContent.json !== undefined) {
        structuredContentJsonByMcpName.set(
          contract.mcp.name,
          JSON.stringify(rawStructuredContent.json, null, 2),
        );
      } else if (
        isObject(rawContract.returns) &&
        isObject(rawContract.returns.json) &&
        rawContract.returns.json.type === "null"
      ) {
        structuredContentJsonByMcpName.set(contract.mcp.name, null);
      } else {
        throw new Error(
          `Contract ${contract.mcp.name} needs a structuredContent validator or null returns.`,
        );
      }
    });

    return { contracts, argumentLinesByMcpName, structuredContentJsonByMcpName };
  } finally {
    await server.close();
  }
}

function renderArgumentLines(properties: Record<string, unknown>, required: Set<string>): string {
  const lines = Object.entries(properties).map(([name, property]) => {
    if (!isObject(property)) {
      return `- \`${name}\``;
    }
    const type = typeof property.type === "string" ? property.type : "value";
    const description = typeof property.description === "string" ? property.description : "";
    const requirement = required.has(name) ? "required" : "optional";
    return `- \`${name}\` (${type}, ${requirement})${description ? `: ${description}` : ""}`;
  });
  return lines.length > 0 ? lines.join("\n") : "None.";
}

function actionTitle(contract: ActionContractDoc): string {
  return contract.id.replaceAll("_", " ").replace(/^./, (first) => first.toUpperCase());
}

function renderActionDoc(
  contract: ActionContractDoc,
  argumentLines: string,
  structuredContentJson: string | null,
): string {
  const sourcePath = contractSourceByMcpName[contract.mcp.name];
  if (!sourcePath) {
    throw new Error(`No contract source path registered for ${contract.mcp.name}.`);
  }

  const returnsSection =
    structuredContentJson === null
      ? "The reply is confirmation text only; the tool sets no `structuredContent`."
      : `Convex validator JSON of the tool's \`structuredContent\`:

\`\`\`json
${structuredContentJson}
\`\`\``;

  return `<!-- Generated by apps/samebase/scripts/generate-action-docs.ts from apps/samebase/${sourcePath}. Do not edit. -->

# ${actionTitle(contract)} (\`${contract.id}\`)

MCP tool \`${contract.mcp.name}\` · scope \`${contract.access}\` · ${contract.mcp.safety}

${contract.doc.trim()}

## Arguments

${argumentLines}

## Returns

${returnsSection}
`;
}

function renderLlmsTxt(contracts: ActionContractDoc[]): string {
  const actionLines = contracts
    .map(
      (contract) =>
        `- [${actionTitle(contract)}](https://samebase.com/docs/actions/${contract.id}.md): ${contract.mcp.description}`,
    )
    .join("\n");

  return `# Samebase

> Samebase is a control plane for web apps on an opinionated stack: code in your GitHub
> repository, Convex backend, Cloudflare Workers hosting. Humans use a dashboard; coding agents use
> the same actions over MCP. The knowledge is free: you can build the identical stack with no
> Samebase account.

Apps created through Samebase live in the user's own GitHub, Convex, and Cloudflare accounts.
Deleting the Samebase account does not stop a running app.

The \`.md\` links under Docs return raw markdown, and the same paths without \`.md\` serve the
HTML pages. Action and operate docs are raw markdown only.

## Docs

- [Overview](https://samebase.com/landing-preview): why the base is GitHub, Convex, and Cloudflare,
  and the leaving test
- [The stack](https://samebase.com/docs/the-stack.md): what the app template ships and why each
  piece was chosen
- [Do it yourself](https://samebase.com/docs/do-it-yourself.md): deploy the same stack by hand, for
  $0/month, with no Samebase account
- [Receipts](https://samebase.com/docs/receipts.md): every factual claim with its primary source
  and the date it was last checked
- [Pricing](https://samebase.com/pricing.md): what stays free, what will be metered, and why there
  is no price list yet

## Actions

Every operational action has one contract, and these are the same actions the dashboard buttons run.
Degraded app states name their remedy in a \`nextAction\` field whose values are these action ids.

${actionLines}

## Operate

- [MCP server](https://samebase.com/mcp): connect a coding agent over MCP (OAuth happens in the
  browser); the tools are the actions listed above.
- [Production logs](https://samebase.com/docs/operate/production-logs.md): read backend and Worker
  logs provider-direct, with coordinates from get_user_vaults
- [Custom domain](https://samebase.com/docs/operate/custom-domain.md): attach a domain to the
  app's Worker in your own Cloudflare account

## Optional

- [Privacy](https://samebase.com/privacy)
- [Terms](https://samebase.com/terms)
`;
}

function renderSubmissionJson(contracts: ActionContractDoc[]): string {
  const tools = Object.fromEntries(
    contracts.map((contract) => {
      const justifications = toolJustifications[contract.mcp.name];
      if (!justifications) {
        throw new Error(
          `chatgptAppSubmissionSource.ts has no justifications for ${contract.mcp.name}.`,
        );
      }
      return [
        contract.mcp.name,
        {
          annotations: contract.mcp.annotations,
          justifications,
        },
      ];
    }),
  );

  const unknownJustificationNames = Object.keys(toolJustifications).filter(
    (name) => !contracts.some((contract) => contract.mcp.name === name),
  );
  if (unknownJustificationNames.length > 0) {
    throw new Error(
      `chatgptAppSubmissionSource.ts has justifications for unknown tools: ${unknownJustificationNames.join(", ")}.`,
    );
  }

  const submission = {
    $schema: "https://developers.openai.com/apps-sdk/schemas/chatgpt-app-submission.v1.json",
    schema_version: 1,
    app_info: appInfo,
    tools,
    test_cases: testCases,
    negative_test_cases: negativeTestCases,
  };
  return `${JSON.stringify(submission, null, 2)}\n`;
}

/**
Generated output runs through the repo formatter before writing, so the committed files, the
pre-commit hook's formatting pass, and CI's verify regeneration all agree byte for byte.
*/
async function writeFormatted(filePath: string, contents: string) {
  writeFileSync(filePath, await formatWithVpFmt(filePath, contents));
}

const { contracts, argumentLinesByMcpName, structuredContentJsonByMcpName } = await loadCatalog();

rmSync(actionsOutputDir, { force: true, recursive: true });
mkdirSync(actionsOutputDir, { recursive: true });
for (const contract of contracts) {
  const argumentLines = argumentLinesByMcpName.get(contract.mcp.name);
  const structuredContentJson = structuredContentJsonByMcpName.get(contract.mcp.name);
  if (!argumentLines || structuredContentJson === undefined) {
    throw new Error(`Missing rendered arguments or returns for ${contract.mcp.name}.`);
  }
  await writeFormatted(
    path.resolve(actionsOutputDir, `${contract.id}.md`),
    renderActionDoc(contract, argumentLines, structuredContentJson),
  );
}
// llms.txt stays unformatted: vp fmt (and the pre-commit hook glob) do not cover .txt files.
writeFileSync(llmsTxtPath, renderLlmsTxt(contracts));
await writeFormatted(submissionPath, renderSubmissionJson(contracts));

const generatedFiles = readdirSync(actionsOutputDir).length;
console.log(
  `Generated ${generatedFiles} action docs, llms.txt, and chatgpt-app-submission.json from ${contracts.length} contracts.`,
);

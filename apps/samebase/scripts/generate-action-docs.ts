import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { array, boolean, isObject, object, optional, string, type InferGood } from "@samebase/sure";
import { createServer } from "vite";

import { formatWithVpFmt } from "../../../scripts/format-with-vp-fmt.ts";
import { samebaseAppFilePath, trackedFilePath } from "../../../scripts/lib/trackedFilePath.ts";
import {
  appInfo,
  demoRecordingUrl,
  negativeTestCases,
  releaseNotes,
  testCases,
  toolJustifications,
} from "./chatgptAppSubmissionSource.ts";

/**
Renders the action catalog into every generated agent-facing surface (rfcs/093 Phase 2b):
public/docs/actions/<id>.md reference pages, public/llms.txt, the root
chatgpt-app-submission.json, and the extensions.com.openai block of the Codex plugin manifest.
Run through `pnpm run generate:action-docs`; `pnpm run verify:action-docs` guards drift in CI.
*/

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(currentDir, "..");
const repoRoot = path.resolve(appDir, "../..");
const actionsOutputDir = path.resolve(appDir, "public/docs/actions");
const llmsTxtPath = path.resolve(appDir, "public/llms.txt");
const submissionPath = path.resolve(repoRoot, "chatgpt-app-submission.json");
const pluginManifestPath = path.resolve(
  repoRoot,
  trackedFilePath("packages/plugin/plugins/samebase/.codex-plugin/plugin.json"),
);
const actionCatalogPath = samebaseAppFilePath("convex/toolRuntime/actionCatalog.ts");

const actionContractSchema = object({
  id: string,
  access: string,
  doc: string,
  mcp: object({
    title: string,
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

type LoadedCatalog = {
  contracts: ActionContractDoc[];
  argumentLinesByMcpName: Map<string, string>;
  /** Wire-shape JSON Schema per tool; null for text-only tools. */
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
      ws: false,
    },
  });

  try {
    const catalogModule = await server.ssrLoadModule(`/${actionCatalogPath}`);
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
    const convertOutput = schemasModule.convexValidatorToToolOutputSchema;
    if (typeof convertOutput !== "function") {
      throw new Error("convexSchemas.ts did not export convexValidatorToToolOutputSchema.");
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
      const rawMcpArgs = isObject(rawContract.mcpArgs) ? rawContract.mcpArgs : rawContract.args;
      const converted = convertArgs(rawMcpArgs, rawContract.mcp.inputDescriptions);
      const [schemaIsValid, schema] = toolJsonSchema(converted);
      if (!schemaIsValid || !isObject(converted) || !isObject(converted.properties)) {
        throw new Error(`Tool input schema for ${contract.mcp.name} has an unexpected shape.`);
      }
      argumentLinesByMcpName.set(
        contract.mcp.name,
        renderArgumentLines(converted.properties, new Set(schema.required ?? [])),
      );

      // A contract's structuredContent validator is the wire shape an MCP
      // caller receives. Render the same JSON Schema published by tools/list.
      // A contract may omit it only when its returns validator is null
      // (text-only reply); any other omission means an undocumented wire
      // payload, so generation fails.
      const rawStructuredContent = rawContract.structuredContent;
      if (isObject(rawStructuredContent) && rawStructuredContent.json !== undefined) {
        structuredContentJsonByMcpName.set(
          contract.mcp.name,
          JSON.stringify(convertOutput(rawStructuredContent), null, 2),
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

function renderActionDoc(
  contract: ActionContractDoc,
  argumentLines: string,
  structuredContentJson: string | null,
): string {
  const returnsSection =
    structuredContentJson === null
      ? "The reply is confirmation text only; the tool sets no `structuredContent`."
      : `JSON Schema for the tool's \`structuredContent\`:

\`\`\`json
${structuredContentJson}
\`\`\``;

  return `<!-- Generated by apps/samebase/scripts/generate-action-docs.ts from apps/samebase/${actionCatalogPath}. Do not edit. -->

# ${contract.mcp.title} (\`${contract.id}\`)

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
        `- [${contract.mcp.title}](https://samebase.com/docs/actions/${contract.id}.md): ${contract.mcp.description}`,
    )
    .join("\n");

  return `# Samebase

> Samebase standardizes web apps on the best stack we have found: code in the user's GitHub
> repository, a Convex backend, and Cloudflare Workers delivery. Once you have found the best
> stack, repeat it. Each new app adds a product, not another system to maintain.

Samebase can create a new app in about a minute or connect an existing GitHub repository without
touching its providers. A connected app can remain GitHub-only or attach Convex and Cloudflare
later. In a monorepo, Samebase derives resource locations from each selected convex.json file and
each Worker's live Workers Builds root.

The Samebase starter's core local workflow runs natively on macOS, Linux, and Windows. Its
repository automation is TypeScript run directly by Node 24, so it does not require Bash or WSL.

The dashboard gives humans one inventory of every repository they connect, its provider resources,
derived locations, current state, direct provider coordinates, and provider or connection repair
actions.
Every Samebase action checks its own authentication. Authentication status is a diagnostic action,
not a preflight.
The repository list reports Samebase-owned workflow state and the names of attached resources. It
is not proof of live provider state. The repository status reads the live builds, URLs, Convex
deployments, checks, and pull requests of one repository. Use provider-native tools for logs,
environment values, migrations, and domains.
Codex and Claude Code can add the public
[samebase/plugin](https://github.com/samebase/plugin) marketplace and install
\`samebase@samebase\`. That value means the \`samebase\` plugin from the \`samebase\` marketplace.
It is not an npm package name. The plugin packages the create or connect, local repository build,
and Git-backed hosting workflows. Cursor and other MCP clients can call the same actions directly.

Apps created through Samebase live in the user's own GitHub, Convex, and Cloudflare accounts.
Deleting the Samebase account does not stop a running app. The knowledge is free: anyone can build
the identical stack with no Samebase account.

Samebase runs on the same base it gives users. The public template,
[samebase/base](https://github.com/samebase/base), is published automatically from the Samebase
monorepo as the base improves, and each template commit names the Samebase build it came from. The
template, the agent skills, and the [plugin](https://github.com/samebase/plugin) are open source
under Apache 2.0. The samebase.com control plane that creates, connects, and tracks apps is not.

The \`.md\` links under Docs return raw markdown, and the same paths without \`.md\` serve the
HTML pages. Action and operate docs are raw markdown only.

## Docs

- [Overview](https://samebase.com/): the best-stack opinion, the connected-app
  inventory, and the four claims: yours, safer, lanes, cheaper
- [The stack](https://samebase.com/docs/the-stack.md): what the app template ships and why each
  piece was chosen
- [Cloudflare setup](https://samebase.com/docs/cloudflare-setup.md): create the first Workers Builds
  API token, then let Samebase create the real Worker
- [Do it yourself](https://samebase.com/docs/do-it-yourself.md): deploy the same stack by hand, for
  $0/month, with no Samebase account
- [Receipts](https://samebase.com/docs/receipts.md): every factual claim with its primary source
  and the date it was last checked
- [Pricing](https://samebase.com/pricing.md): the Free and Pro connection limits, member limits, and
  monthly prices

## Actions

Every operational action has one contract, and these are the same actions the dashboard buttons run.
MCP tools take a repository as its GitHub owner/name, a Worker by its name, and a Convex project by
its slug. Choose the action that matches the request, then verify the result with the repository
status.

${actionLines}

## Operate

- [Agent plugin](https://samebase.com/docs/operate/agent-plugin.md): install \`samebase@samebase\`
  for the building and Git-backed hosting workflows around this action catalog
- [MCP server](https://api.samebase.com/mcp): connect a coding agent over MCP (OAuth happens in the
  browser); the tools are the actions listed above.
- [Production logs](https://samebase.com/docs/operate/production-logs.md): read backend and Worker
  logs provider-direct, in the Cloudflare and Convex accounts of the repository's organization
- [Custom domain](https://samebase.com/docs/operate/custom-domain.md): attach a domain to the
  app's Worker in your own Cloudflare account

## Optional

- [Privacy](https://samebase.com/privacy)
- [Terms](https://samebase.com/terms)
`;
}

function renderSubmissionJson(contracts: ActionContractDoc[]): string {
  const contractNames = new Set(contracts.map((contract) => contract.mcp.name));
  const justificationsByMcpName = new Map(Object.entries(toolJustifications));
  for (const testCase of testCases) {
    for (const toolName of testCase.tools_triggered) {
      if (!contractNames.has(toolName)) {
        throw new Error(`OpenAI submission test references unknown MCP tool ${toolName}.`);
      }
    }
  }

  const tools = Object.fromEntries(
    contracts.map((contract) => {
      const justifications = justificationsByMcpName.get(contract.mcp.name);
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
    test_cases: testCases.map((testCase) => ({
      description: testCase.description,
      user_prompt: testCase.prompt,
      file_attachment_urls: null,
      tools_triggered: testCase.tools_triggered.join(", "),
      expected_output: testCase.expected_behavior,
      expected_output_url: null,
    })),
    negative_test_cases: negativeTestCases.map((testCase) => ({
      description: testCase.description,
      user_prompt: testCase.prompt,
      file_attachment_urls: null,
      tools_triggered: null,
      expected_output: testCase.expected_behavior,
      expected_output_url: null,
    })),
  };
  return `${JSON.stringify(submission, null, 2)}\n`;
}

/**
The OpenAI portal imports review and publication details from the Codex manifest's
extensions.com.openai block when the plugin ZIP is uploaded. Only that block is generated; the
rest of the manifest stays hand-written, so the manifest is read first and written back with the
block replaced.
*/
function renderPluginManifest(): string {
  const parsed: unknown = JSON.parse(readFileSync(pluginManifestPath, "utf8"));
  if (!isObject(parsed)) {
    throw new Error(`${pluginManifestPath} is not a JSON object.`);
  }
  const extensions = isObject(parsed["extensions"]) ? parsed["extensions"] : {};
  const manifest = {
    ...parsed,
    extensions: {
      ...extensions,
      "com.openai": {
        review: {
          test_cases: {
            positive: testCases.map((testCase) => ({
              description: testCase.description,
              prompt: testCase.prompt,
              tools_triggered: testCase.tools_triggered.join(", "),
              expected_behavior: testCase.expected_behavior,
            })),
            negative: negativeTestCases.map((testCase) => ({
              description: testCase.description,
              prompt: testCase.prompt,
              expected_behavior: testCase.expected_behavior,
            })),
          },
          ...(demoRecordingUrl === null ? {} : { demo_recording_url: demoRecordingUrl }),
          commerce: false,
          commerce_description:
            "Samebase sells nothing through the plugin and processes no payments. Resources are created in the user's own GitHub, Convex, and Cloudflare accounts.",
        },
        publication: {
          release_notes: releaseNotes,
        },
      },
    },
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
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
await writeFormatted(pluginManifestPath, renderPluginManifest());

const generatedFiles = readdirSync(actionsOutputDir).length;
console.log(
  `Generated ${generatedFiles} action docs, llms.txt, chatgpt-app-submission.json, and the plugin manifest review block from ${contracts.length} contracts.`,
);

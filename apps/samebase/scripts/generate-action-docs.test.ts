import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

import { isObject } from "@samebase/sure";

/** The generated submission file lists every MCP tool name; the scripts tsconfig cannot import the Convex catalog. */
const submissionPath = new URL("../../../chatgpt-app-submission.json", import.meta.url);
function readSubmissionToolNames(): string[] {
  const parsed: unknown = JSON.parse(readFileSync(submissionPath, "utf8"));
  if (!isObject(parsed) || !isObject(parsed["tools"])) {
    throw new Error("chatgpt-app-submission.json has no tools object.");
  }
  return Object.keys(parsed["tools"]);
}

const llmsTxt = readFileSync(fileURLToPath(new URL("../public/llms.txt", import.meta.url)), "utf8");
const contentDirectory = new URL("../src/content/", import.meta.url);
/** The corpus docs pages, which ship as raw Markdown next to llms.txt. */
const corpusDocs = readdirSync(contentDirectory)
  .filter((fileName) => fileName.startsWith("docs-") && fileName.endsWith(".md"))
  .sort((left, right) => left.localeCompare(right))
  .map((fileName) => ({
    fileName,
    text: readFileSync(fileURLToPath(new URL(fileName, contentDirectory)), "utf8"),
  }));

describe("generated action documentation", () => {
  it("defines authentication and provider-state boundaries", () => {
    expect(llmsTxt).toContain("Every Samebase action checks its own authentication.");
    expect(llmsTxt).toContain("Authentication status is a diagnostic action,\nnot a preflight.");
    expect(llmsTxt).toContain(
      "The repository list reports Samebase-owned workflow state. It is not proof of live provider state.",
    );
    expect(llmsTxt).toContain(
      "The repository status reads the Alchemy stacks, URLs, deployed\ncommits, checks, and pull requests of one repository. Use provider-native tools for logs,\nenvironment values, migrations, and domains.",
    );
  });

  it("identifies the public plugin marketplace without implying an npm package", () => {
    expect(llmsTxt).toContain("[samebase/plugin](https://github.com/samebase/plugin) marketplace");
    expect(llmsTxt).toContain(
      "`samebase@samebase`. That value means the `samebase` plugin from the `samebase` marketplace.",
    );
    expect(llmsTxt).toContain("It is not an npm package name.");
  });

  it("names only MCP tools of the action catalog in the corpus docs", () => {
    const toolNames = new Set<string>(readSubmissionToolNames());
    const namedTools = corpusDocs.flatMap(({ fileName, text }) =>
      (text.match(/`[\w-]+`(?=\s+MCP\s+tool)/g) ?? []).map((name) => ({
        fileName,
        toolName: name.slice(1, -1),
      })),
    );

    expect(namedTools.filter(({ toolName }) => !toolNames.has(toolName))).toEqual([]);
  });
});

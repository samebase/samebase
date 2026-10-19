import { describe, expect, it } from "vite-plus/test";

import { findUnsyncedTemplatePaths } from "./check-template-sync.ts";
import type { CollectedTemplateFile } from "./export-starter-manifest.ts";

function textFile(relativePath: string, content: string): CollectedTemplateFile {
  return {
    relativePath,
    content,
    encoding: "utf-8",
    rawContent: Buffer.from(content, "utf8"),
    mode: "100644",
  };
}

const sharedFiles = [textFile("src/app.ts", "export {};\n"), textFile("vite.config.ts", "{}\n")];

describe("template sync", () => {
  it("passes identical trees", () => {
    expect(
      findUnsyncedTemplatePaths({
        baseFiles: sharedFiles,
        actionsFiles: sharedFiles,
        deployPaths: [],
      }),
    ).toEqual([]);
  });

  it("names a shared file whose content or mode differs", () => {
    expect(
      findUnsyncedTemplatePaths({
        baseFiles: sharedFiles,
        actionsFiles: [
          textFile("src/app.ts", "export const changed = true;\n"),
          { ...textFile("vite.config.ts", "{}\n"), mode: "100755" },
        ],
        deployPaths: [],
      }),
    ).toEqual(["src/app.ts (content differs)", "vite.config.ts (mode differs)"]);
  });

  it("names a file that only one template has unless it is a deploy path", () => {
    const problems = findUnsyncedTemplatePaths({
      baseFiles: [...sharedFiles, textFile("wrangler.jsonc", "{}\n"), textFile("base.ts", "\n")],
      actionsFiles: [
        ...sharedFiles,
        textFile("alchemy.run.ts", "export {};\n"),
        textFile("actions.ts", "\n"),
      ],
      deployPaths: ["alchemy.run.ts", "wrangler.jsonc"],
    });

    expect(problems).toEqual([
      "actions.ts (only in templates/base-actions)",
      "base.ts (only in templates/base-workers)",
    ]);
  });

  it("lets a deploy path differ", () => {
    expect(
      findUnsyncedTemplatePaths({
        baseFiles: [...sharedFiles, textFile("package.json", '{ "name": "base" }\n')],
        actionsFiles: [...sharedFiles, textFile("package.json", '{ "name": "actions" }\n')],
        deployPaths: ["package.json"],
      }),
    ).toEqual([]);
  });
});

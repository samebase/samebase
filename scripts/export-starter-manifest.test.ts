import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { collectTemplateFiles, renderStarterSeedManifests } from "./export-starter-manifest.ts";

function git(cwd: string, args: readonly string[]): void {
  execFileSync("git", args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function writeTemplateFiles(root: string, files: Record<string, string>): void {
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, ...relativePath.split("/"));
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, "utf8");
  }
}

describe("starter manifests", () => {
  it("renders each template directory as its own manifest", async () => {
    const temporaryRoot = mkdtempSync(path.join(tmpdir(), "samebase-alchemy-manifest-test-"));

    try {
      git(temporaryRoot, ["init"]);
      writeTemplateFiles(path.join(temporaryRoot, "templates", "base"), {
        "README.md": "base readme\n",
        "src/app.ts": "export {};\n",
        "wrangler.jsonc": "{}\n",
      });
      writeTemplateFiles(path.join(temporaryRoot, "templates", "base-alchemy"), {
        "README.md": "actions readme\n",
        "alchemy.run.ts": "export {};\n",
        "src/app.ts": "export {};\n",
      });
      git(temporaryRoot, ["add", "templates"]);

      const [base, actions] = await renderStarterSeedManifests(temporaryRoot);

      expect(base.outputPath).toBe("apps/samebase/convex/starterSeedManifest.generated.ts");
      expect(base.manifest).toEqual(
        expect.objectContaining({
          sourcePath: "templates/base",
          publishedRepo: "https://github.com/samebase/base.git",
          files: {
            "README.md": "base readme\n",
            "src/app.ts": "export {};\n",
            "wrangler.jsonc": "{}\n",
          },
        }),
      );
      expect(actions.outputPath).toBe(
        "apps/samebase/convex/starterSeedManifest.actions.generated.ts",
      );
      expect(actions.manifest).toEqual(
        expect.objectContaining({
          sourcePath: "templates/base-alchemy",
          publishedRepo: "https://github.com/samebase/base-alchemy.git",
          files: {
            "README.md": "actions readme\n",
            "alchemy.run.ts": "export {};\n",
            "src/app.ts": "export {};\n",
          },
        }),
      );
      expect(actions.manifest.version).toBe(
        `samebase-base-alchemy-${actions.manifest.contentHash.slice(0, 12)}`,
      );
      expect(actions.source).toContain(
        "export const actionsStarterTemplateManifest: StarterTemplateManifest = {",
      );
    } finally {
      rmSync(temporaryRoot, { force: true, recursive: true });
    }
  });
});

describe("starter manifest export", () => {
  it("reads staged Git blob bytes without ignored local files", async () => {
    const temporaryRoot = mkdtempSync(path.join(tmpdir(), "samebase-base-manifest-test-"));
    const templateRoot = path.join(temporaryRoot, "templates", "base");

    try {
      mkdirSync(templateRoot, { recursive: true });
      git(temporaryRoot, ["init"]);
      writeFileSync(
        path.join(temporaryRoot, ".gitattributes"),
        "templates/base/crlf.txt text eol=crlf\n",
        "utf8",
      );
      writeFileSync(path.join(templateRoot, ".gitignore"), ".env*\nnode_modules\n", "utf8");
      writeFileSync(path.join(templateRoot, "README.md"), "starter\n", "utf8");
      writeFileSync(path.join(templateRoot, "binary.bin"), Buffer.from([0, 255]));
      writeFileSync(path.join(templateRoot, "crlf.txt"), "first\r\nsecond\r\n", "utf8");
      writeFileSync(path.join(templateRoot, "draft.ts"), "export {};\n", "utf8");
      writeFileSync(path.join(templateRoot, "run.sh"), "#!/bin/sh\n", "utf8");
      chmodSync(path.join(templateRoot, "run.sh"), 0o755);
      git(temporaryRoot, ["add", ".gitattributes", "templates/base"]);
      git(temporaryRoot, ["update-index", "--chmod=+x", "templates/base/run.sh"]);

      writeFileSync(path.join(templateRoot, ".env.local"), "SECRET=hidden\n", "utf8");
      mkdirSync(path.join(templateRoot, "node_modules"));
      writeFileSync(path.join(templateRoot, "node_modules", "dependency.js"), "hidden\n", "utf8");

      const files = await collectTemplateFiles(temporaryRoot, "templates/base");

      expect(files.map((file) => file.relativePath)).toEqual([
        ".gitignore",
        "README.md",
        "binary.bin",
        "crlf.txt",
        "draft.ts",
        "run.sh",
      ]);
      expect(files.find((file) => file.relativePath === "binary.bin")).toEqual(
        expect.objectContaining({
          content: "AP8=",
          encoding: "base64",
          mode: "100644",
        }),
      );
      expect(files.find((file) => file.relativePath === "run.sh")).toEqual(
        expect.objectContaining({
          content: "#!/bin/sh\n",
          encoding: "utf-8",
          mode: "100755",
        }),
      );
      expect(files.find((file) => file.relativePath === "crlf.txt")).toEqual(
        expect.objectContaining({
          content: "first\nsecond\n",
          encoding: "utf-8",
          mode: "100644",
        }),
      );

      writeFileSync(path.join(templateRoot, "new.ts"), "export {};\n", "utf8");
      await expect(collectTemplateFiles(temporaryRoot, "templates/base")).rejects.toThrow(
        "Stage new files under templates/base before export",
      );
      rmSync(path.join(templateRoot, "new.ts"));
      writeFileSync(path.join(templateRoot, "README.md"), "changed\n", "utf8");
      await expect(collectTemplateFiles(temporaryRoot, "templates/base")).rejects.toThrow(
        "Stage tracked changes under templates/base before export",
      );
    } finally {
      rmSync(temporaryRoot, { force: true, recursive: true });
    }
  });
});

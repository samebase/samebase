import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { collectTemplateFiles, readTemplateProvenance } from "./export-samebase-app-manifest.ts";

function git(cwd: string, args: readonly string[]): void {
  execFileSync("git", args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

describe("samebase app manifest export", () => {
  it("reads staged Git blob bytes without ignored local files", async () => {
    const temporaryRoot = mkdtempSync(path.join(tmpdir(), "samebase-app-manifest-test-"));
    const templateRoot = path.join(temporaryRoot, "templates", "app");

    try {
      mkdirSync(templateRoot, { recursive: true });
      git(temporaryRoot, ["init"]);
      writeFileSync(
        path.join(temporaryRoot, ".gitattributes"),
        "templates/app/crlf.txt text eol=crlf\n",
        "utf8",
      );
      mkdirSync(path.join(templateRoot, ".samebase"));
      writeFileSync(
        path.join(templateRoot, ".samebase", "template.json"),
        '{"schemaVersion":1,"sourceRepository":"https://github.com/samebase/samebase","baseline":"v1977"}\n',
        "utf8",
      );
      writeFileSync(path.join(templateRoot, ".gitignore"), ".env*\nnode_modules\n", "utf8");
      writeFileSync(path.join(templateRoot, "README.md"), "starter\n", "utf8");
      writeFileSync(path.join(templateRoot, "binary.bin"), Buffer.from([0, 255]));
      writeFileSync(path.join(templateRoot, "crlf.txt"), "first\r\nsecond\r\n", "utf8");
      writeFileSync(path.join(templateRoot, "draft.ts"), "export {};\n", "utf8");
      writeFileSync(path.join(templateRoot, "run.sh"), "#!/bin/sh\n", "utf8");
      chmodSync(path.join(templateRoot, "run.sh"), 0o755);
      git(temporaryRoot, ["add", ".gitattributes", "templates/app"]);
      git(temporaryRoot, ["update-index", "--chmod=+x", "templates/app/run.sh"]);

      writeFileSync(path.join(templateRoot, ".env.local"), "SECRET=hidden\n", "utf8");
      mkdirSync(path.join(templateRoot, "node_modules"));
      writeFileSync(path.join(templateRoot, "node_modules", "dependency.js"), "hidden\n", "utf8");

      const files = await collectTemplateFiles(temporaryRoot);

      expect(files.map((file) => file.relativePath)).toEqual([
        ".gitignore",
        ".samebase/template.json",
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
      expect(readTemplateProvenance(files)).toEqual({
        baseline: "v1977",
        sourceRepository: "https://github.com/samebase/samebase",
      });

      writeFileSync(
        path.join(templateRoot, ".samebase", "template.json"),
        '{"schemaVersion":1,"sourceRepository":"https://github.com/not-samebase/app","baseline":"v1977"}\n',
        "utf8",
      );
      git(temporaryRoot, ["add", "templates/app/.samebase/template.json"]);
      await expect(
        collectTemplateFiles(temporaryRoot).then(readTemplateProvenance),
      ).rejects.toThrow("sourceRepository must be https://github.com/samebase/samebase");

      writeFileSync(
        path.join(templateRoot, ".samebase", "template.json"),
        '{"schemaVersion":1,"sourceRepository":"https://github.com/samebase/samebase","baseline":"1977"}\n',
        "utf8",
      );
      git(temporaryRoot, ["add", "templates/app/.samebase/template.json"]);
      await expect(
        collectTemplateFiles(temporaryRoot).then(readTemplateProvenance),
      ).rejects.toThrow("baseline must use the v<N> build label format");

      writeFileSync(path.join(templateRoot, "new.ts"), "export {};\n", "utf8");
      await expect(collectTemplateFiles(temporaryRoot)).rejects.toThrow(
        "Stage new files under templates/app before export",
      );
      rmSync(path.join(templateRoot, "new.ts"));
      writeFileSync(path.join(templateRoot, "README.md"), "changed\n", "utf8");
      await expect(collectTemplateFiles(temporaryRoot)).rejects.toThrow(
        "Stage tracked changes under templates/app before export",
      );
    } finally {
      rmSync(temporaryRoot, { force: true, recursive: true });
    }
  });
});

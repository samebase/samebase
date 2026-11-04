import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";

import {
  collectTemplateFiles,
  readPinnedCommit,
  renderStarterSeedManifest,
} from "./export-starter-manifest.ts";

function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function writeTemplateFiles(root: string, files: Record<string, string>): void {
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, ...relativePath.split("/"));
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, "utf8");
  }
}

function commitAll(root: string): string {
  git(root, ["add", "--all"]);
  git(root, [
    "-c",
    "user.name=Samebase Test",
    "-c",
    "user.email=test@samebase.invalid",
    "commit",
    "--quiet",
    "--message",
    "starter",
  ]);
  return git(root, ["rev-parse", "HEAD"]);
}

function withStarterRepository(run: (root: string) => void): void {
  const root = mkdtempSync(path.join(tmpdir(), "samebase-base-manifest-test-"));
  try {
    git(root, ["init", "--quiet"]);
    run(root);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

describe("starter manifest", () => {
  it("renders a commit of samebase/base and pins it", () => {
    withStarterRepository((root) => {
      const files = {
        "README.md": "starter readme\n",
        "alchemy.run.ts": "export {};\n",
        "src/app.ts": "export {};\n",
      };
      writeTemplateFiles(root, files);
      const commit = commitAll(root);

      const rendered = renderStarterSeedManifest(root, commit);

      expect(rendered.outputPath).toBe("apps/samebase/convex/starterSeedManifest.generated.ts");
      expect(rendered.manifest).toEqual(
        expect.objectContaining({
          sourceRepository: "https://github.com/samebase/base.git",
          sourceCommit: commit,
          files,
        }),
      );
      expect(rendered.manifest.version).toBe(
        `samebase-base-${rendered.manifest.contentHash.slice(0, 12)}`,
      );
      expect(readPinnedCommit(rendered.source)).toBe(commit);
    });
  });

  it("reads committed blob bytes, binary files, and executable modes", () => {
    withStarterRepository((root) => {
      writeFileSync(path.join(root, ".gitattributes"), "crlf.txt text eol=crlf\n", "utf8");
      writeFileSync(path.join(root, ".gitignore"), ".env*\n", "utf8");
      writeFileSync(path.join(root, "binary.bin"), Buffer.from([0, 255]));
      writeFileSync(path.join(root, "crlf.txt"), "first\r\nsecond\r\n", "utf8");
      writeFileSync(path.join(root, "run.sh"), "#!/bin/sh\n", "utf8");
      chmodSync(path.join(root, "run.sh"), 0o755);
      git(root, ["add", "--all"]);
      git(root, ["update-index", "--chmod=+x", "run.sh"]);
      const commit = commitAll(root);
      writeFileSync(path.join(root, ".env.local"), "SECRET=hidden\n", "utf8");
      writeFileSync(path.join(root, "draft.ts"), "export {};\n", "utf8");

      const files = collectTemplateFiles(root, commit);

      expect(files.map((file) => file.relativePath)).toEqual([
        ".gitattributes",
        ".gitignore",
        "binary.bin",
        "crlf.txt",
        "run.sh",
      ]);
      expect(files.find((file) => file.relativePath === "binary.bin")).toEqual(
        expect.objectContaining({ content: "AP8=", encoding: "base64", mode: "100644" }),
      );
      expect(files.find((file) => file.relativePath === "run.sh")).toEqual(
        expect.objectContaining({ content: "#!/bin/sh\n", encoding: "utf-8", mode: "100755" }),
      );
      expect(files.find((file) => file.relativePath === "crlf.txt")).toEqual(
        expect.objectContaining({ content: "first\nsecond\n", encoding: "utf-8" }),
      );
    });
  });

  it.skipIf(process.platform === "win32")("rejects a symbolic link", () => {
    withStarterRepository((root) => {
      writeFileSync(path.join(root, "README.md"), "starter\n", "utf8");
      symlinkSync("README.md", path.join(root, "link.md"));
      const commit = commitAll(root);

      expect(() => collectTemplateFiles(root, commit)).toThrow(
        "Unsupported starter mode 120000: link.md",
      );
    });
  });

  it("needs exactly one full pinned commit", () => {
    const commit = "0123456789abcdef0123456789abcdef01234567";

    expect(readPinnedCommit(`{\n  sourceCommit: "${commit}",\n}`)).toBe(commit);
    expect(() => readPinnedCommit("{}")).toThrow("must name exactly one sourceCommit");
    expect(() => readPinnedCommit(`  sourceCommit: "main",`)).toThrow(
      "sourceCommit is not a full commit sha: main",
    );
  });
});

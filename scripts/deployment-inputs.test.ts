import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { selectDeployment } from "../.github/actions/deployment-inputs/select.ts";

let cwd: string;
let base: string;
const git = (...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const write = (file: string, content: string) => {
  mkdirSync(dirname(join(cwd, file)), { recursive: true });
  writeFileSync(join(cwd, file), content);
};
const commit = () => {
  git("add", ".");
  git("-c", "core.hooksPath=", "commit", "--quiet", "-m", "fixture");
  return git("rev-parse", "HEAD");
};
const selected = (directory: string) =>
  selectDeployment({ cwd, directory, base, head: git("rev-parse", "HEAD") });

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "deployment-inputs-"));
  git("init", "--quiet");
  git("config", "user.name", "Deployment inputs test");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "commit.gpgsign", "false");
  write(
    "package.json",
    JSON.stringify({ name: "fixture", private: true, alchemy: { inputs: ["tools/**"] } }),
  );
  write("pnpm-workspace.yaml", "packages:\n  - apps/*\n  - packages/*\n");
  for (const [directory, manifest] of [
    ["apps/alpha", { name: "alpha", dependencies: { shared: "workspace:*" } }],
    ["apps/beta", { name: "beta" }],
    ["packages/shared", { name: "shared", dependencies: { leaf: "workspace:*" } }],
    ["packages/leaf", { name: "leaf" }],
  ] as const) {
    write(`${directory}/package.json`, JSON.stringify(manifest));
    write(`${directory}/index.ts`, 'export const value = "original";\n');
  }
  write("pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
  write("tools/build.ts", "export const build = 1;\n");
  base = commit();
});

afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe("deployment selection through the real pnpm workspace graph", () => {
  it("selects one changed app and leaves an unrelated app out", () => {
    write("apps/alpha/index.ts", "export const value = 2;\n");
    commit();
    expect(selected("apps/alpha").changed).toBe(true);
    expect(selected("apps/beta").changed).toBe(false);
  });

  it("follows transitive dependencies across the whole PR and handles a revert", () => {
    write("packages/leaf/index.ts", "export const value = 2;\n");
    commit();
    write("README.md", "An unrelated later commit.\n");
    commit();
    expect(selected("apps/alpha").changed).toBe(true);
    expect(selected("apps/beta").changed).toBe(false);
    write("packages/leaf/index.ts", 'export const value = "original";\n');
    commit();
    expect(selected("apps/alpha").changed).toBe(false);
  });

  it.each(["pnpm-lock.yaml", "tools/build.ts", ".github/workflows/deploy.yml"])(
    "selects every app when the shared input %s changes",
    (file) => {
      write(file, "# changed\n");
      commit();
      expect(selected("apps/alpha").changed).toBe(true);
      expect(selected("apps/beta").changed).toBe(true);
    },
  );

  it("does not miss consumers when a dependency package is deleted", () => {
    rmSync(join(cwd, "packages/leaf"), { recursive: true });
    commit();
    expect(selected("apps/alpha")).toMatchObject({ changed: true });
  });

  it("does not select apps for unrelated repository documentation", () => {
    write("docs/guide.md", "Documentation.\n");
    commit();
    expect(selected("apps/alpha").changed).toBe(false);
    expect(selected("apps/beta").changed).toBe(false);
  });

  it("rejects a checkout that differs from the requested head", () => {
    write("apps/alpha/index.ts", "export const value = 2;\n");
    commit();
    expect(() => selectDeployment({ cwd, directory: "apps/alpha", base, head: base })).toThrow(
      "requested head",
    );
  });

  it("runs directly in Node and selects conservatively when Git history is unavailable", () => {
    write("docs/guide.md", "Documentation.\n");
    const head = commit();
    const output = join(cwd, ".git", "action-output");
    const script = fileURLToPath(
      new URL("../.github/actions/deployment-inputs/select.ts", import.meta.url),
    );
    const run = (revision: string) =>
      execFileSync(process.execPath, [script], {
        cwd,
        env: {
          ...process.env,
          DEPLOYMENT_DIRECTORY: "apps/beta",
          DEPLOYMENT_BASE: revision,
          DEPLOYMENT_HEAD: head,
          GITHUB_OUTPUT: output,
        },
        stdio: "pipe",
      });
    run(base);
    expect(readFileSync(output, "utf8")).toBe("changed=false\n");
    run("missing-history");
    expect(readFileSync(output, "utf8")).toBe("changed=false\nchanged=true\n");
  });
});

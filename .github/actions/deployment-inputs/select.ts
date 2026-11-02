import { execFileSync } from "node:child_process";
import { appendFileSync, realpathSync } from "node:fs";
import { matchesGlob, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const defaultSharedInputs = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "package-lock.json",
  "patches/**",
  "tsconfig*.json",
  ".github/workflows/**",
];

function sharedInputs(text: string): string[] {
  const manifest: unknown = JSON.parse(text);
  if (typeof manifest !== "object" || manifest === null) {
    throw new Error("package.json must contain an object.");
  }
  if (!("alchemy" in manifest)) return defaultSharedInputs;
  const config = manifest.alchemy;
  if (typeof config !== "object" || config === null || !("inputs" in config)) {
    throw new Error("package.json alchemy.inputs must be an array of shared input globs.");
  }
  const inputs: unknown = config.inputs;
  if (!Array.isArray(inputs)) {
    throw new Error("package.json alchemy.inputs must contain only strings.");
  }
  const patterns = [...defaultSharedInputs];
  for (const input of inputs) {
    if (typeof input !== "string") {
      throw new Error("package.json alchemy.inputs must contain only strings.");
    }
    patterns.push(input);
  }
  return patterns;
}

function packagePaths(text: string, cwd: string): string[] {
  const packages: unknown = JSON.parse(text);
  if (!Array.isArray(packages)) throw new Error("pnpm list must return an array.");
  return packages.map((entry: unknown) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("path" in entry) ||
      typeof entry.path !== "string"
    ) {
      throw new Error("pnpm list returned a package without its directory.");
    }
    return relative(cwd, entry.path).split(sep).join("/") || ".";
  });
}

/**
 * pnpm owns the workspace graph. Shared inputs are declared once in the root
 * package.json. Both source trees participate, so removing an input cannot hide
 * a change. No install or deployment credentials are needed for selection.
 */
export function selectDeployment(options: {
  cwd: string;
  directory: string;
  base: string;
  head: string;
}): { changed: boolean; reason: string } {
  const cwd = realpathSync(options.cwd);
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim();
  const head = git("rev-parse", "--verify", "--end-of-options", `${options.head}^{commit}`);
  if (git("rev-parse", "HEAD") !== head) {
    throw new Error("Deployment selection must run at the requested head commit.");
  }
  const base = git("merge-base", options.base, head);
  const files = git("diff", "--name-only", "--no-renames", "-z", base, head)
    .split("\0")
    .filter(Boolean);
  if (files.length === 0) return { changed: false, reason: "The pull request has no changes." };

  const inputs = [
    ...sharedInputs(git("show", `${base}:package.json`)),
    ...sharedInputs(git("show", `${head}:package.json`)),
  ];
  const shared = files.find((file) => inputs.some((pattern) => matchesGlob(file, pattern)));
  if (shared) return { changed: true, reason: `Shared input changed: ${shared}` };

  // pnpm cannot find dependents of a workspace package that no longer exists.
  // Select all apps when a package boundary disappears rather than miss a consumer.
  const removed = git("diff", "--name-only", "--no-renames", "--diff-filter=D", "-z", base, head)
    .split("\0")
    .find((file) => file.endsWith("/package.json"));
  if (removed) return { changed: true, reason: `Package boundary removed: ${removed}` };

  const pnpm = (filters: string[]) =>
    packagePaths(
      execFileSync("pnpm", [...filters, "list", "--depth", "-1", "--json"], {
        cwd,
        encoding: "utf8",
        // The only interpolated shell argument on Windows is a Git-verified SHA.
        shell: process.platform === "win32",
        maxBuffer: 32 * 1024 * 1024,
      }),
      cwd,
    );
  const directory = relative(cwd, resolve(cwd, options.directory)).split(sep).join("/") || ".";
  const workspaces = pnpm(["--recursive", "--include-workspace-root"]);
  if (!workspaces.includes(directory)) {
    return { changed: true, reason: "The app is outside the known workspace graph." };
  }
  const affected = pnpm(["--filter", `...[${base}]`, "--include-workspace-root"]);
  return affected.includes(directory)
    ? { changed: true, reason: "The app or a transitive workspace dependency changed." }
    : { changed: false, reason: "The app and its workspace dependencies are unchanged." };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { DEPLOYMENT_DIRECTORY, DEPLOYMENT_BASE, DEPLOYMENT_HEAD, GITHUB_OUTPUT } = process.env;
  if (!DEPLOYMENT_DIRECTORY || !DEPLOYMENT_BASE || !DEPLOYMENT_HEAD || !GITHUB_OUTPUT) {
    throw new Error("Deployment inputs require directory, base, head, and GITHUB_OUTPUT.");
  }
  let selection;
  try {
    selection = selectDeployment({
      cwd: process.cwd(),
      directory: DEPLOYMENT_DIRECTORY,
      base: DEPLOYMENT_BASE,
      head: DEPLOYMENT_HEAD,
    });
  } catch (error) {
    // Failure to prove that an app is unchanged must never suppress a deploy.
    selection = { changed: true, reason: "Input selection failed; deploy conservatively." };
    console.warn(`::warning::${error instanceof Error ? error.message : String(error)}`);
  }
  appendFileSync(GITHUB_OUTPUT, `changed=${selection.changed}\n`);
  console.log(`${DEPLOYMENT_DIRECTORY}: ${selection.reason}`);
}

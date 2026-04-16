import { execFileSync } from "node:child_process";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  failMissingRequiredOptions,
  failUnexpectedArgument,
  isHelpArg,
  requireOptionValue,
} from "./lib/cliArgs.ts";
import { fail, isMainModule, runMain } from "./lib/scriptRuntime.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const defaultOutputPath = path.join(
  repoRoot,
  "apps",
  "noter",
  "convex",
  "starterSeedManifest.generated.ts",
);
const defaultSourceRepository = "noter-md/convex-cloudflare-pages-stack";

const helpText = `Usage: pnpm run starter:refresh -- --source-dir <path> [--output <path>]

Snapshot a local checkout of the dedicated starter source repo into
apps/noter/convex/starterSeedManifest.generated.ts.

Options:
  --source-dir <path>  Local checkout of convex-cloudflare-pages-stack.
  --output <path>      Output file path. Defaults to ${defaultOutputPath}.`;

const EXCLUDED_DIRECTORY_NAMES = new Set([
  ".git",
  ".turbo",
  ".wrangler",
  ".yarn",
  "coverage",
  "dist",
  "node_modules",
]);
const EXCLUDED_FILE_NAMES = new Set(["pnpm-install.hash"]);
const EXCLUDED_FILE_SUFFIXES = [".tsbuildinfo"];

type StarterTemplateManifestSource = {
  repository: string;
  commitSha: string;
};

type StarterTemplateManifest = {
  version: string;
  commitMessage: string;
  source: StarterTemplateManifestSource;
  files: Record<string, string>;
};

type CollectedFile = {
  relativePath: string;
  content: string;
};

function parseArgs(argv: string[]): { outputPath: string; sourceDir: string } {
  let outputPath = defaultOutputPath;
  let sourceDir: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (isHelpArg(arg)) {
      console.log(helpText);
      process.exit(0);
    }

    if (arg === "--output") {
      outputPath = path.resolve(
        repoRoot,
        requireOptionValue(argv, index, arg, helpText),
      );
      index += 1;
      continue;
    }

    if (arg === "--source-dir") {
      sourceDir = path.resolve(
        repoRoot,
        requireOptionValue(argv, index, arg, helpText),
      );
      index += 1;
      continue;
    }

    failUnexpectedArgument(arg, helpText);
  }

  if (sourceDir === null) {
    failMissingRequiredOptions(
      "Missing required option: --source-dir",
      helpText,
    );
  }

  return { outputPath, sourceDir };
}

async function collectFiles(
  rootDir: string,
  currentDir: string,
): Promise<CollectedFile[]> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files: CollectedFile[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path
      .relative(rootDir, absolutePath)
      .split(path.sep)
      .join("/");

    if (entry.isDirectory() && EXCLUDED_DIRECTORY_NAMES.has(entry.name)) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(rootDir, absolutePath)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (
      EXCLUDED_FILE_NAMES.has(entry.name) ||
      EXCLUDED_FILE_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))
    ) {
      continue;
    }

    const content = await readFile(absolutePath, "utf8");
    files.push({ relativePath, content });
  }

  return files;
}

async function ensureDirectoryExists(targetDir: string): Promise<void> {
  const directoryStats = await stat(targetDir).catch(() => null);
  if (!directoryStats?.isDirectory()) {
    fail(`Starter source directory does not exist: ${targetDir}`);
  }
}

function readGitCommitSha(sourceDir: string): string {
  return execFileSync("git", ["-C", sourceDir, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
}

function readGitRemote(sourceDir: string): string | null {
  try {
    return execFileSync(
      "git",
      ["-C", sourceDir, "config", "--get", "remote.origin.url"],
      {
        encoding: "utf8",
      },
    ).trim();
  } catch {
    return null;
  }
}

function normalizeSourceRepository(remoteUrl: string | null): string {
  if (!remoteUrl) {
    return defaultSourceRepository;
  }

  const trimmedRemoteUrl = remoteUrl.trim();
  const sshMatch = trimmedRemoteUrl.match(/github\.com[:/](.+?)(?:\.git)?$/);
  if (sshMatch?.[1]) {
    return sshMatch[1];
  }

  const httpsMatch = trimmedRemoteUrl.match(/github\.com\/(.+?)(?:\.git)?$/);
  if (httpsMatch?.[1]) {
    return httpsMatch[1];
  }

  return defaultSourceRepository;
}

async function main(): Promise<void> {
  const { outputPath, sourceDir } = parseArgs(process.argv.slice(2));

  await ensureDirectoryExists(sourceDir);

  const files = await collectFiles(sourceDir, sourceDir);
  files.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );

  if (files.length === 0) {
    fail(`Starter export found no files in ${sourceDir}`);
  }

  const commitSha = readGitCommitSha(sourceDir);
  const sourceRepository = normalizeSourceRepository(readGitRemote(sourceDir));
  const manifest: StarterTemplateManifest = {
    version: `starter-template-${commitSha.slice(0, 12)}`,
    commitMessage: "chore: seed starter template",
    source: {
      repository: sourceRepository,
      commitSha,
    },
    files: Object.fromEntries(
      files.map((file): [string, string] => [file.relativePath, file.content]),
    ),
  };

  const generated = `// @generated by scripts/refresh-starter-manifest.ts\n\nexport type StarterTemplateManifestSource = {\n  repository: string;\n  commitSha: string;\n};\n\nexport type StarterTemplateManifest = {\n  version: string;\n  commitMessage: string;\n  source: StarterTemplateManifestSource;\n  files: Record<string, string>;\n};\n\nexport const starterTemplateManifest: StarterTemplateManifest = ${JSON.stringify(
    manifest,
    null,
    2,
  )};\n`;

  await writeFile(outputPath, generated, "utf8");

  console.log(
    `wrote ${outputPath} from ${manifest.source.repository}@${manifest.source.commitSha}`,
  );
}

if (isMainModule(import.meta.url)) {
  await runMain(main);
}

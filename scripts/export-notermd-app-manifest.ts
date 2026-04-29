import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { TextDecoder } from "node:util";

const execFileAsync = promisify(execFile);

const sourceOwner = "notermd";
const sourceRepoName = "app";
const defaultSourceBranch = "main";
const sourceRepo = `https://github.com/${sourceOwner}/${sourceRepoName}.git`;
const githubApiBase = "https://api.github.com";
const PNPM_COMMAND = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

type CollectedFile = {
  relativePath: string;
  content: string;
  encoding: "utf-8" | "base64";
  rawContent: Buffer;
};

type ExportOptions = {
  sourceBranch: string;
};

function normalizeBranch(branch: string): string {
  const trimmed = branch.trim();
  if (trimmed.length === 0) {
    throw new Error("Template source branch cannot be empty");
  }
  return trimmed;
}

function printUsage(): void {
  console.log(`Usage: pnpm run template:export -- [--branch <branch>]

Exports the notermd/app starter snapshot into starterSeedManifest.generated.ts.

Options:
  --branch <branch>  notermd/app branch to export. Defaults to ${defaultSourceBranch}.`);
}

function parseArgs(argv: readonly string[]): ExportOptions {
  let sourceBranch = defaultSourceBranch;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    if (arg === "--branch") {
      const value = argv.at(index + 1);
      if (value === undefined || value.startsWith("--")) {
        throw new Error("--branch requires a branch name");
      }
      sourceBranch = normalizeBranch(value);
      index += 1;
      continue;
    }

    const branchPrefix = "--branch=";
    if (arg.startsWith(branchPrefix)) {
      sourceBranch = normalizeBranch(arg.slice(branchPrefix.length));
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return { sourceBranch };
}

async function readToken(): Promise<string> {
  const envToken =
    process.env.NOTER_TEMPLATE_GITHUB_TOKEN ??
    process.env.GITHUB_TOKEN ??
    process.env.GH_TOKEN;
  if (envToken?.trim()) {
    return envToken.trim();
  }

  try {
    const { stdout } = await execFileAsync("gh", ["auth", "token"], {
      encoding: "utf8",
    });
    const token = stdout.trim();
    if (token) {
      return token;
    }
  } catch {
    // Fall through to the explicit error below.
  }

  throw new Error(
    "Set NOTER_TEMPLATE_GITHUB_TOKEN, GITHUB_TOKEN, GH_TOKEN, or run gh auth login before exporting notermd/app.",
  );
}

async function githubFetch(token: string, url: string): Promise<Response> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub request failed ${response.status} for ${url}: ${body}`,
    );
  }

  return response;
}

async function resolveSourceCommit(args: {
  token: string;
  sourceBranch: string;
}): Promise<string> {
  const response = await githubFetch(
    args.token,
    `${githubApiBase}/repos/${sourceOwner}/${sourceRepoName}/commits/${encodeURIComponent(args.sourceBranch)}`,
  );
  const json: unknown = await response.json();
  if (typeof json !== "object" || json === null) {
    throw new Error("GitHub commit response was not an object");
  }
  const sha = Reflect.get(json, "sha");
  if (typeof sha !== "string" || sha.length === 0) {
    throw new Error("GitHub commit response did not include a sha");
  }
  return sha;
}

async function downloadArchive(args: {
  token: string;
  sourceCommit: string;
  outputPath: string;
}): Promise<void> {
  const response = await githubFetch(
    args.token,
    `${githubApiBase}/repos/${sourceOwner}/${sourceRepoName}/tarball/${args.sourceCommit}`,
  );
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error("Downloaded notermd/app archive was empty");
  }
  await writeFile(args.outputPath, buffer);
}

async function extractArchive(args: {
  archivePath: string;
  extractDir: string;
}): Promise<void> {
  try {
    await execFileAsync("tar", [
      "-xzf",
      args.archivePath,
      "-C",
      args.extractDir,
      "--strip-components=1",
    ]);
  } catch (error) {
    throw new Error(
      "Template export requires a tar executable that can extract gzip archives. Install tar or run the export from macOS, Linux, WSL, or Git Bash.",
      { cause: error },
    );
  }
}

async function runPnpm(args: readonly string[], cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const childProcess = spawn(PNPM_COMMAND, args, {
      cwd,
      stdio: "inherit",
    });

    childProcess.on("error", reject);
    childProcess.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal === null
            ? `pnpm ${args.join(" ")} failed with exit code ${code ?? "unknown"}`
            : `pnpm ${args.join(" ")} exited with signal ${signal}`,
        ),
      );
    });
  });
}

async function formatGeneratedFile(
  filePath: string,
  cwd: string,
): Promise<void> {
  await runPnpm(["exec", "vp", "fmt", filePath], cwd);
}

function containsBinaryControlByte(buffer: Buffer): boolean {
  for (const byte of buffer) {
    if (byte === 0) {
      return true;
    }

    const isAllowedTextControlByte =
      byte === 9 || byte === 10 || byte === 12 || byte === 13;
    if (byte < 32 && !isAllowedTextControlByte) {
      return true;
    }
  }

  return false;
}

async function collectFiles(
  rootDir: string,
  currentDir: string,
): Promise<CollectedFile[]> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files: CollectedFile[] = [];
  const decoder = new TextDecoder("utf-8", { fatal: true });

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path
      .relative(rootDir, absolutePath)
      .split(path.sep)
      .join("/");

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(rootDir, absolutePath)));
      continue;
    }

    if (!entry.isFile()) {
      throw new Error(`Unsupported starter archive entry: ${relativePath}`);
    }

    const buffer = await readFile(absolutePath);
    if (containsBinaryControlByte(buffer)) {
      files.push({
        relativePath,
        content: buffer.toString("base64"),
        encoding: "base64",
        rawContent: buffer,
      });
      continue;
    }

    try {
      files.push({
        relativePath,
        content: decoder.decode(buffer),
        encoding: "utf-8",
        rawContent: buffer,
      });
    } catch (error) {
      if (!(error instanceof TypeError)) {
        throw error;
      }
      files.push({
        relativePath,
        content: buffer.toString("base64"),
        encoding: "base64",
        rawContent: buffer,
      });
    }
  }

  return files;
}

function computeContentHash(files: CollectedFile[]): string {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.relativePath);
    hash.update("\0");
    hash.update(file.encoding);
    hash.update("\0");
    hash.update(String(file.rawContent.length));
    hash.update("\0");
    hash.update(file.rawContent);
    hash.update("\0");
  }
  return hash.digest("hex");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const outputPath = path.resolve(
  repoRoot,
  "apps/noter/convex/starterSeedManifest.generated.ts",
);

const { sourceBranch } = parseArgs(process.argv.slice(2));
const token = await readToken();
const sourceCommit = await resolveSourceCommit({ token, sourceBranch });
const tempDir = await mkdtemp(path.join(os.tmpdir(), "notermd-app-template-"));
const archivePath = path.join(tempDir, "source.tar.gz");
const extractDir = path.join(tempDir, "source");

try {
  await downloadArchive({ token, sourceCommit, outputPath: archivePath });
  await mkdir(extractDir, { recursive: true });
  await extractArchive({ archivePath, extractDir });

  const files = await collectFiles(extractDir, extractDir);
  files.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );

  if (files.length === 0) {
    throw new Error("notermd/app archive contained no files");
  }

  const contentHash = computeContentHash(files);
  const textFiles = Object.fromEntries(
    files
      .filter((file) => file.encoding === "utf-8")
      .map((file): [string, string] => [file.relativePath, file.content]),
  );
  const binaryFiles = Object.fromEntries(
    files
      .filter((file) => file.encoding === "base64")
      .map((file): [string, string] => [file.relativePath, file.content]),
  );
  const manifest = {
    version: `notermd-app-${sourceCommit.slice(0, 12)}`,
    sourceRepo,
    sourceBranch,
    sourceCommit,
    contentHash,
    commitMessage: "chore: seed starter template",
    files: textFiles,
    binaryFiles,
  };

  const generated = `// @generated by scripts/export-notermd-app-manifest.ts\n\nexport type StarterTemplateManifest = {\n  version: string;\n  sourceRepo: string;\n  sourceBranch: string;\n  sourceCommit: string;\n  contentHash: string;\n  commitMessage: string;\n  files: Record<string, string>;\n  binaryFiles: Record<string, string>;\n};\n\nexport const starterTemplateManifest: StarterTemplateManifest = ${JSON.stringify(
    manifest,
    null,
    2,
  )};\n`;

  await writeFile(outputPath, generated, "utf8");
  await formatGeneratedFile(outputPath, repoRoot);
  console.log(
    `wrote ${outputPath} from ${sourceRepo} ${sourceBranch}@${sourceCommit} (${files.length} files)`,
  );
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

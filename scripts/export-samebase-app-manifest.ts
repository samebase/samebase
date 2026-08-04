import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { TextDecoder } from "node:util";
import { trackedFilePath } from "./lib/trackedFilePath.ts";

const execFileAsync = promisify(execFile);

const sourceOwner = "samebase";
const sourceRepoName = "app";
const defaultSourceBranch = "main";
const sourceRepo = `https://github.com/${sourceOwner}/${sourceRepoName}.git`;
const githubApiBase = "https://api.github.com";
const githubRequestTimeoutMs = 30_000;
const PNPM_COMMAND = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

// rawContent and mode are the source of truth for hashing; content is only the
// deterministic UTF-8/base64 manifest representation derived from those bytes.
type CollectedFile = {
  relativePath: string;
  content: string;
  encoding: "utf-8" | "base64";
  rawContent: Buffer;
  mode: "100644" | "100755";
};

type ExportOptions = {
  sourceBranch: string;
};

function normalizeGeneratedText(content: string): string {
  return content.replaceAll("\u2014", "-");
}

function isExecutableCollectedFile(
  file: CollectedFile,
  // eslint-disable-next-line samebase/no-hand-written-type-predicate -- property-literal intersection: the check narrows the property, not the object (guard conversion fails TS2322)
): file is CollectedFile & { mode: "100755" } {
  return file.mode === "100755";
}

function normalizeBranch(branch: string): string {
  const trimmed = branch.trim();
  if (trimmed.length === 0) {
    throw new Error("Template source branch cannot be empty");
  }
  return trimmed;
}

function printUsage(): void {
  console.log(`Usage: pnpm run template:export -- [--branch <branch>]

Exports the samebase/app starter snapshot into starterSeedManifest.generated.ts.

Options:
  --branch <branch>  samebase/app branch to export. Defaults to ${defaultSourceBranch}.`);
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

async function githubFetch(token: string | undefined, url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, githubRequestTimeoutMs);
  const headers = new Headers({
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  });
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  let response: Response;

  try {
    response = await fetch(url, {
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`GitHub request timed out after ${githubRequestTimeoutMs}ms for ${url}`, {
        cause: error,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub request failed ${response.status} for ${url}: ${body}`);
  }

  return response;
}

async function resolveSourceCommit(args: {
  token: string | undefined;
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
  if (!("sha" in json) || typeof json.sha !== "string" || json.sha.length === 0) {
    throw new Error("GitHub commit response did not include a sha");
  }
  return json.sha;
}

async function downloadArchive(args: {
  token: string | undefined;
  sourceCommit: string;
  outputPath: string;
}): Promise<void> {
  const response = await githubFetch(
    args.token,
    `${githubApiBase}/repos/${sourceOwner}/${sourceRepoName}/tarball/${args.sourceCommit}`,
  );
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error("Downloaded samebase/app archive was empty");
  }
  await writeFile(args.outputPath, buffer);
}

async function extractArchive(args: { archivePath: string; extractDir: string }): Promise<void> {
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
      shell: process.platform === "win32",
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

async function formatGeneratedFile(filePath: string, cwd: string): Promise<void> {
  await runPnpm(["exec", "vp", "fmt", filePath], cwd);
}

function containsBinaryControlByte(buffer: Buffer): boolean {
  for (const byte of buffer) {
    if (byte === 0) {
      return true;
    }

    const isAllowedTextControlByte = byte === 9 || byte === 10 || byte === 12 || byte === 13;
    if (byte < 32 && !isAllowedTextControlByte) {
      return true;
    }
  }

  return false;
}

async function collectFiles(rootDir: string, currentDir: string): Promise<CollectedFile[]> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files: CollectedFile[] = [];
  const decoder = new TextDecoder("utf-8", { fatal: true });

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path.relative(rootDir, absolutePath).split(path.sep).join("/");

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(rootDir, absolutePath)));
      continue;
    }

    if (!entry.isFile()) {
      throw new Error(`Unsupported starter archive entry: ${relativePath}`);
    }

    const fileStats = await stat(absolutePath);
    const mode = (fileStats.mode & 0o111) === 0 ? "100644" : "100755";

    const buffer = await readFile(absolutePath);
    if (containsBinaryControlByte(buffer)) {
      files.push({
        relativePath,
        content: buffer.toString("base64"),
        encoding: "base64",
        rawContent: buffer,
        mode,
      });
      continue;
    }

    try {
      const content = normalizeGeneratedText(decoder.decode(buffer));
      const rawContent = Buffer.from(content, "utf8");
      files.push({
        relativePath,
        content,
        encoding: "utf-8",
        rawContent,
        mode,
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
        mode,
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
    hash.update(file.mode);
    hash.update("\0");
    hash.update(String(file.rawContent.length));
    hash.update("\0");
    hash.update(file.rawContent);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function compareUtf8PathBytes(left: string, right: string): number {
  // Compare bytes, not locale collation, so manifest ordering is identical
  // across Node runtimes and ICU builds.
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const outputPath = path.resolve(
  repoRoot,
  trackedFilePath("apps/samebase/convex/starterSeedManifest.generated.ts"),
);

const { sourceBranch } = parseArgs(process.argv.slice(2));
const token = process.env.SAMEBASE_TEMPLATE_GITHUB_TOKEN?.trim() || undefined;
const sourceCommit = await resolveSourceCommit({ token, sourceBranch });
const tempDir = await mkdtemp(path.join(os.tmpdir(), "samebase-app-template-"));
const archivePath = path.join(tempDir, "source.tar.gz");
const extractDir = path.join(tempDir, "source");

try {
  await downloadArchive({ token, sourceCommit, outputPath: archivePath });
  await mkdir(extractDir, { recursive: true });
  await extractArchive({ archivePath, extractDir });

  const files = await collectFiles(extractDir, extractDir);
  files.sort((left, right) => compareUtf8PathBytes(left.relativePath, right.relativePath));

  if (files.length === 0) {
    throw new Error("samebase/app archive contained no files");
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
  const fileModes = Object.fromEntries(
    files
      .filter(isExecutableCollectedFile)
      .map((file): [string, "100755"] => [file.relativePath, file.mode]),
  );
  const manifest = {
    version: `samebase-app-${sourceCommit.slice(0, 12)}`,
    sourceRepo,
    sourceBranch,
    sourceCommit,
    contentHash,
    commitMessage: "chore: seed starter template",
    files: textFiles,
    binaryFiles,
    fileModes,
  };

  const generated = `// @generated by scripts/export-samebase-app-manifest.ts\n\nexport type StarterTemplateManifest = {\n  version: string;\n  sourceRepo: string;\n  sourceBranch: string;\n  sourceCommit: string;\n  contentHash: string;\n  commitMessage: string;\n  files: Record<string, string>;\n  binaryFiles: Record<string, string>;\n  fileModes: Record<string, "100644" | "100755">;\n};\n\nexport const starterTemplateManifest: StarterTemplateManifest = ${JSON.stringify(
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

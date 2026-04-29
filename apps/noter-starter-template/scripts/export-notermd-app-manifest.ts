import { execFile } from "node:child_process";
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
const sourceBranch = "main";
const sourceRepo = `https://github.com/${sourceOwner}/${sourceRepoName}.git`;
const githubApiBase = "https://api.github.com";

type CollectedFile = {
  relativePath: string;
  content: string;
};

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

async function resolveSourceCommit(token: string): Promise<string> {
  const response = await githubFetch(
    token,
    `${githubApiBase}/repos/${sourceOwner}/${sourceRepoName}/commits/${sourceBranch}`,
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

async function formatGeneratedFile(
  filePath: string,
  cwd: string,
): Promise<void> {
  await execFileAsync("pnpm", ["exec", "vp", "fmt", filePath], { cwd });
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
    let content: string;
    try {
      content = decoder.decode(buffer);
    } catch (error) {
      throw new Error(
        `Starter archive file is not UTF-8 text: ${relativePath}`,
        { cause: error },
      );
    }

    files.push({ relativePath, content });
  }

  return files;
}

function computeContentHash(files: CollectedFile[]): string {
  const hash = createHash("sha256");
  for (const file of files) {
    const content = Buffer.from(file.content, "utf8");
    hash.update(file.relativePath);
    hash.update("\0");
    hash.update(String(content.length));
    hash.update("\0");
    hash.update(content);
    hash.update("\0");
  }
  return hash.digest("hex");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const baseDir = path.resolve(__dirname, "..");
const outputPath = path.resolve(
  baseDir,
  "../noter/convex/starterSeedManifest.generated.ts",
);

const token = await readToken();
const sourceCommit = await resolveSourceCommit(token);
const tempDir = await mkdtemp(path.join(os.tmpdir(), "notermd-app-template-"));
const archivePath = path.join(tempDir, "source.tar.gz");
const extractDir = path.join(tempDir, "source");

try {
  await downloadArchive({ token, sourceCommit, outputPath: archivePath });
  await mkdir(extractDir, { recursive: true });
  await execFileAsync("tar", [
    "-xzf",
    archivePath,
    "-C",
    extractDir,
    "--strip-components=1",
  ]);

  const files = await collectFiles(extractDir, extractDir);
  files.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );

  if (files.length === 0) {
    throw new Error("notermd/app archive contained no files");
  }

  const contentHash = computeContentHash(files);
  const manifest = {
    version: `notermd-app-${sourceCommit.slice(0, 12)}`,
    sourceRepo,
    sourceBranch,
    sourceCommit,
    contentHash,
    commitMessage: "chore: seed starter template",
    files: Object.fromEntries(
      files.map((file): [string, string] => [file.relativePath, file.content]),
    ),
  };

  const generated = `// @generated by apps/noter-starter-template/scripts/export-notermd-app-manifest.ts\n\nexport type StarterTemplateManifest = {\n  version: string;\n  sourceRepo: string;\n  sourceBranch: string;\n  sourceCommit: string;\n  contentHash: string;\n  commitMessage: string;\n  files: Record<string, string>;\n};\n\nexport const starterTemplateManifest: StarterTemplateManifest = ${JSON.stringify(
    manifest,
    null,
    2,
  )};\n`;

  await writeFile(outputPath, generated, "utf8");
  await formatGeneratedFile(outputPath, baseDir);
  console.log(
    `wrote ${outputPath} from ${sourceRepo}#${sourceCommit} (${files.length} files)`,
  );
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

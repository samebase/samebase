import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type EnsureRepoAutoCdArgs = {
  repoPath: string;
  bashProfileFiles?: readonly string[];
  fishProfileFiles?: readonly string[];
};

export const DEFAULT_BASH_PROFILE_FILES = [
  "/root/.bashrc",
  "/home/daytona/.bashrc",
  "/etc/bash.bashrc",
];

export const DEFAULT_FISH_PROFILE_FILES = [
  "/root/.config/fish/config.fish",
  "/home/daytona/.config/fish/config.fish",
];

function quoteForShell(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function isEnoentError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function ensureLineInFile(
  filePath: string,
  line: string,
  { ensureParentDir }: { ensureParentDir: boolean },
) {
  if (ensureParentDir) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
  }

  let existingContents = "";
  try {
    existingContents = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (isEnoentError(error)) {
      existingContents = "";
    } else {
      throw error;
    }
  }

  const existingLines = existingContents
    .split("\n")
    .map((value) => value.replace(/\r$/, ""));
  if (existingLines.includes(line)) {
    return;
  }

  const nextContents =
    existingContents.length === 0
      ? `${line}\n`
      : existingContents.endsWith("\n")
        ? `${existingContents}${line}\n`
        : `${existingContents}\n${line}\n`;

  await fs.writeFile(filePath, nextContents, "utf8");
}

export async function ensureRepoAutoCd(args: EnsureRepoAutoCdArgs) {
  const line = `cd ${quoteForShell(args.repoPath)}`;

  for (const filePath of args.bashProfileFiles ?? DEFAULT_BASH_PROFILE_FILES) {
    await ensureLineInFile(filePath, line, { ensureParentDir: false });
  }

  for (const filePath of args.fishProfileFiles ?? DEFAULT_FISH_PROFILE_FILES) {
    await ensureLineInFile(filePath, line, { ensureParentDir: true });
  }
}

async function main() {
  const repoPath = process.argv.at(2);
  if (repoPath === undefined || repoPath === "") {
    throw new Error(
      "Usage: node runtime/daytonaSandboxPrograms/ensureRepoAutoCd.ts <repoPath>",
    );
  }

  await ensureRepoAutoCd({ repoPath });
}

const currentFilePath = fileURLToPath(import.meta.url);
const invokedFilePath = process.argv[1] ? path.resolve(process.argv[1]) : null;

if (invokedFilePath === currentFilePath) {
  await main();
}

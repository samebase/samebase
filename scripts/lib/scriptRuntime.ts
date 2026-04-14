import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

export class ScriptError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "ScriptError";
    this.exitCode = exitCode;
  }
}

export function fail(message: string, exitCode = 1): never {
  throw new ScriptError(message, exitCode);
}

export function isMainModule(moduleUrl: string): boolean {
  return process.argv[1] === fileURLToPath(moduleUrl);
}

/**
 * Keep script entrypoints thin and route failures through one stderr/exit-code
 * path instead of open-coding that wrapper in every CLI.
 */
export async function runMain(run: () => Promise<void> | void): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof ScriptError) {
      console.error(error.message);
      process.exit(error.exitCode);
    }

    if (error instanceof Error) {
      console.error(error.message);
      process.exit(1);
    }

    console.error(String(error));
    process.exit(1);
  }
}

export function resolveRepoRoot(cwd = process.cwd()): string {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return cwd;
  }

  return result.stdout.trim() || cwd;
}

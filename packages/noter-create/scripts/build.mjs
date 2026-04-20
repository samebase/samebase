import { spawnSync } from "node:child_process";
import { cp, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const appRoot = path.resolve(packageRoot, "../../apps/noter");
const generatedDir = path.join(packageRoot, "component", "_generated");
const distGeneratedDir = path.join(
  packageRoot,
  "dist",
  "component",
  "_generated",
);

await rm(path.join(packageRoot, "dist"), { force: true, recursive: true });

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const build = spawnSync(
  pnpmCommand,
  [
    "--dir",
    appRoot,
    "exec",
    "tsc",
    "-p",
    path.join(packageRoot, "tsconfig.build.json"),
  ],
  {
    cwd: packageRoot,
    stdio: "inherit",
  },
);

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

await cp(generatedDir, distGeneratedDir, { recursive: true });

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const oxfmtConfigPath = path.join(repoRoot, ".oxfmtrc.json");
const require = createRequire(import.meta.url);
const vitePlusPackagePath = require.resolve("vite-plus/package.json");
const vitePlusRequire = createRequire(vitePlusPackagePath);
const vpOxfmtBinPath = vitePlusRequire.resolve("oxfmt/bin/oxfmt");

/**
 * Keep generated files aligned with the formatter version shipped by vite-plus
 * instead of maintaining a second workspace oxfmt dependency for scripts/tests.
 */
export function formatWithOxfmt(
  filePath: string,
  contents: string,
): Promise<string> {
  const normalizedContents = contents.endsWith("\n")
    ? contents
    : `${contents}\n`;

  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        vpOxfmtBinPath,
        "--config",
        oxfmtConfigPath,
        `--stdin-filepath=${filePath}`,
      ],
      {
        cwd: repoRoot,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            stderr.trim() || `oxfmt exited with code ${code ?? "unknown"}`,
          ),
        );
        return;
      }

      resolve(stdout.endsWith("\n") ? stdout : `${stdout}\n`);
    });

    child.stdin.end(normalizedContents);
  });
}

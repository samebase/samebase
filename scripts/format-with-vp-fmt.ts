import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

/**
 * Keep generated files aligned with the checked-in formatter config instead of
 * duplicating formatting options across build scripts and tests. The repo uses
 * `vp fmt` as the formatter entrypoint so generated output stays aligned with
 * the shipped Vite+ toolchain.
 */
export function formatWithVpFmt(
  filePath: string,
  contents: string,
): Promise<string> {
  const normalizedContents = contents.endsWith("\n")
    ? contents
    : `${contents}\n`;

  return new Promise((resolve, reject) => {
    const child = spawn(
      "pnpm",
      ["exec", "vp", "fmt", `--stdin-filepath=${filePath}`],
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
            stderr.trim() || `vp fmt exited with code ${code ?? "unknown"}`,
          ),
        );
        return;
      }

      resolve(stdout.endsWith("\n") ? stdout : `${stdout}\n`);
    });

    child.stdin.end(normalizedContents);
  });
}

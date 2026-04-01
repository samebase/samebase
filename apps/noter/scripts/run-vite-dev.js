import { spawn } from "child_process";
import { createRequire } from "module";
import { realpathSync } from "fs";
import path from "path";

const require = createRequire(import.meta.url);

/**
 * Resolve the real Vite CLI entrypoint so native Windows does not depend on
 * shell-specific `${VITE_PORT:-5173}` expansion to start the frontend.
 */
function resolveViteCliEntrypoint() {
  const vitePackageJsonPath = require.resolve("vite/package.json");
  return realpathSync(
    path.join(path.dirname(vitePackageJsonPath), "bin", "vite.js"),
  );
}

/**
 * Keep the existing `VITE_PORT` override behavior while defaulting to the same
 * port Vite would have used before the Windows-safe wrapper existed.
 */
function readVitePort() {
  const configuredPort = process.env.VITE_PORT?.trim();
  return configuredPort && configuredPort.length > 0 ? configuredPort : "5173";
}

const child = spawn(
  process.execPath,
  [
    resolveViteCliEntrypoint(),
    "--host",
    "0.0.0.0",
    "--port",
    readVitePort(),
    ...process.argv.slice(2),
  ],
  {
    env: process.env,
    stdio: "inherit",
  },
);

child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  }
  process.exit(code ?? 1);
});

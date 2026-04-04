import { spawn } from "child_process";
import { createRequire } from "module";
import { realpathSync } from "fs";
import path from "path";
import {
  clearLocalDevOriginState,
  readConfiguredLocalDevPort,
  resolveLocalDevPort,
  writeLocalDevOriginState,
} from "../convex-local-utils.js";

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

function splitVitePortArgs(args) {
  const passthroughArgs = [];
  let port = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--port") {
      const candidate = args[index + 1];
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        port = candidate.trim();
        index += 1;
        continue;
      }
    }

    if (typeof arg === "string" && arg.startsWith("--port=")) {
      const candidate = arg.slice("--port=".length).trim();
      if (candidate.length > 0) {
        port = candidate;
        continue;
      }
    }

    passthroughArgs.push(arg);
  }

  return {
    passthroughArgs,
    port,
  };
}

const cliArgs = process.argv.slice(2);
const { passthroughArgs, port: cliPort } = splitVitePortArgs(cliArgs);
// Trust an already-selected VITE_PORT so predev-selected SITE_URL and the later
// Vite listener stay pinned to the same localhost origin.
const vitePort =
  cliPort ??
  readConfiguredLocalDevPort(process.env) ??
  resolveLocalDevPort(process.env);
writeLocalDevOriginState(`http://localhost:${vitePort}`);
const launchArgs = [
  resolveViteCliEntrypoint(),
  "--host",
  "0.0.0.0",
  "--port",
  vitePort,
  "--strictPort",
  ...passthroughArgs,
];

const child = spawn(process.execPath, launchArgs, {
  env: process.env,
  stdio: "inherit",
});

child.on("error", (error) => {
  clearLocalDevOriginState();
  console.error(error.message);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  clearLocalDevOriginState();
  if (signal) {
    process.kill(process.pid, signal);
  }
  process.exit(code ?? 1);
});

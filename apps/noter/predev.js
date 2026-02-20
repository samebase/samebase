import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parsePort = (url) => {
  try {
    return new URL(url).port;
  } catch {
    return null;
  }
};

const readEnvFile = () => {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    return {};
  }
  const contents = fs.readFileSync(envPath, "utf8");
  const env = {};
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const [key, ...rest] = trimmed.split("=");
    if (!key) continue;
    env[key] = rest.join("=");
  }
  return env;
};

const isConvexLocalBackend = async (port) => {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/instance_name`, {
      method: "GET",
    });
    if (!response.ok) {
      return false;
    }
    const name = (await response.text()).trim();
    return name.startsWith("anonymous-") || name.startsWith("local-");
  } catch {
    return false;
  }
};

const findPidsOnPort = (port) => {
  const result = spawnSync("lsof", ["-tiTCP:" + port, "-sTCP:LISTEN"], {
    encoding: "utf8",
  });
  if (result.status !== 0 || !result.stdout) {
    return [];
  }
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
};

const killPids = (pids, signal) => {
  for (const pid of pids) {
    spawnSync("kill", ["-" + signal, pid], { stdio: "ignore" });
  }
};

const stopLocalBackendIfRunning = async () => {
  const env = readEnvFile();
  const envUrl = env.CONVEX_URL ?? env.VITE_CONVEX_URL;
  const portFromEnv = envUrl ? parsePort(envUrl) : null;
  const port = portFromEnv ? Number(portFromEnv) : 3210;
  if (!Number.isFinite(port)) {
    return;
  }
  const isRunning = await isConvexLocalBackend(port);
  if (!isRunning) {
    return;
  }
  const pids = findPidsOnPort(port);
  if (pids.length === 0) {
    return;
  }
  killPids(pids, "TERM");
  await sleep(500);
  const remaining = findPidsOnPort(port);
  if (remaining.length > 0) {
    killPids(remaining, "KILL");
  }
};

if (process.env.CONVEX_AGENT_MODE === "anonymous") {
  await stopLocalBackendIfRunning();
  run("node", ["convex-dev.js", "--until-success", "--codegen=enable"]);
  process.exit(0);
}

run("node", ["convex-dev.js", "--until-success", "--codegen=enable"]);
run("node", ["setup.mjs", "--once"]);
run("node", ["sync-site-url.mjs"]);

import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import {
  listListeningPids,
  parsePort,
  readEnvFile,
  sleep,
  usesLocalConvexDeployment,
} from "./convex-local-utils.ts";

const run = (command: string, args: string[]) => {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const captureConvexReadme = () => {
  const readmePath = path.join(process.cwd(), "convex", "README.md");
  if (!fs.existsSync(readmePath)) {
    return null;
  }
  return {
    path: readmePath,
    contents: fs.readFileSync(readmePath, "utf8"),
  };
};

const restoreConvexReadmeIfOverwritten = (
  snapshot: { path: string; contents: string } | null,
) => {
  if (!snapshot) {
    return;
  }
  if (!fs.existsSync(snapshot.path)) {
    return;
  }
  const current = fs.readFileSync(snapshot.path, "utf8");
  if (!current.startsWith("# Welcome to your Convex functions directory!")) {
    return;
  }
  if (current === snapshot.contents) {
    return;
  }
  fs.writeFileSync(snapshot.path, snapshot.contents, "utf8");
};

const isConvexLocalBackend = async (port: number) => {
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

const killPids = (pids: string[], signal: "TERM" | "KILL") => {
  if (process.platform === "win32") {
    // Windows needs taskkill for process trees; only add /F on the KILL pass so TERM remains the graceful first attempt.
    for (const pid of pids) {
      const args = ["/PID", String(pid), "/T"];
      if (signal === "KILL") {
        args.push("/F");
      }
      spawnSync("taskkill", args, { stdio: "ignore" });
    }
    return;
  }

  for (const pid of pids) {
    spawnSync("kill", ["-" + signal, String(pid)], { stdio: "ignore" });
  }
};

const shouldManageLocalBackend = () =>
  process.env.CONVEX_AGENT_MODE === "anonymous" || usesLocalConvexDeployment();

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
  const pids = listListeningPids(port);
  if (pids.length === 0) {
    return;
  }
  killPids(pids, "TERM");
  await sleep(500);
  const remaining = listListeningPids(port);
  if (remaining.length > 0) {
    killPids(remaining, "KILL");
  }
};

const maybeStopLocalBackendIfRunning = async () => {
  if (!shouldManageLocalBackend()) {
    return;
  }
  await stopLocalBackendIfRunning();
};

if (process.env.CONVEX_AGENT_MODE === "anonymous") {
  const readmeSnapshot = captureConvexReadme();
  await maybeStopLocalBackendIfRunning();
  run("node", ["scripts/convex-dev.ts", "--until-success", "--codegen=enable"]);
  restoreConvexReadmeIfOverwritten(readmeSnapshot);
  process.exit(0);
}

const readmeSnapshot = captureConvexReadme();
await maybeStopLocalBackendIfRunning();
run("node", ["scripts/convex-dev.ts", "--until-success", "--codegen=enable"]);
restoreConvexReadmeIfOverwritten(readmeSnapshot);
run("node", ["scripts/setup.ts", "--once"]);
run("node", ["scripts/sync-site-url.ts"]);

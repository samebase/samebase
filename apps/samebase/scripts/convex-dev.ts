import fs from "fs";
import os from "os";
import path from "path";
import { spawn, spawnSync } from "child_process";
import {
  readLocalDevOriginState,
  isPortInUse,
  sleep,
  usesLocalConvexDeployment,
  waitForLocalBackend,
} from "./convex-local-utils.ts";
import { guard } from "@samebase/dependent/main";
import { pickAvailableLocalBackendPorts } from "../../../runtime/localBackendPorts.ts";

const SUPPORTED_NODE_MAJORS = ["24", "22", "20", "18"];

const semverCompare = (a: string, b: string) => {
  const aParts = a.slice(1).split(".").map(Number);
  const bParts = b.slice(1).split(".").map(Number);
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i += 1) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
};

const readNodeMajorFromConfig = () => {
  const configPath = path.join(process.cwd(), "convex.json");
  if (!fs.existsSync(configPath)) {
    return null;
  }
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const raw = config?.node?.nodeVersion;
    if (typeof raw === "number") {
      return String(raw);
    }
    if (typeof raw === "string" && raw.trim().length > 0) {
      return raw.trim();
    }
    return null;
  } catch {
    return null;
  }
};

const pickNodeBinFromNvm = (preferredMajors: string[]) => {
  const nvmCandidates: string[] = Array.from(
    new Set(
      [process.env.NVM_DIR, path.join(os.homedir(), ".nvm")].filter(
        guard<string | undefined, string>((value) =>
          typeof value === "string" && value.length > 0 ? value : null,
        ),
      ),
    ),
  );

  for (const nvmDir of nvmCandidates) {
    const versionsDir = path.join(nvmDir, "versions", "node");
    if (!fs.existsSync(versionsDir)) {
      continue;
    }

    const entries = fs.readdirSync(versionsDir).sort(semverCompare);
    for (const major of preferredMajors) {
      const matching = entries.filter((name) => name.startsWith(`v${major}.`));
      if (matching.length === 0) {
        continue;
      }
      const latest = matching.at(-1);
      if (!latest) {
        continue;
      }
      return path.join(versionsDir, latest, "bin");
    }
  }

  return null;
};

const pickSupportedNodeBin = () => {
  const configuredMajor = readNodeMajorFromConfig();
  const preferredMajors = [];

  if (configuredMajor && SUPPORTED_NODE_MAJORS.includes(configuredMajor)) {
    preferredMajors.push(configuredMajor);
  }
  for (const major of SUPPORTED_NODE_MAJORS) {
    if (!preferredMajors.includes(major)) {
      preferredMajors.push(major);
    }
  }

  const nvmBin = pickNodeBinFromNvm(preferredMajors);
  if (nvmBin) {
    return nvmBin;
  }

  const currentMajor = process.versions.node.split(".")[0];
  if (SUPPORTED_NODE_MAJORS.includes(currentMajor)) {
    return path.dirname(process.execPath);
  }

  return null;
};

const hasCliOption = (args: string[], optionName: string) =>
  args.some((arg) => arg === optionName || arg.startsWith(`${optionName}=`));

const resolveWorktreeRoot = () => {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    stdio: "pipe",
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return process.cwd();
  }
  const root = result.stdout.trim();
  return root.length > 0 ? root : process.cwd();
};

const pickLocalBackendPorts = () => {
  const worktreeRoot = resolveWorktreeRoot();
  const ports = pickAvailableLocalBackendPorts(worktreeRoot, isPortInUse);
  if (ports) {
    return ports;
  }

  console.warn("No free local backend port pair found; falling back to Convex defaults.");
  return null;
};

const isProcessRunning = (processId: number) => {
  try {
    process.kill(processId, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * The Vite wrapper records its origin as it starts, which is often before this process starts, and
 * clears the record when it exits. A record whose process no longer runs is stale.
 */
const waitForLocalDevOrigin = async (timeoutMs: number) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const originState = readLocalDevOriginState();
    if (originState && isProcessRunning(originState.processId)) {
      return originState.origin;
    }
    await sleep(250);
  }
  return null;
};

const env = { ...process.env };
const supportedNodeBin = pickSupportedNodeBin();
if (!supportedNodeBin) {
  console.error(
    "Could not find a supported Node.js runtime (18, 20, 22, or 24) for Convex Node actions.",
  );
  console.error("Install one with nvm (for example `nvm install 24`) and retry.");
  process.exit(1);
}
env.PATH = [supportedNodeBin, env.PATH].filter(Boolean).join(path.delimiter);
const supportedNodeCommand = path.join(
  supportedNodeBin,
  process.platform === "win32" ? "node.exe" : "node",
);

const args = ["dev", ...process.argv.slice(2)];
if (!args.some((arg) => arg.startsWith("--codegen"))) {
  args.push("--codegen=disable");
}
// Every checkout runs a local backend: the logged-in local deployment of a laptop folder, or the
// anonymous one of CI. Each folder keeps its own fixed ports, so the identity hub callback on the
// site port keeps its address from one start to the next.
if (!hasCliOption(args, "--local-cloud-port") && !hasCliOption(args, "--local-site-port")) {
  const localBackendPorts = pickLocalBackendPorts();
  if (localBackendPorts) {
    args.push(
      `--local-cloud-port=${localBackendPorts.cloud}`,
      `--local-site-port=${localBackendPorts.site}`,
    );
  }
}

const localConvexBin = path.join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "convex.cmd" : "convex",
);
const convexExecutable = fs.existsSync(localConvexBin) ? localConvexBin : "convex";
/**
 * Launch the checked-in Convex CLI through Node directly so the long-lived dev
 * server stays attached to the real child process instead of a Windows `.cmd`
 * wrapper that `spawn()` cannot execute reliably on its own.
 */
const buildConvexSpawnInvocation = () => {
  const localConvexEntrypoint = path.join(
    process.cwd(),
    "node_modules",
    "convex",
    "bin",
    "main.js",
  );

  if (fs.existsSync(localConvexEntrypoint)) {
    return {
      args: [fs.realpathSync(localConvexEntrypoint), ...args],
      command: supportedNodeCommand,
    };
  }

  return {
    args,
    command: convexExecutable,
  };
};

const convexInvocation = buildConvexSpawnInvocation();

const child = spawn(convexInvocation.command, convexInvocation.args, {
  stdio: "inherit",
  env,
});
let childExited = false;
let terminateRequested = false;
const hasChildExited = () => childExited;
const shouldRetrySiteUrlSync =
  !args.some((arg) => arg === "--until-success" || arg.startsWith("--until-success=")) &&
  usesLocalConvexDeployment();

child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
child.on("exit", (code) => {
  childExited = true;
  process.exit(code ?? 1);
});

const requestTermination = (signal: NodeJS.Signals) => {
  if (terminateRequested) {
    return;
  }
  terminateRequested = true;

  if (!childExited) {
    try {
      child.kill(signal);
    } catch {
      // ignore
    }
  }

  setTimeout(() => {
    if (childExited) {
      return;
    }
    try {
      child.kill("SIGKILL");
    } catch {
      // ignore
    }
  }, 5000);

  setTimeout(() => {
    if (!childExited) {
      process.exit(1);
    }
  }, 6500);
};

process.on("SIGTERM", () => requestTermination("SIGTERM"));
process.on("SIGINT", () => requestTermination("SIGINT"));

if (shouldRetrySiteUrlSync) {
  void (async () => {
    try {
      const backendReady = await waitForLocalBackend(20_000);
      if (!backendReady || hasChildExited()) {
        return;
      }

      // Give frontend origin publication its own timeout window so slow local
      // backends do not consume the entire retry budget before Vite records
      // the chosen port for this startup.
      const localDevOrigin = await waitForLocalDevOrigin(20_000);
      if (!localDevOrigin || hasChildExited()) {
        return;
      }

      const syncResult = spawnSync(
        supportedNodeCommand,
        [path.join(process.cwd(), "scripts", "sync-site-url.ts")],
        {
          stdio: "inherit",
          env: {
            ...env,
            DEV_ENV_ORIGIN: localDevOrigin,
          },
        },
      );
      if (syncResult.status !== 0) {
        console.warn("Local SITE_URL sync failed after the long-running backend started.");
      }
    } catch (error) {
      console.warn(
        error instanceof Error
          ? error.message
          : "Local SITE_URL sync setup failed after backend startup.",
      );
    }
  })();
}

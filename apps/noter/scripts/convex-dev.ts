import fs from "fs";
import os from "os";
import path from "path";
import { spawn, spawnSync } from "child_process";
import {
  readLocalDevOriginState,
  isPortInUse,
  parsePort,
  sleep,
  usesLocalConvexDeployment,
} from "./convex-local-utils.ts";
import { guard } from "@noter-md/dependent/main";
import { normalizeEnvValue } from "./normalizeEnvValue.ts";
import { pickAvailableAnonymousLocalPorts } from "../../../runtime/anonymousLocalPorts.ts";

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

const pickAnonymousLocalPorts = () => {
  const worktreeRoot = resolveWorktreeRoot();
  const ports = pickAvailableAnonymousLocalPorts(worktreeRoot, isPortInUse);
  if (ports) {
    return ports;
  }

  console.warn("No free anonymous worktree port pair found; falling back to Convex defaults.");
  return null;
};

const normalizePortList = (ports: number[]) =>
  ports.filter(
    (port, index, all) => Number.isFinite(port) && port > 0 && all.indexOf(port) === index,
  );

const readLocalBackendPorts = (preferredPorts: number[] = []) => {
  const strictPreferred = normalizePortList([...preferredPorts]);
  if (strictPreferred.length > 0) {
    return strictPreferred;
  }

  const ports = [3214, 3210];
  const envFile = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envFile)) {
    return ports;
  }

  const contents = fs.readFileSync(envFile, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    if (!line.startsWith("VITE_CONVEX_URL=") && !line.startsWith("CONVEX_URL=")) {
      continue;
    }
    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) {
      continue;
    }
    const rawValue = line.slice(eqIndex + 1).trim();
    const unquoted =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue;
    const parsedPort = parsePort(unquoted);
    if (parsedPort !== null && !ports.includes(parsedPort)) {
      ports.unshift(parsedPort);
    }
  }

  return ports;
};

const isLocalBackendReady = async (port: number) => {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/instance_name`, {
      signal: AbortSignal.timeout(500),
    });
    if (!response.ok) {
      return false;
    }
    const instance = (await response.text()).trim();
    return (
      instance.startsWith("anonymous-") ||
      instance.startsWith("local-") ||
      instance === "anonymous-agent"
    );
  } catch {
    return false;
  }
};

const waitForLocalBackend = async (timeoutMs: number, preferredPorts: number[] = []) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const port of readLocalBackendPorts(preferredPorts)) {
      if (await isLocalBackendReady(port)) {
        return true;
      }
    }
    await sleep(250);
  }
  return false;
};

const waitForRecentLocalDevOrigin = async (timeoutMs: number, sinceMs: number) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const originState = readLocalDevOriginState();
    if (originState && originState.writtenAt >= sinceMs) {
      return originState.origin;
    }
    await sleep(250);
  }
  return null;
};

const removeEnvVar = (name: string, env: NodeJS.ProcessEnv) => {
  spawnSync("npx", ["convex", "env", "remove", name], {
    stdio: "ignore",
    env,
  });
};

const readEnvVar = (name: string, env: NodeJS.ProcessEnv) => {
  const result = spawnSync("npx", ["convex", "env", "get", name], {
    stdio: "pipe",
    encoding: "utf8",
    env,
  });
  if (result.status !== 0) {
    return null;
  }
  return normalizeEnvValue(result.stdout) ?? null;
};

const hasValidPrivateKey = (value: string) =>
  value.includes("-----BEGIN PRIVATE KEY-----") && value.includes("-----END PRIVATE KEY-----");

const hasValidJwks = (value: string) => {
  try {
    const parsed = JSON.parse(value);
    return (
      parsed !== null &&
      typeof parsed === "object" &&
      Array.isArray(parsed.keys) &&
      parsed.keys.length > 0
    );
  } catch {
    return false;
  }
};

const ensureAnonymousAuthKeys = async (env: NodeJS.ProcessEnv, preferredPorts: number[] = []) => {
  const backendReady = await waitForLocalBackend(20000, preferredPorts);
  if (!backendReady) {
    console.warn("Skipping anonymous auth key setup: local Convex backend is not ready.");
    return false;
  }

  const existingPrivateKey = readEnvVar("JWT_PRIVATE_KEY", env);
  const existingJwks = readEnvVar("JWKS", env);
  if (
    existingPrivateKey !== null &&
    existingJwks !== null &&
    hasValidPrivateKey(existingPrivateKey) &&
    hasValidJwks(existingJwks)
  ) {
    return true;
  }

  removeEnvVar("JWT_PRIVATE_KEY", env);
  removeEnvVar("JWKS", env);

  const setupResult = spawnSync("npx", ["@convex-dev/auth", "--skip-git-check"], {
    stdio: "pipe",
    encoding: "utf8",
    env,
  });

  if (setupResult.status !== 0) {
    const output = `${setupResult.stdout}\n${setupResult.stderr}`.trim();
    console.warn(`Anonymous auth key setup failed${output ? `:\n${output}` : "."}`);
    return false;
  }

  console.log("Anonymous auth keys refreshed.");
  return true;
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

const rawExtraArgs = process.argv.slice(2);
const refreshAnonAuth = rawExtraArgs.includes("--refresh-anon-auth");
if (refreshAnonAuth && process.env.CONVEX_AGENT_MODE !== "anonymous") {
  console.error("--refresh-anon-auth requires CONVEX_AGENT_MODE=anonymous");
  process.exit(1);
}
const extraArgs = rawExtraArgs.filter((arg) => arg !== "--refresh-anon-auth");
const args = ["dev", ...extraArgs];
let anonymousLocalPorts = null;
if (
  process.env.CONVEX_AGENT_MODE === "anonymous" &&
  !args.some((arg) => arg.startsWith("--codegen"))
) {
  args.push("--codegen=disable");
}
if (process.env.CONVEX_AGENT_MODE === "anonymous") {
  // Convex selects anonymous local mode from CONVEX_AGENT_MODE and the
  // deployment env value; passing the old --local flag now makes dev fail.
  if (!hasCliOption(args, "--local-cloud-port") && !hasCliOption(args, "--local-site-port")) {
    anonymousLocalPorts = pickAnonymousLocalPorts();
    if (anonymousLocalPorts) {
      args.push(
        `--local-cloud-port=${anonymousLocalPorts.cloud}`,
        `--local-site-port=${anonymousLocalPorts.site}`,
      );
    }
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
const siteUrlRetryStartedAt = Date.now();
const child = spawn(convexInvocation.command, convexInvocation.args, {
  stdio: "inherit",
  env,
});
let childExited = false;
let childExitCode = 1;
let refreshDone = !refreshAnonAuth;
let refreshFailed = false;
let terminateRequested = false;
const hasChildExited = () => childExited;
const shouldRetrySiteUrlSync =
  process.env.CONVEX_AGENT_MODE !== "anonymous" &&
  !refreshAnonAuth &&
  !args.some((arg) => arg === "--until-success" || arg.startsWith("--until-success=")) &&
  usesLocalConvexDeployment();

const maybeExit = () => {
  if (!childExited || !refreshDone) {
    return;
  }
  if (refreshAnonAuth) {
    process.exit(refreshFailed ? 1 : 0);
  }
  process.exit(childExitCode);
};

child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
child.on("exit", (code) => {
  childExited = true;
  childExitCode = code ?? 1;
  maybeExit();
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
    if (!childExited || !refreshDone) {
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
      const localDevOrigin = await waitForRecentLocalDevOrigin(20_000, siteUrlRetryStartedAt);
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

if (refreshAnonAuth) {
  void ensureAnonymousAuthKeys(env, anonymousLocalPorts ? [anonymousLocalPorts.cloud] : [])
    .then((ok) => {
      if (!ok) {
        refreshFailed = true;
      }
    })
    .catch((error) => {
      refreshFailed = true;
      console.error(error instanceof Error ? error.message : String(error));
    })
    .finally(() => {
      refreshDone = true;
      if (!childExited) {
        child.kill("SIGTERM");
      }
      maybeExit();
    });
}

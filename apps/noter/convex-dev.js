import fs from "fs";
import os from "os";
import path from "path";
import { spawn, spawnSync } from "child_process";
import { isPortInUse, parsePort, sleep } from "./convex-local-utils.js";
import { normalizeEnvValue } from "./normalizeEnvValue.js";
import { pickAvailableAnonymousLocalPorts } from "../../runtime/anonymousLocalPorts.js";

const SUPPORTED_NODE_MAJORS = ["24", "22", "20", "18"];

const semverCompare = (a, b) => {
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

const pickNodeBinFromNvm = (preferredMajors) => {
  const nvmCandidates = Array.from(
    new Set(
      [process.env.NVM_DIR, path.join(os.homedir(), ".nvm")].filter(Boolean),
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
      const latest = matching[matching.length - 1];
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

const hasCliOption = (args, optionName) =>
  args.some((arg) => arg === optionName || arg.startsWith(`${optionName}=`));

const resolveWorktreeRoot = () => {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    stdio: "pipe",
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return process.cwd();
  }
  const root = (result.stdout ?? "").trim();
  return root.length > 0 ? root : process.cwd();
};

const pickAnonymousLocalPorts = () => {
  const worktreeRoot = resolveWorktreeRoot();
  const ports = pickAvailableAnonymousLocalPorts(worktreeRoot, isPortInUse);
  if (ports) {
    return ports;
  }

  console.warn(
    "No free anonymous worktree port pair found; falling back to Convex defaults.",
  );
  return null;
};

const normalizePortList = (ports) =>
  ports.filter(
    (port, index, all) =>
      Number.isFinite(port) && port > 0 && all.indexOf(port) === index,
  );

const readLocalBackendPorts = (preferredPorts = []) => {
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
    if (
      !line.startsWith("VITE_CONVEX_URL=") &&
      !line.startsWith("CONVEX_URL=")
    ) {
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

const isLocalBackendReady = async (port) => {
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

const waitForAnonymousBackend = async (timeoutMs, preferredPorts = []) => {
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

const removeEnvVar = (name, env) => {
  spawnSync("npx", ["convex", "env", "remove", name], {
    stdio: "ignore",
    env,
  });
};

const readEnvVar = (name, env) => {
  const result = spawnSync("npx", ["convex", "env", "get", name], {
    stdio: "pipe",
    encoding: "utf8",
    env,
  });
  if (result.status !== 0) {
    return null;
  }
  return normalizeEnvValue(result.stdout ?? "") ?? null;
};

const hasValidPrivateKey = (value) =>
  value.includes("-----BEGIN PRIVATE KEY-----") &&
  value.includes("-----END PRIVATE KEY-----");

const hasValidJwks = (value) => {
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

const ensureAnonymousAuthKeys = async (env, preferredPorts = []) => {
  const backendReady = await waitForAnonymousBackend(20000, preferredPorts);
  if (!backendReady) {
    console.warn(
      "Skipping anonymous auth key setup: local Convex backend is not ready.",
    );
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

  const setupResult = spawnSync(
    "npx",
    ["@convex-dev/auth", "--skip-git-check", "--allow-dirty-git-state"],
    {
      stdio: "pipe",
      encoding: "utf8",
      env,
    },
  );

  if (setupResult.status !== 0) {
    const output =
      `${setupResult.stdout ?? ""}\n${setupResult.stderr ?? ""}`.trim();
    console.warn(
      `Anonymous auth key setup failed${output ? `:\n${output}` : "."}`,
    );
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
  console.error(
    "Install one with nvm (for example `nvm install 24`) and retry.",
  );
  process.exit(1);
}
env.PATH = [supportedNodeBin, env.PATH].filter(Boolean).join(path.delimiter);

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
  if (
    !hasCliOption(args, "--local") &&
    !hasCliOption(args, "--cloud") &&
    !hasCliOption(args, "--prod") &&
    !hasCliOption(args, "--url") &&
    !hasCliOption(args, "--admin-key")
  ) {
    args.push("--local");
  }

  if (
    !hasCliOption(args, "--local-cloud-port") &&
    !hasCliOption(args, "--local-site-port")
  ) {
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
const convexExecutable = fs.existsSync(localConvexBin)
  ? localConvexBin
  : "convex";

const child = spawn(convexExecutable, args, { stdio: "inherit", env });
let childExited = false;
let childExitCode = 1;
let refreshDone = !refreshAnonAuth;
let refreshFailed = false;
let terminateRequested = false;

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

const requestTermination = (signal) => {
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

if (refreshAnonAuth) {
  void ensureAnonymousAuthKeys(
    env,
    anonymousLocalPorts ? [anonymousLocalPorts.cloud] : [],
  )
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

import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";

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

const extraArgs = process.argv.slice(2);
const args = ["dev", ...extraArgs];
if (
  process.env.CONVEX_AGENT_MODE === "anonymous" &&
  !args.some((arg) => arg.startsWith("--codegen"))
) {
  args.push("--codegen=disable");
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
child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
child.on("exit", (code) => {
  process.exit(code ?? 1);
});

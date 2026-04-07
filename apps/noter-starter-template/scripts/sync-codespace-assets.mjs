import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatWithRepoVitePlus } from "../../../scripts/vitePlusFormatting.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templateDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(templateDir, "..", "..");

const syncPairs = [
  {
    source: path.join(repoRoot, ".codespace-agent"),
    destination: path.join(templateDir, ".codespace-agent"),
    recursive: true,
    filter: sourcePath => {
      const normalized = sourcePath.split(path.sep).join("/");
      if (normalized.includes("/node_modules/")) {
        return false;
      }
      if (normalized.endsWith("/.agent-token")) {
        return false;
      }
      return true;
    },
  },
  {
    source: path.join(repoRoot, ".devcontainer", "devcontainer.json"),
    destination: path.join(templateDir, ".devcontainer", "devcontainer.json"),
    recursive: false,
  },
  {
    source: path.join(repoRoot, ".devcontainer", "Dockerfile"),
    destination: path.join(templateDir, ".devcontainer", "Dockerfile"),
    recursive: false,
  },
];

export async function syncCodespaceAssets() {
  for (const pair of syncPairs) {
    await mkdir(path.dirname(pair.destination), { recursive: true });
    await cp(pair.source, pair.destination, {
      force: true,
      recursive: pair.recursive,
      errorOnExist: false,
      filter: pair.filter,
    });
    const relativeSource = path
      .relative(repoRoot, pair.source)
      .split(path.sep)
      .join("/");
    const relativeDestination = path
      .relative(templateDir, pair.destination)
      .split(path.sep)
      .join("/");
    console.log(`synced ${relativeSource} -> ${relativeDestination}`);
  }

  const templateAgentServerPath = path.join(
    templateDir,
    ".codespace-agent",
    "server.js",
  );
  const templateAgentServerSource = await readFile(
    templateAgentServerPath,
    "utf8",
  );
  const formattedTemplateAgentServerSource = await formatWithRepoVitePlus({
    filepath: templateAgentServerPath,
    sourceText: templateAgentServerSource,
  });
  if (formattedTemplateAgentServerSource !== templateAgentServerSource) {
    await writeFile(
      templateAgentServerPath,
      formattedTemplateAgentServerSource,
      "utf8",
    );
  }
}

if (process.argv[1] === __filename) {
  await syncCodespaceAssets();
}

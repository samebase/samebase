import { readFileSync } from "node:fs";
import path from "node:path";

import { resolveRepoRoot, runMain } from "./lib/scriptRuntime.ts";
import { trackedFilePath } from "./lib/trackedFilePath.ts";

const appIconPath = trackedFilePath("apps/samebase/public/chatgpt-app-icon.png");
const pluginIconPath = trackedFilePath("packages/agent-plugins/plugins/samebase/assets/icon.png");

await runMain(() => {
  const repoRoot = resolveRepoRoot();
  const appIcon = readFileSync(path.join(repoRoot, appIconPath));
  const pluginIcon = readFileSync(path.join(repoRoot, pluginIconPath));

  if (!appIcon.equals(pluginIcon)) {
    throw new Error("The agent plugin icon must match the generated Samebase app icon.");
  }

  console.log("Agent plugin logo matches the generated Samebase app icon.");
});

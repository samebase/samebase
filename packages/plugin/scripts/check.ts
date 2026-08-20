import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import codexMarketplace from "../.agents/plugins/marketplace.json" with { type: "json" };
import claudeMarketplace from "../.claude-plugin/marketplace.json" with { type: "json" };
import packageMetadata from "../package.json" with { type: "json" };
import claudeManifest from "../plugins/samebase/.claude-plugin/plugin.json" with { type: "json" };
import codexManifest from "../plugins/samebase/.codex-plugin/plugin.json" with { type: "json" };
import mcp from "../plugins/samebase/.mcp.json" with { type: "json" };

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = resolve(root, "plugins/samebase");

function check(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function checkRelativePath(baseRoot: string, relativePath: string, label: string): void {
  check(existsSync(resolve(baseRoot, relativePath)), `${label} does not resolve: ${relativePath}`);
}

const codexMarketplacePlugin = codexMarketplace.plugins[0];
const claudeMarketplacePlugin = claudeMarketplace.plugins[0];
const repositoryUrl = "https://github.com/samebase/plugin";

check(packageMetadata.name === "samebase-plugin", "Unexpected package name.");
check(
  packageMetadata.version === codexManifest.version,
  "The package version must match the Codex manifest.",
);
check(
  packageMetadata.version === claudeManifest.version,
  "The package version must match the Claude manifest.",
);
check(codexManifest.version === claudeManifest.version, "Codex and Claude versions must match.");
check(packageMetadata.license === "Apache-2.0", "The package must declare the Apache-2.0 license.");
check(
  codexManifest.license === packageMetadata.license,
  "The Codex manifest license must match the package.",
);
check(codexManifest.repository === repositoryUrl, "Unexpected Codex repository URL.");
check(claudeManifest.repository === repositoryUrl, "Unexpected Claude repository URL.");
check(
  claudeMarketplacePlugin.repository === repositoryUrl,
  "Unexpected Claude marketplace repository URL.",
);
check(mcp.mcpServers.samebase.url === "https://api.samebase.com/mcp", "Unexpected MCP endpoint.");
checkRelativePath(root, "LICENSE", "License");
checkRelativePath(root, "NOTICE", "License notice");
checkRelativePath(root, "SECURITY.md", "Security policy");

const codexMarketplaceSource = codexMarketplacePlugin.source;
check(codexMarketplaceSource.source === "local", "The Codex marketplace source must be local.");
checkRelativePath(root, codexMarketplaceSource.path, "Codex marketplace source");
checkRelativePath(root, claudeMarketplacePlugin.source, "Claude marketplace source");
check(
  resolve(root, codexMarketplaceSource.path) === pluginRoot,
  "The Codex marketplace must install the shared plugin directory.",
);
check(
  resolve(root, claudeMarketplacePlugin.source) === pluginRoot,
  "The Claude marketplace must install the shared plugin directory.",
);
checkRelativePath(pluginRoot, codexManifest.skills, "Codex skills path");
checkRelativePath(pluginRoot, codexManifest.mcpServers, "Codex MCP path");
checkRelativePath(pluginRoot, claudeManifest.skills, "Claude skills path");
checkRelativePath(pluginRoot, claudeManifest.mcpServers, "Claude MCP path");

const skillsRoot = resolve(pluginRoot, "skills");
const skillDirectories = readdirSync(skillsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

check(
  skillDirectories.length === 1 && skillDirectories[0] === "samebase",
  "The plugin must contain only the samebase skill.",
);
checkRelativePath(skillsRoot, "samebase/SKILL.md", "Samebase skill");
checkRelativePath(
  skillsRoot,
  "samebase/references/existing-repository-adoption.md",
  "Existing repository adoption reference",
);

const samebaseSkill = readFileSync(resolve(skillsRoot, "samebase/SKILL.md"), "utf8").replace(
  /\s+/g,
  " ",
);
const stackAlignmentStartIndex = samebaseSkill.indexOf("Before stack-alignment work,");
const stackAlignmentEndIndex = samebaseSkill.indexOf(
  "Match the validation scope",
  stackAlignmentStartIndex,
);
check(
  stackAlignmentStartIndex >= 0 && stackAlignmentEndIndex > stackAlignmentStartIndex,
  "The Samebase skill must contain its stack-alignment contract.",
);
const stackAlignmentContract = samebaseSkill.slice(
  stackAlignmentStartIndex,
  stackAlignmentEndIndex,
);
check(
  stackAlignmentContract.includes("[samebase/app](https://github.com/samebase/app)") &&
    stackAlignmentContract.includes(
      "Use it as the public reference for a Samebase-ready repository with the minimum required setup.",
    ),
  "The Samebase skill must use the public app as its canonical stack-alignment reference.",
);
for (const requiredToolchainGroup of [
  "runtime",
  "package manager",
  "commands",
  "lint and format rules",
  "tests",
  "type checks",
  "framework and deployment adapters",
  "CI",
  "shared version pins",
]) {
  check(
    stackAlignmentContract.includes(requiredToolchainGroup),
    `The Samebase skill stack-alignment contract must include ${requiredToolchainGroup}.`,
  );
}
check(
  stackAlignmentContract.includes(
    "Classify each difference as alignment, a required target constraint, an item to investigate, or a tested exception.",
  ),
  "The Samebase skill must classify every toolchain difference before implementation.",
);
check(
  samebaseSkill.includes(
    "Match the validation scope to the project and migration risk. Before broad or expensive tests, discuss their cost and expected coverage with the operator.",
  ) &&
    samebaseSkill.includes(
      "Do not change tests or their setup unless Samebase adoption requires it.",
    ),
  "The Samebase skill must keep validation proportionate and operator-informed.",
);
check(
  samebaseSkill.includes(
    "Before a write sequence can start or request a production build, tell the operator what can change in production and get explicit approval.",
  ) &&
    samebaseSkill.includes(
      "One approval can cover the sequence only if you first state the repository, provider account, each possible production change, and whether Samebase will attach an existing resource or create a new one.",
    ) &&
    samebaseSkill.includes("Ask again if any of these facts or the approved scope changes."),
  "The Samebase skill must require informed approval for a production-build sequence.",
);
check(
  samebaseSkill.includes(
    "If an existing GitHub repository is not in Samebase, connect it at the start of adoption.",
  ) &&
    samebaseSkill.includes(
      "This records the source state. It does not attach Convex or Cloudflare.",
    ) &&
    samebaseSkill.includes(
      "By default, prepare the repository before provider setup can start a production build.",
    ) &&
    samebaseSkill.includes(
      "For an experimental app, the operator can approve earlier provider setup.",
    ) &&
    samebaseSkill.includes(
      "If the resulting build fails, use the failure and provider logs to diagnose the setup.",
    ) &&
    samebaseSkill.includes("Do not report it as a deployment."),
  "The Samebase skill must connect an existing repository early and keep provider timing operator-owned.",
);
const scopeGateIndex = samebaseSkill.indexOf(
  "Do not use Samebase for unrelated Git work or standalone provider resources. A standalone Cloudflare Worker means no Samebase.",
);
const positiveRouteIndex = samebaseSkill.indexOf(
  "For app inventory, call only the Samebase app inventory.",
);
check(scopeGateIndex >= 0, "The Samebase skill must exclude unrelated and standalone work.");
check(
  positiveRouteIndex >= 0 && scopeGateIndex < positiveRouteIndex,
  "The Samebase skill exclusions must precede its positive action routes.",
);
const managedFlowStartIndex = samebaseSkill.indexOf("For a new app, follow these steps in order");
const manualFlowStartIndex = samebaseSkill.indexOf(
  "For manual Cloudflare Worker creation",
  managedFlowStartIndex,
);
check(
  managedFlowStartIndex >= 0 && manualFlowStartIndex > managedFlowStartIndex,
  "The Samebase skill must contain separate managed and manual Cloudflare flows.",
);
const managedFlow = samebaseSkill.slice(managedFlowStartIndex, manualFlowStartIndex);
const managedInventoryIndex = managedFlow.indexOf("Read the app inventory.");
const managedTokenListIndex = managedFlow.indexOf(
  "Call `cloudflare_listWorkersBuildTokens` for the selected organization.",
);
const managedCreateIndex = managedFlow.indexOf(
  "Create the app with `cloudflareBuildTokenUuid` set to this value.",
);
const managedSourcePollIndex = managedFlow.indexOf(
  "Read only the inventory until source setup is `ready` or `failed`.",
);
const managedProviderPollIndex = managedFlow.indexOf(
  "read only the inventory until provider setup is `ready` or `failed`.",
);
check(
  managedFlow.includes("Set the required `cloudflareBuildTokenUuid`.") &&
    managedFlow.includes("If `lastUsedBuildTokenUuid` is available, set it to that UUID") &&
    managedFlow.includes("If the list has one token, set it to that UUID.") &&
    managedFlow.includes(
      "If the list has several tokens and no last-used token, ask the user to choose by name and UUID.",
    ) &&
    managedFlow.includes("Do not omit the field."),
  "The Samebase skill must select and send cloudflareBuildTokenUuid from the current token list.",
);
check(
  managedInventoryIndex >= 0 &&
    managedTokenListIndex > managedInventoryIndex &&
    managedCreateIndex > managedTokenListIndex &&
    managedSourcePollIndex > managedCreateIndex &&
    managedProviderPollIndex > managedSourcePollIndex &&
    managedFlow.includes(
      "The complete tool sequence is inventory, the Workers Builds token list, create, and inventory polls. Call create immediately after token selection. Do not call another tool between the token list and create. Create has no `accountId` and uses the connected Cloudflare provider.",
    ),
  "The Samebase skill must keep managed app creation on its closed tool sequence.",
);
const tokenlessNullIndex = managedFlow.indexOf(
  "If the current list is confirmed empty, set it to null.",
);
const tokenlessRunIndex = managedFlow.indexOf(
  "If `cloudflareBuildTokenUuid` is null, the managed run creates the GitHub repository and Convex project.",
);
const tokenlessGuideIndex = managedFlow.indexOf("samebase.com/docs/cloudflare-setup");
const tokenlessCreateWorkerIndex = managedFlow.indexOf("`vault_cloudflare_createWorker`");
const tokenlessRereadInventoryIndex = managedFlow.indexOf(
  "reread inventory",
  tokenlessCreateWorkerIndex,
);
const tokenlessDeployKeysIndex = managedFlow.indexOf(
  "`vault_cloudflare_rotateConvexDeployKeysForWorkersBuilds`",
);
check(
  tokenlessNullIndex > managedTokenListIndex &&
    tokenlessRunIndex > tokenlessNullIndex &&
    tokenlessGuideIndex > tokenlessRunIndex &&
    tokenlessCreateWorkerIndex > tokenlessGuideIndex &&
    tokenlessRereadInventoryIndex > tokenlessCreateWorkerIndex &&
    tokenlessDeployKeysIndex > tokenlessRereadInventoryIndex,
  "The Samebase skill must send null for a confirmed empty token list, report the guide, then create the Worker and rotate deploy keys.",
);
const manualFlowEndIndex = samebaseSkill.indexOf(
  "After you choose the action,",
  manualFlowStartIndex,
);
check(
  manualFlowEndIndex > manualFlowStartIndex,
  "The Samebase skill must keep the manual Cloudflare flow before general action routing.",
);
const manualFlow = samebaseSkill.slice(manualFlowStartIndex, manualFlowEndIndex);
check(
  manualFlow.includes("Never pass null to a manual Worker or Builds action.") &&
    manualFlow.includes("Pass only an exact UUID from the current non-empty list.") &&
    manualFlow.includes(
      "After setup, refresh the token list, call `vault_cloudflare_createWorker` with one UUID from the refreshed list",
    ) &&
    manualFlow.includes(
      "After token setup, refresh the token list and call `vault_cloudflare_configureWorkersBuildsForGitHub`",
    ) &&
    manualFlow.includes("For any other app, complete token setup, refresh the token list"),
  "The Samebase skill must refresh the token list and reject null before each manual Worker or Builds action.",
);
const openSamebaseIndex = samebaseSkill.indexOf(
  "Treat `open @samebase` as an exact command. It selects the in-app Browser.",
);
const requireSamebaseAuthorizationIndex = samebaseSkill.indexOf(
  "The user must authorize Samebase before you create a secure browser handoff.",
);
const missingSamebaseAuthorizationIndex = samebaseSkill.indexOf(
  "If authorization is missing or `create_browser_handoff` is unavailable, tell the user that authorization is required.",
);
const offerSamebaseAuthorizationIndex = samebaseSkill.indexOf(
  "Ask, `Would you like me to start authorization with Samebase?`",
);
const waitForSamebaseAuthorizationIndex = samebaseSkill.indexOf(
  "Wait for authorization to finish before you continue.",
);
const selectInAppBrowserIndex = samebaseSkill.indexOf(
  "Select the in-app Browser. Do not select Chrome or a different external browser.",
);
const createBrowserHandoffIndex = samebaseSkill.indexOf("Call `create_browser_handoff`.");
const openHandoffUrlIndex = samebaseSkill.indexOf(
  "Open the returned URL in the selected in-app Browser before it expires.",
);
check(
  openSamebaseIndex >= 0 &&
    samebaseSkill.includes(
      "The user does not need to add `dashboard` or name the Browser plugin.",
    ) &&
    requireSamebaseAuthorizationIndex > openSamebaseIndex &&
    missingSamebaseAuthorizationIndex > requireSamebaseAuthorizationIndex &&
    offerSamebaseAuthorizationIndex > missingSamebaseAuthorizationIndex &&
    samebaseSkill.includes("Do not suggest a plugin reload or reinstall.") &&
    waitForSamebaseAuthorizationIndex > offerSamebaseAuthorizationIndex &&
    selectInAppBrowserIndex > waitForSamebaseAuthorizationIndex &&
    createBrowserHandoffIndex > selectInAppBrowserIndex &&
    openHandoffUrlIndex > createBrowserHandoffIndex &&
    samebaseSkill.includes(
      "The URL opens a Samebase session for the account that granted the current MCP access, then opens the dashboard.",
    ),
  "The Samebase skill must require and offer authorization before `open @samebase` selects the " +
    "in-app Browser and opens an authenticated handoff.",
);

console.log("Agent plugin checks passed.");

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { trackedFilePath } from "./lib/trackedFilePath.ts";

/**
Guard the always-loaded agent instruction budget.

OpenAI Codex truncates combined project docs (root AGENTS.md plus nested
AGENTS.md files) at `project_doc_max_bytes`, 32768 bytes by default — content
past the cap is silently dropped. AGENTS.md crossed that cap twice (2026-03-19
and 2026-05-21); both times the tail rules (v<N> labels, Operator Preferences)
became invisible to Codex and agent behavior regressed. See
research/2026-06-11-agents-md-truncation-audit.md.

This check fails when the combined size approaches the cap and warns earlier
so there is room to react. It also warns when AGENTS.md references repo paths
that no longer exist (stale pointers are worse than missing ones).
*/

const CODEX_DEFAULT_CAP_BYTES = 32768;
// The 2026-06-11 restructure landed at ~28.8 KB combined; warn on meaningful
// regrowth past that baseline, fail with safety margin before the cap.
const FAIL_BYTES = 31000;
const WARN_BYTES = 30000;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootAgentsFile = trackedFilePath("AGENTS.md");

function listNestedAgentsFiles(): string[] {
  const appsDir = path.join(repoRoot, "apps");
  return readdirSync(appsDir)
    .map((entry) => path.join("apps", entry, "AGENTS.md"))
    .filter((candidate) => existsSync(path.join(repoRoot, candidate)));
}

const docFiles = [rootAgentsFile, ...listNestedAgentsFiles()];
const sizes = docFiles.map((file) => ({
  file,
  bytes: statSync(path.join(repoRoot, file)).size,
}));
const combinedBytes = sizes.reduce((total, entry) => total + entry.bytes, 0);

for (const entry of sizes) {
  console.log(`${entry.file}: ${entry.bytes} bytes`);
}
console.log(
  `combined: ${combinedBytes} bytes (warn ${WARN_BYTES}, fail ${FAIL_BYTES}, Codex default cap ${CODEX_DEFAULT_CAP_BYTES})`,
);

const referencePattern =
  /(?:docs|skills|scripts|apps|packages|research|specs|rfcs)\/[\w./-]+\.\w+/g;
const rootContent = readFileSync(path.join(repoRoot, rootAgentsFile), "utf8");
const referencedPaths = new Set(rootContent.match(referencePattern) ?? []);
const missingReferences = [...referencedPaths].filter(
  (reference) => !existsSync(path.join(repoRoot, reference)),
);
for (const reference of missingReferences) {
  console.warn(`warning: AGENTS.md references a missing path: ${reference}`);
}

if (combinedBytes > FAIL_BYTES) {
  console.error(
    `error: combined agent docs are ${combinedBytes} bytes (> ${FAIL_BYTES}). Codex silently drops content past ${CODEX_DEFAULT_CAP_BYTES} bytes — move detail into docs/ or skills/ and keep a pointer (see docs/repo-documentation-standard.md).`,
  );
  process.exit(1);
}
if (combinedBytes > WARN_BYTES) {
  console.warn(
    `warning: combined agent docs are ${combinedBytes} bytes (> ${WARN_BYTES}); approaching the Codex truncation cap.`,
  );
}

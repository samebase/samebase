#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

/**
 * This is a CI guardrail for the supply-chain controls in this branch.
 *
 * It is not trying to be a complete malware scanner. The goal is narrower:
 * keep the concrete controls we chose after the TanStack incident from being
 * removed or bypassed accidentally during normal dependency and CI edits.
 *
 * The TanStack compromise used a malicious optional dependency that resolved to
 * a remote GitHub commit and then ran install-time code. These checks make sure
 * pnpm keeps delaying new releases, blocks transitive exotic sources, reviews
 * lifecycle scripts explicitly, and fails if obvious git/URL dependency paths
 * or known incident markers re-enter the repo.
 */
const EXPECTED_PACKAGE_MANAGER = "pnpm@11.1.1";
const EXPECTED_PNPM_ENGINE = ">=11.1.1";

// These settings live in pnpm-workspace.yaml because pnpm 11 no longer reads
// general project config from package.json. They are the baseline that makes
// installs fail closed instead of quietly accepting young or unusual packages.
const REQUIRED_WORKSPACE_SETTINGS = [
  // 10080 minutes = 7 days. New package versions must survive that long before
  // pnpm is allowed to resolve them.
  ["minimumReleaseAge", "10080"],
  // If no version in the requested range is old enough, fail instead of falling
  // back to a too-new version just to make install succeed.
  ["minimumReleaseAgeStrict", "true"],
  // Private registries that omit publish times should fail resolution. Without
  // a publish time, the release-age gate cannot prove the package is mature.
  ["minimumReleaseAgeIgnoreMissingTime", "false"],
  // Transitive dependencies cannot pull code from git repos or remote tarballs.
  // This is the control that would have blocked the TanStack optional dep path.
  ["blockExoticSubdeps", "true"],
  // If a package used to have stronger registry trust evidence, do not accept a
  // newer release with weaker evidence.
  ["trustPolicy", "no-downgrade"],
];

// Keep release-age exceptions exact. A package-name-only exception would allow
// every future Convex release to bypass the 7-day cooling period.
const REQUIRED_RELEASE_AGE_EXCLUDES = ["convex@1.38.0"];

// pnpm 11 requires every dependency lifecycle script to be reviewed. `true`
// means "this package may run its build/install script"; `false` means "we saw
// the script and intentionally suppress it." Either way, surprise scripts fail.
const REQUIRED_BUILD_SCRIPT_POLICY = [
  // These packages advertise lifecycle scripts, but this project does not need
  // their install-time work to run.
  ["core-js", "false"],
  // esbuild installs a platform binary through its lifecycle script, so it is
  // the one reviewed script we allow.
  ["esbuild", "true"],
  ["msw", "false"],
  ["protobufjs", "false"],
];

// These overrides are the current audit remediation set. Keeping them explicit
// makes `pnpm audit` fail only when there is genuinely new work to do, not for
// already-triaged transitive versions.
const REQUIRED_OVERRIDES = [
  ["@protobufjs/utf8", "1.1.1"],
  ["ajv@6", "6.15.0"],
  ["ajv@8", "8.18.0"],
  ["brace-expansion@1", "1.1.13"],
  ["dompurify", "3.4.0"],
  ["fast-uri", "3.1.2"],
  ["flatted", "3.4.2"],
  ["hono", "4.12.18"],
  ["ip-address", "10.1.1"],
  ["mailparser", "3.9.8"],
  ["minimatch@3", "3.1.5"],
  ["picomatch@2", "2.3.2"],
  ["picomatch@4.0.3", "4.0.4"],
  ["postcss", "8.5.10"],
  ["protobufjs", "7.5.6"],
];

// Dependency-like maps can appear in several places, not just dependencies.
// Scanning overrides/resolutions matters because a remote URL there is still
// executable supply-chain input.
const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
  "overrides",
  "resolutions",
];

// Direct git and URL specs are banned in package manifests. If we ever need one,
// it should be a deliberate policy change rather than a quiet package edit.
const BLOCKED_SPEC_PATTERNS = [
  { label: "GitHub shorthand", pattern: /^github:/i },
  { label: "git URL", pattern: /^git(?:\+|:)/i },
  { label: "remote URL", pattern: /^https?:/i },
];

// The lockfile is scanned separately because transitive dependency metadata
// never appears in our package.json files. This catches the exact class of
// remote optional dependency that mattered in the TanStack incident.
const LOCKFILE_BLOCKED_PATTERNS = [
  { label: "GitHub shorthand dependency", pattern: /\bgithub:/i },
  { label: "git URL dependency", pattern: /\bgit\+/i },
  { label: "remote tarball dependency", pattern: /\btarball:\s*https?:/i },
  {
    label: "TanStack compromise optional dependency",
    pattern: /@tanstack\/setup/i,
  },
];

// GitHub Actions tags are mutable. Full SHA pins are tedious, but they stop a
// compromised action tag from changing what CI runs after review.
const WORKFLOW_USES_PATTERN = /^\s*uses:\s*([^#\s]+)\s*(?:#.*)?$/;
const PINNED_ACTION_REF_PATTERN = /^[a-f0-9]{40}$/;

type Issue = {
  file: string;
  message: string;
};

const workspaceDir = process.cwd();
const issues: Issue[] = [];

// Run every independent policy check and report all failures together. That
// makes CI output useful when a dependency bump touches more than one guardrail.
checkRootPackage();
checkPnpmWorkspace();
checkPackageSpecs();
checkLockfile();
checkWorkflowActions();

if (issues.length > 0) {
  console.error("Supply chain policy check failed:");
  for (const issue of issues) {
    console.error(`- ${issue.file}: ${issue.message}`);
  }
  process.exit(1);
}

console.log("Supply chain policy check passed.");

/**
 * Verifies the repo is actually using a pnpm version with the controls below.
 *
 * Without this, someone could keep the config but downgrade the package manager
 * to a version that ignores some of the supply-chain settings.
 */
function checkRootPackage(): void {
  const packageJsonPath = path.join(workspaceDir, "package.json");
  const packageJson = readJsonRecord(packageJsonPath);
  if (!packageJson) {
    return;
  }

  const packageManager = packageJson.packageManager;
  if (packageManager !== EXPECTED_PACKAGE_MANAGER) {
    addIssue(
      packageJsonPath,
      `expected packageManager to be ${EXPECTED_PACKAGE_MANAGER}`,
    );
  }

  const engines = recordField(packageJson, "engines");
  if (!engines) {
    addIssue(packageJsonPath, "expected engines.pnpm to pin the pnpm floor");
    return;
  }

  if (engines.pnpm !== EXPECTED_PNPM_ENGINE) {
    addIssue(
      packageJsonPath,
      `expected engines.pnpm to be ${EXPECTED_PNPM_ENGINE}`,
    );
  }
}

/**
 * Verifies that the chosen pnpm policy is still present.
 *
 * This intentionally checks exact values. A one-line edit from strict to
 * best-effort behavior would be easy to miss in review, so CI treats that as a
 * policy change that needs an explicit update to this script too.
 */
function checkPnpmWorkspace(): void {
  const workspacePath = path.join(workspaceDir, "pnpm-workspace.yaml");
  if (!existsSync(workspacePath)) {
    addIssue(workspacePath, "expected pnpm-workspace.yaml to exist");
    return;
  }

  const workspaceConfig = readFileSync(workspacePath, "utf8");
  for (const [name, expectedValue] of REQUIRED_WORKSPACE_SETTINGS) {
    const settingPattern = new RegExp(
      `^${escapeRegExp(name)}:\\s*${escapeRegExp(expectedValue)}\\s*(?:#.*)?$`,
      "m",
    );
    if (!settingPattern.test(workspaceConfig)) {
      addIssue(workspacePath, `expected ${name}: ${expectedValue}`);
    }
  }

  for (const releaseAgeExclude of REQUIRED_RELEASE_AGE_EXCLUDES) {
    const settingPattern = new RegExp(
      `^\\s*-\\s*${escapeRegExp(releaseAgeExclude)}\\s*(?:#.*)?$`,
      "m",
    );
    if (!settingPattern.test(workspaceConfig)) {
      addIssue(
        workspacePath,
        `expected minimumReleaseAgeExclude entry ${releaseAgeExclude}`,
      );
    }
  }

  for (const [name, expectedValue] of REQUIRED_BUILD_SCRIPT_POLICY) {
    const settingPattern = new RegExp(
      `^\\s{2}${escapeRegExp(name)}:\\s*${escapeRegExp(expectedValue)}\\s*(?:#.*)?$`,
      "m",
    );
    if (!settingPattern.test(workspaceConfig)) {
      addIssue(workspacePath, `expected allowBuilds.${name}: ${expectedValue}`);
    }
  }

  for (const [name, expectedValue] of REQUIRED_OVERRIDES) {
    const settingPattern = new RegExp(
      `^\\s{2}"?${escapeRegExp(name)}"?:\\s*${escapeRegExp(expectedValue)}\\s*(?:#.*)?$`,
      "m",
    );
    if (!settingPattern.test(workspaceConfig)) {
      addIssue(workspacePath, `expected overrides.${name}: ${expectedValue}`);
    }
  }
}

/**
 * Scans every workspace package manifest for direct dependency specs that fetch
 * code from git or arbitrary URLs.
 *
 * `blockExoticSubdeps` protects transitive dependencies, but direct exotic deps
 * are still allowed by pnpm. We block them here so the repo has one clear rule:
 * dependencies come from the configured registry or from local workspace/file
 * links, unless we intentionally change this policy.
 */
function checkPackageSpecs(): void {
  for (const packageJsonPath of findPackageJsonFiles(workspaceDir)) {
    const packageJson = readJsonRecord(packageJsonPath);
    if (!packageJson) {
      continue;
    }

    for (const field of DEPENDENCY_FIELDS) {
      const dependencyMap = recordField(packageJson, field);
      if (dependencyMap) {
        checkPackageSpecMap(packageJsonPath, `${field}`, dependencyMap);
      }
    }

    const pnpmConfig = recordField(packageJson, "pnpm");
    const pnpmOverrides = pnpmConfig
      ? recordField(pnpmConfig, "overrides")
      : null;
    if (pnpmOverrides) {
      checkPackageSpecMap(packageJsonPath, "pnpm.overrides", pnpmOverrides);
    }
  }
}

// Dependency maps can be nested inside pnpm override selectors, so recurse
// through records and check every string value that could be a package spec.
function checkPackageSpecMap(
  packageJsonPath: string,
  location: string,
  dependencyMap: Record<string, unknown>,
): void {
  for (const [name, value] of Object.entries(dependencyMap)) {
    const childLocation = `${location}.${name}`;
    if (typeof value === "string") {
      checkPackageSpec(packageJsonPath, childLocation, value);
      continue;
    }

    if (isRecord(value)) {
      checkPackageSpecMap(packageJsonPath, childLocation, value);
    }
  }
}

// Check one concrete package specifier and preserve the package.json path plus
// field path so the failure points at the dependency that needs review.
function checkPackageSpec(
  packageJsonPath: string,
  location: string,
  specifier: string,
): void {
  for (const { label, pattern } of BLOCKED_SPEC_PATTERNS) {
    if (pattern.test(specifier)) {
      addIssue(
        packageJsonPath,
        `${location} uses blocked ${label} specifier ${specifier}`,
      );
    }
  }
}

/**
 * Scans the resolved lockfile for transitive exotic sources and incident
 * indicators.
 *
 * This is the defense-in-depth layer. If a package manifest looks clean but the
 * lockfile still resolves something through git, a remote tarball, or the
 * TanStack payload package name, CI stops before install policy drift ships.
 */
function checkLockfile(): void {
  const lockfilePath = path.join(workspaceDir, "pnpm-lock.yaml");
  if (!existsSync(lockfilePath)) {
    addIssue(lockfilePath, "expected pnpm-lock.yaml to exist");
    return;
  }

  const lockfile = readFileSync(lockfilePath, "utf8");
  for (const { label, pattern } of LOCKFILE_BLOCKED_PATTERNS) {
    if (pattern.test(lockfile)) {
      addIssue(lockfilePath, `found blocked ${label}`);
    }
  }
}

/**
 * Verifies CI workflows keep a narrow default token and immutable actions.
 *
 * The TanStack postmortem involved GitHub Actions trust-boundary mistakes. This
 * does not prove every workflow is perfect, but it preserves two concrete
 * defaults that lower blast radius: read-only repository permissions and action
 * references pinned to reviewed commits.
 */
function checkWorkflowActions(): void {
  const workflowsDir = path.join(workspaceDir, ".github", "workflows");
  if (!existsSync(workflowsDir)) {
    return;
  }

  for (const workflowPath of findWorkflowFiles(workflowsDir)) {
    const workflow = readFileSync(workflowPath, "utf8");
    if (!/^permissions:\n\s+contents:\s+read\s*$/m.test(workflow)) {
      addIssue(workflowPath, "expected default permissions.contents: read");
    }

    const lines = workflow.split(/\r?\n/);
    lines.forEach((line, index) => {
      const match = line.match(WORKFLOW_USES_PATTERN);
      if (!match) {
        return;
      }

      const actionSpec = match[1];
      if (!actionSpec || actionSpec.startsWith("./")) {
        return;
      }

      const refSeparator = actionSpec.lastIndexOf("@");
      if (refSeparator === -1) {
        addIssue(workflowPath, `line ${index + 1} action is not pinned`);
        return;
      }

      const ref = actionSpec.slice(refSeparator + 1);
      if (!PINNED_ACTION_REF_PATTERN.test(ref)) {
        addIssue(
          workflowPath,
          `line ${index + 1} action ref must be a full commit SHA`,
        );
      }
    });
  }
}

// Find package manifests without walking generated output or dependency stores.
// Those directories can be huge and should not define source-of-truth policy.
function findPackageJsonFiles(rootDir: string): string[] {
  const results: string[] = [];
  const ignoredDirectories = new Set([
    ".git",
    ".turbo",
    ".vite",
    "coverage",
    "dev-dist",
    "dist",
    "node_modules",
    "test-results",
  ]);

  function walk(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) {
          walk(entryPath);
        }
        continue;
      }

      if (entry.name === "package.json") {
        results.push(entryPath);
      }
    }
  }

  walk(rootDir);
  return results;
}

// Workflow policy only applies to files GitHub will read as workflows.
function findWorkflowFiles(workflowsDir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(workflowsDir, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }

    if (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml")) {
      results.push(path.join(workflowsDir, entry.name));
    }
  }
  return results;
}

// JSON parsing is intentionally typed as unknown first. The small runtime guard
// below keeps this script within the repo rule against assertion-based parsing.
function readJsonRecord(filePath: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    if (isRecord(parsed)) {
      return parsed;
    }

    addIssue(filePath, "expected a JSON object");
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    addIssue(filePath, `could not parse JSON: ${message}`);
    return null;
  }
}

// Return object-shaped fields only. Missing or scalar fields are normal for
// most package.json files and simply mean there is nothing to scan there.
function recordField(
  record: Record<string, unknown>,
  fieldName: string,
): Record<string, unknown> | null {
  const value = record[fieldName];
  if (isRecord(value)) {
    return value;
  }
  return null;
}

// Arrays are not records for this script because dependency maps are objects.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Store paths relative to the workspace so CI errors are easy to read and copy.
function addIssue(filePath: string, message: string): void {
  issues.push({
    file: path.relative(workspaceDir, filePath),
    message,
  });
}

// Policy values are interpolated into regular expressions. Escaping here keeps
// package names like @scope/name and selectors like ajv@6 literal.
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

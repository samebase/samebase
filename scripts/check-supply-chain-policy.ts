#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const EXPECTED_PACKAGE_MANAGER = "pnpm@11.1.1";
const EXPECTED_PNPM_ENGINE = ">=11.1.1";
const REQUIRED_WORKSPACE_SETTINGS = [
  ["minimumReleaseAge", "10080"],
  ["minimumReleaseAgeStrict", "true"],
  ["minimumReleaseAgeIgnoreMissingTime", "false"],
  ["blockExoticSubdeps", "true"],
  ["trustPolicy", "no-downgrade"],
];
const REQUIRED_RELEASE_AGE_EXCLUDES = ["convex@1.38.0"];
const REQUIRED_BUILD_SCRIPT_POLICY = [
  ["core-js", "false"],
  ["esbuild", "true"],
  ["msw", "false"],
  ["protobufjs", "false"],
];
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
const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
  "overrides",
  "resolutions",
];
const BLOCKED_SPEC_PATTERNS = [
  { label: "GitHub shorthand", pattern: /^github:/i },
  { label: "git URL", pattern: /^git(?:\+|:)/i },
  { label: "remote URL", pattern: /^https?:/i },
];
const LOCKFILE_BLOCKED_PATTERNS = [
  { label: "GitHub shorthand dependency", pattern: /\bgithub:/i },
  { label: "git URL dependency", pattern: /\bgit\+/i },
  { label: "remote tarball dependency", pattern: /\btarball:\s*https?:/i },
  {
    label: "TanStack compromise optional dependency",
    pattern: /@tanstack\/setup/i,
  },
];
const WORKFLOW_USES_PATTERN = /^\s*uses:\s*([^#\s]+)\s*(?:#.*)?$/;
const PINNED_ACTION_REF_PATTERN = /^[a-f0-9]{40}$/;

type Issue = {
  file: string;
  message: string;
};

const workspaceDir = process.cwd();
const issues: Issue[] = [];

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addIssue(filePath: string, message: string): void {
  issues.push({
    file: path.relative(workspaceDir, filePath),
    message,
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

import { createHash } from "node:crypto";

export type PrPreviewMetadata = {
  branch: string;
  hash: string;
  tag: string;
  message: string;
  previewAlias: string | null;
};

const TAG_PREFIX = "noter-pr-preview";
const HASH_LENGTH = 12;
const MAX_WORKERS_TAG_BYTES = 100;
const MAX_DNS_LABEL_LENGTH = 63;

function hashBranch(branch: string): string {
  return createHash("sha256")
    .update(branch)
    .digest("hex")
    .slice(0, HASH_LENGTH);
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function sanitizeBranchForAlias(branch: string): string {
  const sanitized = branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!sanitized) {
    return "pr";
  }

  return /^[a-z]/.test(sanitized) ? sanitized : `pr-${sanitized}`;
}

function trimAliasPrefix(prefix: string, maxLength: number): string {
  const trimmed = prefix.slice(0, maxLength).replace(/-+$/g, "");
  if (!trimmed) {
    return "pr";
  }

  return /^[a-z]/.test(trimmed) ? trimmed : `pr-${trimmed}`;
}

export function buildPrPreviewTag(branch: string): string {
  const tag = `${TAG_PREFIX}:${hashBranch(branch)}`;
  if (byteLength(tag) > MAX_WORKERS_TAG_BYTES) {
    throw new Error("Generated Cloudflare Workers preview tag is too long.");
  }

  return tag;
}

export function buildPrPreviewAlias(args: {
  branch: string;
  workerName: string;
}): string | null {
  const maxAliasLength = MAX_DNS_LABEL_LENGTH - args.workerName.length - 1;
  if (maxAliasLength < HASH_LENGTH + 3) {
    return null;
  }

  const hash = hashBranch(args.branch);
  const suffix = `-${hash}`;
  const rawAlias = `${sanitizeBranchForAlias(args.branch)}${suffix}`;
  if (rawAlias.length <= maxAliasLength) {
    return rawAlias;
  }

  const prefixLength = maxAliasLength - suffix.length;
  return `${trimAliasPrefix(rawAlias, prefixLength)}${suffix}`;
}

export function buildPrPreviewMetadata(args: {
  branch: string;
  workerName: string;
}): PrPreviewMetadata {
  const branch = args.branch.trim();
  if (!branch) {
    throw new Error("Branch name is required for PR preview metadata.");
  }

  const hash = hashBranch(branch);
  return {
    branch,
    hash,
    tag: buildPrPreviewTag(branch),
    message: `noter.md PR preview for ${branch}`,
    previewAlias: buildPrPreviewAlias({
      branch,
      workerName: args.workerName,
    }),
  };
}

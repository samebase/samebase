import type { CloudflareBuildState } from "./cloudflareBuildMatching";
import {
  normalizeCloudflareWorkerPreviewUrl,
  parseCloudflareWorkerBuildLogsUrl,
} from "../../shared/cloudflareResourceUrls";
import type {
  CloudflareWorkerProof,
  CloudflareWorkerProofRead,
} from "./pullRequestCloudflareWorkerProof";

type CloudflareWorkerCommentBodies =
  | { state: "available"; bodies: string[] }
  | { state: "unavailable" };

export type CloudflareWorkerCommentParseFailure = {
  providerFormat: "cloudflare_workers" | "cloudflare_unknown";
  failureKind: "format_drift" | "invalid_or_conflict";
};

function markdownTableCells(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
    return null;
  }
  return trimmed
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function parseCloudflareWorkerBuildState(statusCell: string): CloudflareBuildState | null {
  const match = statusCell.match(/^(.+?)\s*<br>\s*\[View logs\]\([^\s)]+\)\s*$/);
  if (match === null) {
    return null;
  }

  switch (match[1].trim()) {
    case "✅ Deployment successful!":
      return "success";
    case "❌ Deployment failed":
      return "failure";
    case "🔵 In progress":
      return "running";
    default:
      return "unknown";
  }
}

function parseCloudflareWorkerComment(body: string): CloudflareWorkerProofRead {
  const workers: CloudflareWorkerProof[] = [];
  const lines = body.split(/\r?\n/);
  for (let headerIndex = 0; headerIndex + 2 < lines.length; headerIndex += 1) {
    const header = markdownTableCells(lines[headerIndex]);
    const separator = markdownTableCells(lines[headerIndex + 1]);
    if (!header || !separator || header.length !== separator.length) {
      continue;
    }
    const nameColumns = header.flatMap((cell, index) => (cell === "Name" ? [index] : []));
    const statusColumns = header.flatMap((cell, index) => (cell === "Status" ? [index] : []));
    const commitColumns = header.flatMap((cell, index) =>
      cell === "Latest Commit" ? [index] : [],
    );
    if (
      nameColumns.length !== 1 ||
      statusColumns.length !== 1 ||
      commitColumns.length !== 1 ||
      !separator.every((cell) => /^:?-+:?$/.test(cell))
    ) {
      continue;
    }
    const previewColumns = header.flatMap((cell, index) => (cell === "Preview URL" ? [index] : []));
    if (previewColumns.length > 1) {
      return { state: "unavailable" };
    }

    for (let rowIndex = headerIndex + 2; rowIndex < lines.length; rowIndex += 1) {
      const row = markdownTableCells(lines[rowIndex]);
      if (!row || row.length !== header.length) {
        break;
      }
      const workerName = row[nameColumns[0]];
      const logsCell = row[statusColumns[0]];
      const commitOidPrefix = row[commitColumns[0]];
      const buildLogsAnchors = [...logsCell.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)];
      const buildLogsLabelCount = [...logsCell.matchAll(/View logs/g)].length;
      if (
        workerName.length === 0 ||
        buildLogsAnchors.length !== buildLogsLabelCount ||
        buildLogsAnchors.length !== 1 ||
        buildLogsAnchors[0][1] !== "View logs"
      ) {
        return { state: "unavailable" };
      }

      const logsIdentity = parseCloudflareWorkerBuildLogsUrl(buildLogsAnchors[0][2]);
      const buildState = parseCloudflareWorkerBuildState(logsCell);
      if (
        logsIdentity === null ||
        buildState === null ||
        logsIdentity.workerName !== workerName ||
        !/^[0-9a-f]{7,64}$/.test(commitOidPrefix)
      ) {
        return { state: "unavailable" };
      }
      let previewUrl: string | null = null;
      if (previewColumns.length > 0) {
        const previewCell = row[previewColumns[0]];
        if (previewCell.includes("Branch Preview URL")) {
          const branchPreviewAnchors = [
            ...previewCell.matchAll(/<a href=(['"])([^'"]+)\1>Branch Preview URL<\/a>/g),
          ];
          const branchPreviewLabelCount = [...previewCell.matchAll(/Branch Preview URL/g)].length;
          if (
            branchPreviewAnchors.length !== branchPreviewLabelCount ||
            branchPreviewAnchors.length === 0
          ) {
            return { state: "unavailable" };
          }
          const previewUrls = new Set<string>();
          for (const anchor of branchPreviewAnchors) {
            const normalized = normalizeCloudflareWorkerPreviewUrl(anchor[2], workerName);
            if (normalized === null) {
              return { state: "unavailable" };
            }
            previewUrls.add(normalized.url);
          }
          if (previewUrls.size !== 1) {
            return { state: "unavailable" };
          }
          const [url] = previewUrls;
          previewUrl = url;
        }
      }

      workers.push({
        accountId: logsIdentity.accountId,
        buildUuid: logsIdentity.buildUuid,
        buildState,
        logsUrl: buildLogsAnchors[0][2],
        name: workerName,
        previewUrl,
      });
    }
  }
  return { state: "available", workers };
}

function hasKnownCloudflareWorkerTable(body: string): boolean {
  const lines = body.split(/\r?\n/);
  return lines.some((line, index) => {
    const header = markdownTableCells(line);
    const separator = markdownTableCells(lines[index + 1] ?? "");
    if (header === null || separator?.length !== header.length) {
      return false;
    }
    const nameColumns = header.flatMap((cell, column) => (cell === "Name" ? [column] : []));
    const statusColumns = header.flatMap((cell, column) => (cell === "Status" ? [column] : []));
    const commitColumns = header.flatMap((cell, column) =>
      cell === "Latest Commit" ? [column] : [],
    );
    const previewColumns = header.flatMap((cell, column) =>
      cell === "Preview URL" ? [column] : [],
    );
    if (
      nameColumns.length !== 1 ||
      statusColumns.length !== 1 ||
      commitColumns.length !== 1 ||
      previewColumns.length > 1 ||
      !separator.every((cell) => /^:?-+:?$/.test(cell))
    ) {
      return false;
    }
    if (previewColumns.length === 0) {
      return markdownTableCells(lines[index + 2] ?? "")?.length === header.length;
    }
    let sawRow = false;
    for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
      const row = markdownTableCells(lines[rowIndex]);
      if (row === null) {
        break;
      }
      if (row.length !== header.length) {
        return false;
      }
      sawRow = true;
      const previewCell = row[previewColumns[0]];
      const statusCell = row[statusColumns[0]];
      if (
        !previewCell.includes("Branch Preview URL") &&
        previewCell !== "" &&
        previewCell !== "-" &&
        statusCell.includes("Deployment successful")
      ) {
        return false;
      }
    }
    return sawRow;
  });
}

export function resolveCloudflareWorkerComments(
  comments: CloudflareWorkerCommentBodies,
): CloudflareWorkerProofRead {
  if (comments.state === "unavailable") {
    return comments;
  }

  const workersByIdentity = new Map<string, CloudflareWorkerProof>();
  for (const body of comments.bodies) {
    const comment = parseCloudflareWorkerComment(body);
    if (comment.state === "unavailable") {
      return comment;
    }
    for (const worker of comment.workers) {
      const identity = `${worker.accountId}:${worker.name}`;
      const previous = workersByIdentity.get(identity);
      if (
        previous &&
        (previous.buildUuid !== worker.buildUuid ||
          previous.buildState !== worker.buildState ||
          previous.logsUrl !== worker.logsUrl ||
          previous.previewUrl !== worker.previewUrl)
      ) {
        return { state: "unavailable" };
      }
      workersByIdentity.set(identity, worker);
    }
  }

  return {
    state: "available",
    workers: [...workersByIdentity.values()].sort(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        left.accountId.localeCompare(right.accountId) ||
        left.buildUuid.localeCompare(right.buildUuid),
    ),
  };
}

export function detectCloudflareWorkerCommentParseFailures(args: {
  comments: CloudflareWorkerCommentBodies;
  proof: CloudflareWorkerProofRead;
}): CloudflareWorkerCommentParseFailure[] {
  if (args.comments.state === "unavailable") {
    return [];
  }

  const failures: CloudflareWorkerCommentParseFailure[] = [];
  for (const body of args.comments.bodies) {
    if (body.includes("Cloudflare Workers") && !hasKnownCloudflareWorkerTable(body)) {
      failures.push({ providerFormat: "cloudflare_workers", failureKind: "format_drift" });
    }
  }
  if (args.proof.state === "unavailable" && failures.length === 0) {
    failures.push({
      providerFormat: "cloudflare_unknown",
      failureKind: "invalid_or_conflict",
    });
  }
  return failures;
}

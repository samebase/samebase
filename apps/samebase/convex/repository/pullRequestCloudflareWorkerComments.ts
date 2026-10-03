import type { CloudflareBuildState } from "./providerObservationModel";
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

type CloudflareWorkerTableColumns = {
  columnCount: number;
  nameColumn: number;
  statusColumn: number;
  commitColumn: number;
  previewColumn: number | null;
};

type CloudflareWorkerTableHeader =
  | { state: "valid"; columns: CloudflareWorkerTableColumns }
  | { state: "not_worker_table" }
  | { state: "invalid" };

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

function parseCloudflareWorkerTableHeader(
  headerLine: string,
  separatorLine: string,
): CloudflareWorkerTableHeader {
  const header = markdownTableCells(headerLine);
  const separator = markdownTableCells(separatorLine);
  if (header === null || separator === null || header.length !== separator.length) {
    return { state: "not_worker_table" };
  }

  const nameColumns = header.flatMap((cell, index) => (cell === "Name" ? [index] : []));
  const statusColumns = header.flatMap((cell, index) => (cell === "Status" ? [index] : []));
  const commitColumns = header.flatMap((cell, index) => (cell === "Latest Commit" ? [index] : []));
  if (
    nameColumns.length !== 1 ||
    statusColumns.length !== 1 ||
    commitColumns.length !== 1 ||
    !separator.every((cell) => /^:?-+:?$/.test(cell))
  ) {
    return { state: "not_worker_table" };
  }

  const previewColumns = header.flatMap((cell, index) => (cell === "Preview URL" ? [index] : []));
  if (previewColumns.length > 1) {
    return { state: "invalid" };
  }

  return {
    state: "valid",
    columns: {
      columnCount: header.length,
      nameColumn: nameColumns[0],
      statusColumn: statusColumns[0],
      commitColumn: commitColumns[0],
      previewColumn: previewColumns[0] ?? null,
    },
  };
}

function parseCloudflareWorkerRow(
  row: string[],
  columns: CloudflareWorkerTableColumns,
): CloudflareWorkerProof | null {
  const workerName = row[columns.nameColumn];
  const logsCell = row[columns.statusColumn];
  const commitOidPrefix = row[columns.commitColumn];
  const buildLogsAnchors = [...logsCell.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)];
  const buildLogsLabelCount = [...logsCell.matchAll(/View logs/g)].length;
  if (
    workerName.length === 0 ||
    buildLogsAnchors.length !== buildLogsLabelCount ||
    buildLogsAnchors.length !== 1 ||
    buildLogsAnchors[0][1] !== "View logs"
  ) {
    return null;
  }

  const logsUrl = buildLogsAnchors[0][2];
  const logsIdentity = parseCloudflareWorkerBuildLogsUrl(logsUrl);
  const buildState = parseCloudflareWorkerBuildState(logsCell);
  if (
    logsIdentity === null ||
    buildState === null ||
    logsIdentity.workerName !== workerName ||
    !/^[0-9a-f]{7,64}$/.test(commitOidPrefix)
  ) {
    return null;
  }

  let preview: CloudflareWorkerProof["preview"] = { state: "absent" };
  if (columns.previewColumn !== null) {
    const previewCell = row[columns.previewColumn];
    if (previewCell.includes("Branch Preview URL")) {
      const branchPreviewAnchors = [
        ...previewCell.matchAll(/<a href=(['"])([^'"]+)\1>Branch Preview URL<\/a>/g),
      ];
      const branchPreviewLabelCount = [...previewCell.matchAll(/Branch Preview URL/g)].length;
      if (
        branchPreviewAnchors.length !== branchPreviewLabelCount ||
        branchPreviewAnchors.length === 0
      ) {
        return null;
      }
      const previewUrls = new Set<string>();
      for (const anchor of branchPreviewAnchors) {
        const normalized = normalizeCloudflareWorkerPreviewUrl(anchor[2], workerName);
        if (normalized === null) {
          return null;
        }
        previewUrls.add(normalized.url);
      }
      if (previewUrls.size !== 1) {
        return null;
      }
      const [url] = previewUrls;
      preview = { state: "available", url, provenance: "selected_result" };
    }
  }

  return {
    accountId: logsIdentity.accountId,
    buildUuid: logsIdentity.buildUuid,
    buildState,
    logsUrl,
    name: workerName,
    preview,
  };
}

function parseCloudflareWorkerComment(body: string): CloudflareWorkerProofRead {
  const workers: CloudflareWorkerProof[] = [];
  const lines = body.split(/\r?\n/);
  for (let headerIndex = 0; headerIndex + 2 < lines.length; headerIndex += 1) {
    const table = parseCloudflareWorkerTableHeader(lines[headerIndex], lines[headerIndex + 1]);
    if (table.state === "not_worker_table") {
      continue;
    }
    if (table.state === "invalid") {
      return { state: "unavailable" };
    }

    for (let rowIndex = headerIndex + 2; rowIndex < lines.length; rowIndex += 1) {
      const row = markdownTableCells(lines[rowIndex]);
      if (row === null || row.length !== table.columns.columnCount) {
        break;
      }
      const worker = parseCloudflareWorkerRow(row, table.columns);
      if (worker === null) {
        return { state: "unavailable" };
      }
      workers.push(worker);
    }
  }
  return { state: "available", workers };
}

function hasKnownCloudflareWorkerTable(body: string): boolean {
  const lines = body.split(/\r?\n/);
  return lines.some((line, index) => {
    const table = parseCloudflareWorkerTableHeader(line, lines[index + 1] ?? "");
    if (table.state !== "valid") {
      return false;
    }
    if (table.columns.previewColumn === null) {
      return markdownTableCells(lines[index + 2] ?? "")?.length === table.columns.columnCount;
    }
    let sawRow = false;
    for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
      const row = markdownTableCells(lines[rowIndex]);
      if (row === null) {
        break;
      }
      if (row.length !== table.columns.columnCount) {
        return false;
      }
      sawRow = true;
      const previewCell = row[table.columns.previewColumn];
      const statusCell = row[table.columns.statusColumn];
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
          previous.preview.state !== worker.preview.state ||
          (previous.preview.state === "available" &&
            worker.preview.state === "available" &&
            (previous.preview.url !== worker.preview.url ||
              previous.preview.provenance !== worker.preview.provenance)))
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

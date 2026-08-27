import type { CloudflareBuildState } from "./cloudflareBuildMatching";
import type {
  CloudflareWorkerBuildRead,
  CloudflareWorkerPreview,
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

function cloudflareDashboardTarget(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "dash.cloudflare.com" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.port !== "" ||
      parsed.hash !== ""
    ) {
      return null;
    }

    if (parsed.pathname === "/") {
      const entries = [...parsed.searchParams.entries()];
      if (
        entries.length !== 1 ||
        entries[0][0] !== "to" ||
        /%(?:2f|5c)/i.test(parsed.search) ||
        /%(?:2f|5c)/i.test(entries[0][1])
      ) {
        return null;
      }
      return entries[0][1];
    }

    return parsed.search === "" && !/%(?:2f|5c)/i.test(parsed.pathname) ? parsed.pathname : null;
  } catch {
    return null;
  }
}

function parseCloudflareWorkerBuildLogsUrl(
  url: string,
): { accountId: string; buildUuid: string; workerName: string } | null {
  const target = cloudflareDashboardTarget(url);
  if (target === null) {
    return null;
  }
  const segments = target.split("/").filter((segment) => segment.length > 0);
  if (
    segments.length !== 8 ||
    segments[1] !== "workers" ||
    segments[2] !== "services" ||
    segments[3] !== "view" ||
    segments[5] !== "production" ||
    segments[6] !== "builds" ||
    !segments.every((segment) => /^[A-Za-z0-9._-]+$/.test(segment))
  ) {
    return null;
  }
  return { accountId: segments[0], buildUuid: segments[7], workerName: segments[4] };
}

function normalizeCloudflareWorkerPreviewUrl(url: string, workerName: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.port === "" &&
      parsed.pathname === "/" &&
      parsed.search === "" &&
      parsed.hash === "" &&
      parsed.hostname.endsWith(".workers.dev") &&
      parsed.hostname.includes(`-${workerName.toLowerCase()}.`)
      ? parsed.origin
      : null;
  } catch {
    return null;
  }
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
  const previews: CloudflareWorkerPreview[] = [];
  const workerBuilds: CloudflareWorkerBuildRead[] = [];
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
      workerBuilds.push({
        accountId: logsIdentity.accountId,
        buildUuid: logsIdentity.buildUuid,
        buildState,
        logsUrl: buildLogsAnchors[0][2],
        name: workerName,
      });

      if (previewColumns.length === 0) {
        continue;
      }
      const previewCell = row[previewColumns[0]];
      if (!previewCell.includes("Branch Preview URL")) {
        continue;
      }

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
      for (const match of branchPreviewAnchors) {
        const url = normalizeCloudflareWorkerPreviewUrl(match[2], workerName);
        if (url === null) {
          return { state: "unavailable" };
        }
        previews.push({
          kind: "worker",
          accountId: logsIdentity.accountId,
          name: workerName,
          url,
        });
      }
    }
  }
  return { state: "available", previews, workerBuilds };
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

  const previewsByIdentity = new Map<string, CloudflareWorkerPreview>();
  const workerBuildsByIdentity = new Map<string, CloudflareWorkerBuildRead>();
  for (const body of comments.bodies) {
    const comment = parseCloudflareWorkerComment(body);
    if (comment.state === "unavailable") {
      return comment;
    }
    for (const preview of comment.previews) {
      const identity = `${preview.accountId}:${preview.name}`;
      const previous = previewsByIdentity.get(identity);
      if (previous && previous.url !== preview.url) {
        return { state: "unavailable" };
      }
      previewsByIdentity.set(identity, preview);
    }
    for (const build of comment.workerBuilds) {
      const identity = `${build.accountId}:${build.name}`;
      const previous = workerBuildsByIdentity.get(identity);
      if (
        previous &&
        (previous.buildUuid !== build.buildUuid ||
          previous.buildState !== build.buildState ||
          previous.logsUrl !== build.logsUrl)
      ) {
        return { state: "unavailable" };
      }
      workerBuildsByIdentity.set(identity, build);
    }
  }

  return {
    state: "available",
    previews: [...previewsByIdentity.values()].sort(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        left.accountId.localeCompare(right.accountId) ||
        left.url.localeCompare(right.url),
    ),
    workerBuilds: [...workerBuildsByIdentity.values()].sort(
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

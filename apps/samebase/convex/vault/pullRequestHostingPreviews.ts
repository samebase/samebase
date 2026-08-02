import type { CloudflareBuildState } from "./cloudflareBuildMatching";

export type HostingCommentBodies =
  | { state: "available"; bodies: string[] }
  | { state: "unavailable" };

export type HostingPreviewRead<Preview> =
  | { state: "available"; previews: Preview[] }
  | { state: "unavailable" };

export type HostingCommentParseFailure = {
  providerFormat: "cloudflare_workers" | "cloudflare_pages" | "cloudflare_unknown" | "netlify";
  failureKind: "format_drift" | "invalid_or_conflict";
};

export type CloudflareHostingPreview =
  | {
      kind: "worker";
      accountId: string;
      name: string;
      url: string;
    }
  | {
      kind: "pages";
      accountId: string;
      name: string;
      url: string;
    };

export type CloudflareWorkerCommentBuild = {
  accountId: string;
  buildUuid: string;
  buildState: CloudflareBuildState;
  logsUrl: string;
  name: string;
};

export type CloudflareHostingRead =
  | {
      state: "available";
      previews: CloudflareHostingPreview[];
      workerBuilds: CloudflareWorkerCommentBuild[];
    }
  | { state: "unavailable" };

export type NetlifyHostingPreview = {
  name: string;
  url: string;
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

function parseCloudflarePagesLogsUrl(
  url: string,
): { accountId: string; projectName: string } | null {
  const target = cloudflareDashboardTarget(url);
  if (target === null) {
    return null;
  }
  const segments = target.split("/").filter((segment) => segment.length > 0);
  if (
    segments.length !== 5 ||
    segments[1] !== "pages" ||
    segments[2] !== "view" ||
    !segments.every((segment) => /^[A-Za-z0-9._-]+$/.test(segment))
  ) {
    return null;
  }
  return { accountId: segments[0], projectName: segments[3] };
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

function normalizeCloudflarePagesPreviewUrl(url: string, projectName: string): string | null {
  try {
    const parsed = new URL(url);
    const projectSuffix = `.${projectName.toLowerCase()}.pages.dev`;
    return parsed.protocol === "https:" &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.port === "" &&
      parsed.pathname === "/" &&
      parsed.search === "" &&
      parsed.hash === "" &&
      parsed.hostname.endsWith(projectSuffix) &&
      parsed.hostname.length > projectSuffix.length
      ? parsed.origin
      : null;
  } catch {
    return null;
  }
}

type CloudflareWorkerCommentRead =
  | {
      state: "available";
      previews: Extract<CloudflareHostingPreview, { kind: "worker" }>[];
      workerBuilds: CloudflareWorkerCommentBuild[];
    }
  | { state: "unavailable" };

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

function parseCloudflareWorkerComment(body: string): CloudflareWorkerCommentRead {
  const previews: Extract<CloudflareHostingPreview, { kind: "worker" }>[] = [];
  const workerBuilds: CloudflareWorkerCommentBuild[] = [];
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

function parseCloudflarePagesPreviewFromBody(
  body: string,
): HostingPreviewRead<Extract<CloudflareHostingPreview, { kind: "pages" }>> {
  const logsAnchors = [...body.matchAll(/\[View logs\]\(([^)\s]+)\)/g)];
  const pageLogs = logsAnchors.flatMap((match) => {
    const identity = parseCloudflarePagesLogsUrl(match[1]);
    return identity === null ? [] : [identity];
  });
  const branchLabelCount = [...body.matchAll(/<strong>Branch Preview URL:<\/strong>/g)].length;
  if (pageLogs.length === 0 && branchLabelCount === 0) {
    return { state: "available", previews: [] };
  }
  if (pageLogs.length !== logsAnchors.length || pageLogs.length !== 1) {
    return { state: "unavailable" };
  }
  if (branchLabelCount === 0) {
    return { state: "available", previews: [] };
  }

  const headingMatches = [
    ...body.matchAll(/^## Deploying ([A-Za-z0-9._-]+) with .*Cloudflare Pages\s*$/gm),
  ];
  const branchRows = [
    ...body.matchAll(
      /<tr>\s*<td>\s*<strong>Branch Preview URL:<\/strong>\s*<\/td>\s*<td>\s*<a href=(['"])([^'"]+)\1>([^<]+)<\/a>\s*<\/td>\s*<\/tr>/g,
    ),
  ];
  const logsIdentity = pageLogs[0];
  if (
    headingMatches.length !== 1 ||
    headingMatches[0][1] !== logsIdentity.projectName ||
    branchRows.length !== branchLabelCount ||
    branchRows.length !== 1 ||
    branchRows[0][2] !== branchRows[0][3]
  ) {
    return { state: "unavailable" };
  }
  const url = normalizeCloudflarePagesPreviewUrl(branchRows[0][2], logsIdentity.projectName);
  return url === null
    ? { state: "unavailable" }
    : {
        state: "available",
        previews: [
          {
            kind: "pages",
            accountId: logsIdentity.accountId,
            name: logsIdentity.projectName,
            url,
          },
        ],
      };
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

function hasKnownCloudflarePagesEnvelope(body: string): boolean {
  const headings = [
    ...body.matchAll(/^## Deploying ([A-Za-z0-9._-]+) with .*Cloudflare Pages\s*$/gm),
  ];
  const branchLabels = [...body.matchAll(/<strong>Branch Preview URL:<\/strong>/g)];
  if (headings.length !== 1) {
    return false;
  }
  if (branchLabels.length > 0) {
    return true;
  }
  const logs = [...body.matchAll(/\[View logs\]\(([^)\s]+)\)/g)];
  const identity = logs.length === 1 ? parseCloudflarePagesLogsUrl(logs[0][1]) : null;
  return identity?.projectName === headings[0][1] && !body.includes("Deploy successful!");
}

function hasKnownNetlifyEnvelope(body: string): boolean {
  if (
    /Deploy Preview for .* (?:processing\.|failed[.!]?)/.test(body) &&
    !body.includes("Deploy Preview |")
  ) {
    return true;
  }
  if (!body.includes("Deploy Preview |")) {
    return false;
  }
  const lines = body.split(/\r?\n/);
  return lines.some((line, index) => {
    const header = markdownTableCells(line);
    const separator = markdownTableCells(lines[index + 1] ?? "");
    const firstRow = markdownTableCells(lines[index + 2] ?? "");
    return (
      header?.length === 2 &&
      header[0] === "Name" &&
      header[1] === "Link" &&
      separator?.length === header.length &&
      firstRow?.length === header.length &&
      separator.every((cell) => /^:?-+:?$/.test(cell))
    );
  });
}

export function detectHostingCommentParseFailures(args: {
  cloudflareComments: HostingCommentBodies;
  cloudflareRead: CloudflareHostingRead;
  netlifyComments: HostingCommentBodies;
  netlifyRead: HostingPreviewRead<NetlifyHostingPreview>;
}): HostingCommentParseFailure[] {
  const failures: HostingCommentParseFailure[] = [];
  if (args.cloudflareComments.state === "available") {
    for (const body of args.cloudflareComments.bodies) {
      if (body.includes("Cloudflare Workers")) {
        if (!hasKnownCloudflareWorkerTable(body)) {
          failures.push({ providerFormat: "cloudflare_workers", failureKind: "format_drift" });
        }
      } else if (body.includes("Cloudflare Pages")) {
        if (!hasKnownCloudflarePagesEnvelope(body)) {
          failures.push({ providerFormat: "cloudflare_pages", failureKind: "format_drift" });
        }
      } else {
        failures.push({ providerFormat: "cloudflare_unknown", failureKind: "format_drift" });
      }
    }
    if (args.cloudflareRead.state === "unavailable" && failures.length === 0) {
      failures.push({
        providerFormat: "cloudflare_unknown",
        failureKind: "invalid_or_conflict",
      });
    }
  }

  const cloudflareFailureCount = failures.length;
  if (args.netlifyComments.state === "available") {
    for (const body of args.netlifyComments.bodies) {
      if (!hasKnownNetlifyEnvelope(body)) {
        failures.push({ providerFormat: "netlify", failureKind: "format_drift" });
      }
    }
    if (args.netlifyRead.state === "unavailable" && failures.length === cloudflareFailureCount) {
      failures.push({ providerFormat: "netlify", failureKind: "invalid_or_conflict" });
    }
  }
  return failures;
}

export function resolveCloudflareHostingPreviews(
  comments: HostingCommentBodies,
): CloudflareHostingRead {
  if (comments.state === "unavailable") {
    return comments;
  }

  const byIdentity = new Map<string, CloudflareHostingPreview>();
  const workerBuildsByIdentity = new Map<string, CloudflareWorkerCommentBuild>();
  for (const body of comments.bodies) {
    const workerComment = parseCloudflareWorkerComment(body);
    const pagesPreviews = parseCloudflarePagesPreviewFromBody(body);
    if (workerComment.state === "unavailable" || pagesPreviews.state === "unavailable") {
      return { state: "unavailable" };
    }
    for (const preview of [...workerComment.previews, ...pagesPreviews.previews]) {
      const identity = `${preview.kind}:${preview.accountId}:${preview.name}`;
      const previous = byIdentity.get(identity);
      if (previous && previous.url !== preview.url) {
        return { state: "unavailable" };
      }
      byIdentity.set(identity, preview);
    }
    for (const build of workerComment.workerBuilds) {
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
    previews: [...byIdentity.values()].sort(
      (left, right) =>
        (left.kind === right.kind ? 0 : left.kind === "worker" ? -1 : 1) ||
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

export function resolveCloudflareCommentWorkerBuild(args: {
  accountId: string;
  resources: CloudflareHostingRead;
  workerName: string;
}):
  | { state: "available"; buildUuid: string; buildState: CloudflareBuildState; logsUrl: string }
  | { state: "absent" }
  | { state: "unavailable" } {
  if (args.resources.state === "unavailable") {
    return args.resources;
  }
  const matches = args.resources.workerBuilds.filter(
    (build) => build.accountId === args.accountId && build.name === args.workerName,
  );
  if (matches.length === 0) {
    return { state: "absent" };
  }
  return matches.length === 1
    ? {
        state: "available",
        buildUuid: matches[0].buildUuid,
        buildState: matches[0].buildState,
        logsUrl: matches[0].logsUrl,
      }
    : { state: "unavailable" };
}

export function resolveCloudflareCommentBranchPreviewUrl(args: {
  previews: CloudflareHostingRead;
  accountId: string;
  workerName: string;
}): { state: "available"; url: string } | { state: "absent" } | { state: "unavailable" } {
  if (args.previews.state === "unavailable") {
    return args.previews;
  }
  const matches = args.previews.previews.filter(
    (preview) =>
      preview.kind === "worker" &&
      preview.accountId === args.accountId &&
      preview.name === args.workerName,
  );
  if (matches.length === 0) {
    return { state: "absent" };
  }
  return matches.length === 1
    ? { state: "available", url: matches[0].url }
    : { state: "unavailable" };
}

function netlifyRowLabel(cell: string): string {
  const match = cell.match(/^<span aria-hidden="true">[^<]*<\/span>\s+(.+)$/);
  return match?.[1] ?? cell;
}

function parseNetlifyDeployLogUrl(cell: string): { siteName: string } | null {
  try {
    const parsed = new URL(cell);
    const segments = parsed.pathname.split("/").filter((segment) => segment.length > 0);
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "app.netlify.com" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.port !== "" ||
      parsed.search !== "" ||
      parsed.hash !== "" ||
      /%(?:2f|5c)/i.test(parsed.pathname) ||
      segments.length !== 4 ||
      (segments[0] !== "projects" && segments[0] !== "sites") ||
      segments[2] !== "deploys" ||
      !/^[A-Za-z0-9-]+$/.test(segments[1]) ||
      !/^[A-Za-z0-9-]+$/.test(segments[3])
    ) {
      return null;
    }
    return { siteName: segments[1] };
  } catch {
    return null;
  }
}

function normalizeNetlifyPreviewUrl(args: {
  pullRequestNumber: number;
  siteName: string;
  url: string;
}): string | null {
  try {
    const parsed = new URL(args.url);
    const expectedPrefix = `deploy-preview-${args.pullRequestNumber}`;
    const defaultHostname = `${expectedPrefix}--${args.siteName.toLowerCase()}.netlify.app`;
    const hostnameLabels = parsed.hostname.split(".");
    const customHostname = hostnameLabels.length >= 3 && hostnameLabels[0] === expectedPrefix;
    if (
      parsed.protocol !== "https:" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.port !== "" ||
      parsed.hash !== "" ||
      (parsed.hostname !== defaultHostname && !customHostname)
    ) {
      return null;
    }
    return `${parsed.origin}${parsed.pathname === "/" ? "" : parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

export function resolveNetlifyHostingPreviews(args: {
  comments: HostingCommentBodies;
  pullRequestNumber: number;
}): HostingPreviewRead<NetlifyHostingPreview> {
  if (args.comments.state === "unavailable") {
    return args.comments;
  }

  const bySite = new Map<string, NetlifyHostingPreview>();
  for (const body of args.comments.bodies) {
    const lines = body.split(/\r?\n/);
    for (let headerIndex = 0; headerIndex + 2 < lines.length; headerIndex += 1) {
      const header = markdownTableCells(lines[headerIndex]);
      const separator = markdownTableCells(lines[headerIndex + 1]);
      if (
        !header ||
        !separator ||
        header.length !== 2 ||
        header[0] !== "Name" ||
        header[1] !== "Link" ||
        separator.length !== header.length ||
        !separator.every((cell) => /^:?-+:?$/.test(cell))
      ) {
        continue;
      }

      const deployLogCells: string[] = [];
      const previewCells: string[] = [];
      for (let rowIndex = headerIndex + 2; rowIndex < lines.length; rowIndex += 1) {
        const row = markdownTableCells(lines[rowIndex]);
        if (!row || row.length !== header.length) {
          break;
        }
        const label = netlifyRowLabel(row[0]);
        if (label === "Latest deploy log") {
          deployLogCells.push(row[1]);
        } else if (label === "Deploy Preview") {
          previewCells.push(row[1]);
        }
      }
      if (previewCells.length === 0) {
        continue;
      }
      if (previewCells.length !== 1 || deployLogCells.length !== 1) {
        return { state: "unavailable" };
      }

      const deployLog = parseNetlifyDeployLogUrl(deployLogCells[0]);
      const previewAnchor = previewCells[0].match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      if (deployLog === null || previewAnchor === null || previewAnchor[1] !== previewAnchor[2]) {
        return { state: "unavailable" };
      }
      const url = normalizeNetlifyPreviewUrl({
        pullRequestNumber: args.pullRequestNumber,
        siteName: deployLog.siteName,
        url: previewAnchor[2],
      });
      if (url === null) {
        return { state: "unavailable" };
      }
      const previous = bySite.get(deployLog.siteName);
      if (previous && previous.url !== url) {
        return { state: "unavailable" };
      }
      bySite.set(deployLog.siteName, { name: deployLog.siteName, url });
    }
  }

  return {
    state: "available",
    previews: [...bySite.values()].sort(
      (left, right) => left.name.localeCompare(right.name) || left.url.localeCompare(right.url),
    ),
  };
}

import type { CloudflareBuildState } from "./cloudflareBuildMatching";

export type HostingCommentBodies =
  | { state: "available"; bodies: string[] }
  | { state: "unavailable" };

export type HostingPreviewRead<Preview> =
  | { state: "available"; previews: Preview[] }
  | { state: "unavailable" };

export type HostingCommentParseFailure = {
  providerFormat: "cloudflare_pages" | "cloudflare_unknown" | "netlify";
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

export type CloudflareWorkerBuildRead = {
  accountId: string;
  buildUuid: string;
  buildState: CloudflareBuildState;
  logsUrl: string;
  name: string;
};

export type CloudflareWorkerCheckRunInput = {
  id: string;
  name: string;
  status: string;
  conclusion: string | null;
  detailsUrl: string | null;
  externalId: string | null;
  title: string | null;
  summary: string | null;
};

export type CloudflareCommitCheckRuns = {
  checkRuns: CloudflareWorkerCheckRunInput[];
};

export type CloudflareWorkerCheckRead =
  | {
      state: "available";
      previews: Extract<CloudflareHostingPreview, { kind: "worker" }>[];
      workerBuilds: CloudflareWorkerBuildRead[];
    }
  | { state: "unavailable" };

export type CloudflarePagesRead = HostingPreviewRead<
  Extract<CloudflareHostingPreview, { kind: "pages" }>
>;

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

function parseCloudflareWorkerScriptUrl(
  url: string,
): { accountId: string; workerName: string } | null {
  const target = cloudflareDashboardTarget(url);
  if (target === null) {
    return null;
  }
  const segments = target.split("/").filter((segment) => segment.length > 0);
  if (
    segments.length !== 6 ||
    segments[1] !== "workers" ||
    segments[2] !== "services" ||
    segments[3] !== "view" ||
    segments[5] !== "production" ||
    !segments.every((segment) => /^[A-Za-z0-9._-]+$/.test(segment))
  ) {
    return null;
  }
  return { accountId: segments[0], workerName: segments[4] };
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

function normalizeCloudflareWorkerPreviewUrl(
  url: string,
  workerName: string,
): { url: string; zone: string } | null {
  try {
    const parsed = new URL(url);
    const workerMarker = `-${workerName.toLowerCase()}.`;
    const workerMarkerIndex = parsed.hostname.lastIndexOf(workerMarker);
    return parsed.protocol === "https:" &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.port === "" &&
      parsed.pathname === "/" &&
      parsed.search === "" &&
      parsed.hash === "" &&
      parsed.hostname.endsWith(".workers.dev") &&
      workerMarkerIndex >= 0
      ? {
          url: parsed.origin,
          zone: parsed.hostname.slice(workerMarkerIndex + workerMarker.length),
        }
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

function parseCloudflareCheckRunBuildState(
  status: string,
  conclusion: string | null,
): CloudflareBuildState {
  switch (status) {
    case "QUEUED":
    case "PENDING":
    case "REQUESTED":
    case "WAITING":
      return "queued";
    case "IN_PROGRESS":
      return "running";
    case "COMPLETED":
      break;
    default:
      return "unknown";
  }

  switch (conclusion) {
    case "SUCCESS":
      return "success";
    case "FAILURE":
    case "TIMED_OUT":
    case "ACTION_REQUIRED":
    case "STARTUP_FAILURE":
    case "STALE":
      return "failure";
    case "CANCELLED":
      return "cancelled";
    case "SKIPPED":
    case "NEUTRAL":
      return "skipped";
    case null:
    default:
      return "unknown";
  }
}

function readCloudflareCheckSummaryFields(summary: string): Map<string, string> | null {
  const fields = new Map<string, string>();
  for (const line of summary.split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Za-z ]+):\s*(.+)$/);
    if (match === null) {
      continue;
    }
    const label = match[1];
    if (fields.has(label)) {
      return null;
    }
    fields.set(label, match[2]);
  }
  return fields;
}

function markdownLink(value: string): { label: string; url: string } | null {
  const match = value.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
  return match === null ? null : { label: match[1], url: match[2] };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type CloudflareWorkerCheckCandidate = CloudflareWorkerBuildRead & {
  preview: Extract<CloudflareHostingPreview, { kind: "worker" }> | null;
};

function parseCloudflareWorkerCheckRun(
  checkRun: CloudflareWorkerCheckRunInput,
): CloudflareWorkerCheckCandidate | null | "unavailable" {
  if (!checkRun.name.startsWith("Workers Builds: ")) {
    return null;
  }
  const workerName = checkRun.name.slice("Workers Builds: ".length);
  if (
    workerName.length === 0 ||
    checkRun.title !== checkRun.name ||
    checkRun.detailsUrl === null ||
    checkRun.externalId === null ||
    checkRun.summary === null
  ) {
    return "unavailable";
  }

  const logsIdentity = parseCloudflareWorkerBuildLogsUrl(checkRun.detailsUrl);
  const fields = readCloudflareCheckSummaryFields(checkRun.summary);
  const buildLink = fields === null ? null : markdownLink(fields.get("Build ID") ?? "");
  const scriptLink = fields === null ? null : markdownLink(fields.get("Script") ?? "");
  const scriptIdentity =
    scriptLink === null ? null : parseCloudflareWorkerScriptUrl(scriptLink.url);
  if (
    logsIdentity === null ||
    fields === null ||
    buildLink === null ||
    scriptLink === null ||
    scriptIdentity === null ||
    workerName !== logsIdentity.workerName ||
    workerName !== scriptLink.label ||
    workerName !== scriptIdentity.workerName ||
    logsIdentity.accountId !== scriptIdentity.accountId ||
    !/^[0-9a-f]{32}$/.test(logsIdentity.accountId) ||
    !isUuid(logsIdentity.buildUuid) ||
    checkRun.externalId !== logsIdentity.buildUuid ||
    buildLink.label !== logsIdentity.buildUuid ||
    buildLink.url !== checkRun.detailsUrl
  ) {
    return "unavailable";
  }

  const versionId = fields.get("Version ID");
  if (versionId !== undefined && !isUuid(versionId)) {
    return "unavailable";
  }
  const previewUrl = fields.get("Preview URL");
  const previewAliasUrl = fields.get("Preview Alias URL");
  if ((previewUrl === undefined) !== (previewAliasUrl === undefined)) {
    return "unavailable";
  }
  if (previewUrl !== undefined && previewAliasUrl !== undefined) {
    const normalizedPreview = normalizeCloudflareWorkerPreviewUrl(previewUrl, workerName);
    const normalizedAlias = normalizeCloudflareWorkerPreviewUrl(previewAliasUrl, workerName);
    if (
      versionId === undefined ||
      normalizedPreview === null ||
      normalizedAlias === null ||
      normalizedPreview.zone !== normalizedAlias.zone ||
      !new URL(normalizedPreview.url).hostname.startsWith(`${versionId.slice(0, 8).toLowerCase()}-`)
    ) {
      return "unavailable";
    }
    return {
      accountId: logsIdentity.accountId,
      buildUuid: logsIdentity.buildUuid,
      buildState: parseCloudflareCheckRunBuildState(checkRun.status, checkRun.conclusion),
      logsUrl: checkRun.detailsUrl,
      name: workerName,
      preview: {
        kind: "worker",
        accountId: logsIdentity.accountId,
        name: workerName,
        url: normalizedAlias.url,
      },
    };
  }

  return {
    accountId: logsIdentity.accountId,
    buildUuid: logsIdentity.buildUuid,
    buildState: parseCloudflareCheckRunBuildState(checkRun.status, checkRun.conclusion),
    logsUrl: checkRun.detailsUrl,
    name: workerName,
    preview: null,
  };
}

export function resolveCloudflareWorkerCheckRuns(
  commits: readonly CloudflareCommitCheckRuns[],
): CloudflareWorkerCheckRead {
  const selected = new Map<string, CloudflareWorkerCheckCandidate>();
  for (const commit of [...commits].reverse()) {
    const current = new Map<string, CloudflareWorkerCheckCandidate>();
    for (const checkRun of commit.checkRuns) {
      const candidate = parseCloudflareWorkerCheckRun(checkRun);
      if (candidate === "unavailable") {
        return { state: "unavailable" };
      }
      if (candidate === null) {
        continue;
      }
      const workerIdentity = `${candidate.accountId}:${candidate.name}`;
      if (current.has(workerIdentity)) {
        return { state: "unavailable" };
      }
      current.set(workerIdentity, candidate);
    }
    for (const [identity, candidate] of current) {
      if (!selected.has(identity)) {
        selected.set(identity, candidate);
      }
    }
  }

  const candidates = [...selected.values()].sort(
    (left, right) =>
      left.name.localeCompare(right.name) ||
      left.accountId.localeCompare(right.accountId) ||
      left.buildUuid.localeCompare(right.buildUuid),
  );
  return {
    state: "available",
    previews: candidates.flatMap((candidate) =>
      candidate.preview === null ? [] : [candidate.preview],
    ),
    workerBuilds: candidates.map((candidate) => ({
      accountId: candidate.accountId,
      buildUuid: candidate.buildUuid,
      buildState: candidate.buildState,
      logsUrl: candidate.logsUrl,
      name: candidate.name,
    })),
  };
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
  cloudflareRead: CloudflarePagesRead;
  netlifyComments: HostingCommentBodies;
  netlifyRead: HostingPreviewRead<NetlifyHostingPreview>;
}): HostingCommentParseFailure[] {
  const failures: HostingCommentParseFailure[] = [];
  if (args.cloudflareComments.state === "available") {
    for (const body of args.cloudflareComments.bodies) {
      if (body.includes("Cloudflare Workers")) {
        continue;
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

export function resolveCloudflarePagesPreviews(
  comments: HostingCommentBodies,
): CloudflarePagesRead {
  if (comments.state === "unavailable") {
    return comments;
  }

  const byIdentity = new Map<string, Extract<CloudflareHostingPreview, { kind: "pages" }>>();
  for (const body of comments.bodies) {
    if (body.includes("Cloudflare Workers")) {
      continue;
    }
    const pagesPreviews = parseCloudflarePagesPreviewFromBody(body);
    if (pagesPreviews.state === "unavailable") {
      return { state: "unavailable" };
    }
    for (const preview of pagesPreviews.previews) {
      const identity = `${preview.accountId}:${preview.name}`;
      const previous = byIdentity.get(identity);
      if (previous && previous.url !== preview.url) {
        return { state: "unavailable" };
      }
      byIdentity.set(identity, preview);
    }
  }

  return {
    state: "available",
    previews: [...byIdentity.values()].sort(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        left.accountId.localeCompare(right.accountId) ||
        left.url.localeCompare(right.url),
    ),
  };
}

export function resolveCloudflareWorkerBuild(args: {
  accountId: string;
  resources: CloudflareWorkerCheckRead;
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

export function resolveCloudflareWorkerBranchPreviewUrl(args: {
  previews: CloudflareWorkerCheckRead;
  accountId: string;
  workerName: string;
}): { state: "available"; url: string } | { state: "absent" } | { state: "unavailable" } {
  if (args.previews.state === "unavailable") {
    return args.previews;
  }
  const matches = args.previews.previews.filter(
    (preview) => preview.accountId === args.accountId && preview.name === args.workerName,
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

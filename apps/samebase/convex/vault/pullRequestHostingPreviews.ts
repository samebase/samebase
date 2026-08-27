import {
  normalizeCloudflarePagesPreviewUrl,
  parseCloudflarePagesLogsUrl,
} from "../../shared/cloudflareResourceUrls";

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

export type CloudflarePagesPreview = {
  kind: "pages";
  accountId: string;
  name: string;
  url: string;
};

export type CloudflarePagesRead = HostingPreviewRead<CloudflarePagesPreview>;

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

function parseCloudflarePagesPreviewFromBody(
  body: string,
): HostingPreviewRead<CloudflarePagesPreview> {
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

  const byIdentity = new Map<string, CloudflarePagesPreview>();
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

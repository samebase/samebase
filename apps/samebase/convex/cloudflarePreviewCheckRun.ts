export type CloudflarePreviewCheckRunInput = {
  id: number;
  name: string;
  status: string;
  conclusion?: string | null;
  detailsUrl?: string;
  htmlUrl?: string;
  appName?: string;
  appSlug?: string;
  outputSummary?: string;
  startedAt?: string;
  completedAt?: string;
};

export type CloudflarePreviewCheckRunMetadata = {
  branchPreviewUrl?: string;
  previewUrl?: string;
  previewStatus?: string;
  previewLogsUrl?: string;
  previewUpdatedAt?: number;
};

type CloudflarePreviewCheckRunCandidate = CloudflarePreviewCheckRunMetadata & {
  id: number;
  startedAt?: number;
  completedAt?: number;
};

function parseGitTimestamp(value: string | undefined): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return undefined;
  }
  return timestamp;
}

function normalizeHttpsUrl(value: string): string | undefined {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:" || parsed.host.length === 0) {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function readHttpsUrl(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const markdownLink = value.match(/\[[^\]]+\]\((https:\/\/[^)\s]+)\)/i);
  if (typeof markdownLink?.[1] === "string") {
    return normalizeHttpsUrl(markdownLink[1]);
  }

  const plainUrl = value.match(/https:\/\/[^\s<>)\]]+/i);
  if (typeof plainUrl?.[0] === "string") {
    return normalizeHttpsUrl(plainUrl[0].replace(/[.,;]+$/, ""));
  }

  return undefined;
}

function readSummaryField(summary: string | undefined, label: string): string | undefined {
  if (typeof summary !== "string") {
    return undefined;
  }

  const labelPrefix = `${label}:`.toLowerCase();
  for (const rawLine of summary.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^[-*]\s+/, "");
    if (!line.toLowerCase().startsWith(labelPrefix)) {
      continue;
    }

    const value = line.slice(labelPrefix.length).trim();
    return value.length > 0 ? value : undefined;
  }

  return undefined;
}

function isCloudflareWorkersAndPagesCheckRun(input: CloudflarePreviewCheckRunInput): boolean {
  const appSlug = input.appSlug?.toLowerCase();
  if (appSlug === "cloudflare-workers-and-pages") {
    return true;
  }

  const appName = input.appName?.toLowerCase();
  if (typeof appName === "string" && appName.includes("cloudflare")) {
    return true;
  }

  return input.name.toLowerCase().startsWith("workers builds:");
}

function readPreviewStatus(input: CloudflarePreviewCheckRunInput): string {
  if (input.status === "queued") {
    return "Build queued";
  }
  if (input.status === "in_progress") {
    return "Build in progress";
  }
  if (input.status !== "completed") {
    return "Build pending";
  }

  switch (input.conclusion) {
    case "success":
      return "Build successful";
    case "failure":
    case "cancelled":
    case "timed_out":
    case "action_required":
    case "stale":
    case "startup_failure":
      return "Build failed";
    case "neutral":
    case "skipped":
      return "Build skipped";
    case undefined:
    case null:
      return "Build completed";
    default:
      return `Build ${input.conclusion.replace(/_/g, " ")}`;
  }
}

function readCandidateTimestamp(candidate: CloudflarePreviewCheckRunCandidate): number {
  return candidate.completedAt ?? candidate.startedAt ?? 0;
}

function isPreferredCloudflarePreviewCandidate(
  candidate: CloudflarePreviewCheckRunCandidate,
  selected: CloudflarePreviewCheckRunCandidate,
): boolean {
  const candidateTimestamp = readCandidateTimestamp(candidate);
  const selectedTimestamp = readCandidateTimestamp(selected);
  if (candidateTimestamp !== selectedTimestamp) {
    return candidateTimestamp > selectedTimestamp;
  }

  return candidate.id > selected.id;
}

function parseCloudflarePreviewCheckRunCandidate(
  input: CloudflarePreviewCheckRunInput,
): CloudflarePreviewCheckRunCandidate | null {
  if (!isCloudflareWorkersAndPagesCheckRun(input)) {
    return null;
  }

  const completedAt = parseGitTimestamp(input.completedAt);
  const startedAt = parseGitTimestamp(input.startedAt);

  return {
    id: input.id,
    branchPreviewUrl: readHttpsUrl(readSummaryField(input.outputSummary, "Preview Alias URL")),
    previewUrl: readHttpsUrl(readSummaryField(input.outputSummary, "Preview URL")),
    previewStatus: readPreviewStatus(input),
    previewLogsUrl: readHttpsUrl(input.detailsUrl) ?? readHttpsUrl(input.htmlUrl),
    previewUpdatedAt: completedAt ?? startedAt,
    completedAt,
    startedAt,
  };
}

export function parseCloudflarePreviewCheckRun(
  input: CloudflarePreviewCheckRunInput,
): CloudflarePreviewCheckRunMetadata | null {
  const candidate = parseCloudflarePreviewCheckRunCandidate(input);
  if (!candidate) {
    return null;
  }

  return {
    branchPreviewUrl: candidate.branchPreviewUrl,
    previewUrl: candidate.previewUrl,
    previewStatus: candidate.previewStatus,
    previewLogsUrl: candidate.previewLogsUrl,
    previewUpdatedAt: candidate.previewUpdatedAt,
  };
}

export function selectCloudflarePreviewCheckRunMetadata(
  checkRuns: CloudflarePreviewCheckRunInput[],
): CloudflarePreviewCheckRunMetadata | null {
  let selected: CloudflarePreviewCheckRunCandidate | null = null;

  for (const checkRun of checkRuns) {
    const candidate = parseCloudflarePreviewCheckRunCandidate(checkRun);
    if (!candidate) {
      continue;
    }

    if (!selected || isPreferredCloudflarePreviewCandidate(candidate, selected)) {
      selected = candidate;
    }
  }

  if (!selected) {
    return null;
  }

  return {
    branchPreviewUrl: selected.branchPreviewUrl,
    previewUrl: selected.previewUrl,
    previewStatus: selected.previewStatus,
    previewLogsUrl: selected.previewLogsUrl,
    previewUpdatedAt: selected.previewUpdatedAt,
  };
}

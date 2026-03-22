export type CloudflarePreviewCommentMetadata = {
  branchPreviewUrl?: string;
  previewUrl?: string;
  previewCommitSha?: string;
  previewStatus?: string;
  previewLogsUrl?: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function normalizeCellText(value: string): string | undefined {
  const normalized = decodeHtmlEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length > 0 ? normalized : undefined;
}

function readHtmlTableCell(body: string, label: string): string | undefined {
  const match = body.match(
    new RegExp(
      `<strong>\\s*${escapeRegExp(label)}\\s*<\\/strong>\\s*<\\/td>\\s*<td>([\\s\\S]*?)<\\/td>`,
      "i",
    ),
  );
  return typeof match?.[1] === "string" ? match[1] : undefined;
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

function readHtmlAnchorHref(body: string, label: string): string | undefined {
  const cell = readHtmlTableCell(body, label);
  if (typeof cell !== "string") {
    return undefined;
  }

  const match = cell.match(/<a [^>]*href=['"]([^'"]+)['"][^>]*>/i);
  if (typeof match?.[1] !== "string") {
    return undefined;
  }

  return normalizeHttpsUrl(match[1]);
}

function readHtmlCodeText(body: string, label: string): string | undefined {
  const cell = readHtmlTableCell(body, label);
  if (typeof cell !== "string") {
    return undefined;
  }

  const match = cell.match(/<code>\s*([^<]+?)\s*<\/code>/i);
  if (typeof match?.[1] !== "string") {
    return undefined;
  }

  const text = normalizeCellText(match[1]);
  return typeof text === "string" && text.length > 0 ? text : undefined;
}

function readMarkdownLinkHref(body: string, label: string): string | undefined {
  const match = body.match(
    new RegExp(`\\[${escapeRegExp(label)}\\]\\(([^)]+)\\)`, "i"),
  );
  if (typeof match?.[1] !== "string") {
    return undefined;
  }

  return normalizeHttpsUrl(match[1]);
}

/**
 * Parse the semi-structured Cloudflare Pages PR comment body that drives
 * dashboard preview-link caching. Returns `null` when the body does not look
 * like the Cloudflare Pages deploy comment; otherwise returns any extracted
 * CloudflarePreviewCommentMetadata fields so callers can preserve cached data
 * on partial parses while still clearing it when no meaningful preview info
 * exists at all.
 */
export function parseCloudflarePreviewComment(
  body: string,
): CloudflarePreviewCommentMetadata | null {
  if (
    !/Cloudflare Pages/i.test(body) &&
    !/<strong>\s*Preview URL:/i.test(body) &&
    !/<strong>\s*Branch Preview URL:/i.test(body)
  ) {
    return null;
  }

  const previewCommitSha = readHtmlCodeText(body, "Latest commit:");
  const previewStatusCell = readHtmlTableCell(body, "Status:");
  const previewStatus =
    typeof previewStatusCell === "string"
      ? normalizeCellText(previewStatusCell)
      : undefined;
  const previewUrl = readHtmlAnchorHref(body, "Preview URL:");
  const branchPreviewUrl = readHtmlAnchorHref(body, "Branch Preview URL:");
  const previewLogsUrl =
    readMarkdownLinkHref(body, "View logs") ??
    readHtmlAnchorHref(body, "View logs:");

  if (
    typeof previewCommitSha !== "string" &&
    typeof previewStatus !== "string" &&
    typeof previewUrl !== "string" &&
    typeof branchPreviewUrl !== "string" &&
    typeof previewLogsUrl !== "string"
  ) {
    return null;
  }

  return {
    branchPreviewUrl,
    previewUrl,
    previewCommitSha,
    previewStatus,
    previewLogsUrl,
  };
}

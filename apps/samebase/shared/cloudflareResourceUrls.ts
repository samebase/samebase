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

function dashboardSegments(url: string): string[] | null {
  const target = cloudflareDashboardTarget(url);
  if (target === null) {
    return null;
  }
  const segments = target.split("/").filter((segment) => segment.length > 0);
  return segments.every((segment) => /^[A-Za-z0-9._-]+$/.test(segment)) ? segments : null;
}

export function parseCloudflareWorkerBuildLogsUrl(
  url: string,
): { accountId: string; buildUuid: string; workerName: string } | null {
  const segments = dashboardSegments(url);
  if (
    !segments ||
    segments[1] !== "workers" ||
    segments[2] !== "services" ||
    segments[3] !== "view" ||
    segments[5] !== "production"
  ) {
    return null;
  }
  if (segments.length === 8 && segments[6] === "builds") {
    return { accountId: segments[0], buildUuid: segments[7], workerName: segments[4] };
  }
  if (segments.length === 10 && segments[6] === "previews" && segments[8] === "builds") {
    return { accountId: segments[0], buildUuid: segments[9], workerName: segments[4] };
  }
  return null;
}

export function parseCloudflareWorkerScriptUrl(
  url: string,
): { accountId: string; workerName: string } | null {
  const segments = dashboardSegments(url);
  return segments?.length === 6 &&
    segments[1] === "workers" &&
    segments[2] === "services" &&
    segments[3] === "view" &&
    segments[5] === "production"
    ? { accountId: segments[0], workerName: segments[4] }
    : null;
}

export function parseCloudflarePagesLogsUrl(
  url: string,
): { accountId: string; projectName: string } | null {
  const segments = dashboardSegments(url);
  return segments?.length === 5 && segments[1] === "pages" && segments[2] === "view"
    ? { accountId: segments[0], projectName: segments[3] }
    : null;
}

export function normalizeCloudflareWorkerPreviewUrl(
  url: string,
  workerName: string,
): { url: string; zone: string } | null {
  try {
    const parsed = new URL(url);
    const workerMarker = `-${workerName.toLowerCase()}.`;
    const markerIndex = parsed.hostname.lastIndexOf(workerMarker);
    return parsed.protocol === "https:" &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.port === "" &&
      parsed.pathname === "/" &&
      parsed.search === "" &&
      parsed.hash === "" &&
      parsed.hostname.endsWith(".workers.dev") &&
      markerIndex >= 0
      ? { url: parsed.origin, zone: parsed.hostname.slice(markerIndex + workerMarker.length) }
      : null;
  } catch {
    return null;
  }
}

/**
The permissions of the organization's Cloudflare CI token: the Worker, its Workers Builds link,
Alchemy's state store in the Secrets Store, and the account read. Cloudflare's
dashboard names them by permission group key and access type; `workers_ci` is Workers Builds
Configuration.
*/
const CLOUDFLARE_CI_TOKEN_PERMISSION_GROUPS = [
  { key: "workers_scripts", type: "edit" },
  { key: "workers_ci", type: "edit" },
  { key: "secrets_store", type: "edit" },
  { key: "account_settings", type: "read" },
] as const;

/**
Cloudflare's token template link: the page that creates a user API token with the CI permissions
preselected for one account and the given token name.
*/
export function buildCloudflareCiApiTokenUrl(args: {
  accountId: string;
  tokenName: string;
}): string {
  const url = new URL("https://dash.cloudflare.com/profile/api-tokens");
  url.searchParams.set(
    "permissionGroupKeys",
    JSON.stringify(CLOUDFLARE_CI_TOKEN_PERMISSION_GROUPS),
  );
  url.searchParams.set("accountId", args.accountId);
  url.searchParams.set("name", args.tokenName);
  return url.toString();
}

export function normalizeCloudflarePagesPreviewUrl(
  url: string,
  projectName: string,
): string | null {
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

import type {
  CloudflareHostingState,
  HostingState,
  NetlifyHostingState,
} from "./hostingState";

type LegacyHostingShape = {
  hosting?: HostingState;
  netlifySiteId?: string;
  netlifySiteName?: string;
  netlifyTeamId?: string;
  netlifyDefaultUrl?: string;
  netlifyProductionUrl?: string;
  netlifyBuildHookId?: string;
};

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

export function resolveNetlifyHostingState(
  value: LegacyHostingShape | null | undefined,
): NetlifyHostingState | null {
  const hosting = value?.hosting;
  if (hosting?.provider === "netlify") {
    return hosting;
  }

  const siteId = value?.netlifySiteId;
  const siteName = value?.netlifySiteName;
  const teamId = value?.netlifyTeamId;
  const buildHookId = value?.netlifyBuildHookId;

  if (
    !hasText(siteId) ||
    !hasText(siteName) ||
    !hasText(teamId) ||
    !hasText(buildHookId)
  ) {
    return null;
  }

  return {
    provider: "netlify",
    siteId,
    siteName,
    teamId,
    defaultUrl: value?.netlifyDefaultUrl,
    productionUrl: value?.netlifyProductionUrl,
    buildHookId,
  };
}

export function resolveNetlifySiteId(
  value: LegacyHostingShape | null | undefined,
): string | undefined {
  const hosting = value?.hosting;
  if (hosting?.provider === "netlify") {
    return hosting.siteId;
  }
  return value?.netlifySiteId;
}

export function resolveCloudflareHostingState(
  value: LegacyHostingShape | null | undefined,
): CloudflareHostingState | null {
  const hosting = value?.hosting;
  if (hosting?.provider === "cloudflare") {
    return hosting;
  }
  return null;
}

export function resolveHostingMainUrl(
  value: LegacyHostingShape | null | undefined,
): string | undefined {
  const hosting = value?.hosting;
  if (hosting?.provider === "netlify") {
    return hosting.productionUrl ?? hosting.defaultUrl;
  }
  if (hosting?.provider === "cloudflare") {
    if (hosting.productionUrl) {
      return hosting.productionUrl;
    }
    if (hosting.subdomain) {
      return `https://${hosting.subdomain}`;
    }
  }
  return value?.netlifyProductionUrl ?? value?.netlifyDefaultUrl;
}

import type { CloudflareHostingState, HostingState } from "./hostingState";

type HostingShape = {
  hosting?: HostingState;
};

export function resolveCloudflareHostingState(
  value: HostingShape | null | undefined,
): CloudflareHostingState | null {
  const hosting = value?.hosting;
  if (hosting?.provider === "cloudflare") {
    return hosting;
  }
  return null;
}

export function resolveHostingMainUrl(
  value: HostingShape | null | undefined,
): string | undefined {
  const hosting = value?.hosting;
  if (hosting?.provider === "cloudflare") {
    if (hosting.productionUrl) {
      return hosting.productionUrl;
    }
    if (hosting.subdomain) {
      return `https://${hosting.subdomain}`;
    }
  }
  return undefined;
}

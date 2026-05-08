import type { CloudflareState } from "./cloudflareState";

type CloudflareShape = {
  cloudflare?: CloudflareState;
};

export function resolveCloudflareState(
  value: CloudflareShape | null | undefined,
): CloudflareState | null {
  if (value?.cloudflare?.provider === "cloudflare") {
    return value.cloudflare;
  }

  return null;
}

export function resolveCloudflareMainUrl(
  value: CloudflareShape | null | undefined,
): string | undefined {
  const cloudflare = resolveCloudflareState(value);
  if (cloudflare) {
    if (cloudflare.productionUrl) {
      return cloudflare.productionUrl;
    }
    if (cloudflare.subdomain) {
      return `https://${cloudflare.subdomain}`;
    }
  }

  return undefined;
}

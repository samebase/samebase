export const MACHINE_CONNECT_ROUTE = "/machines/connect";
export const NOTER_SYNC_PUBLIC_SCRIPT_PATH = "/noter.js";

function tryParseNoterSyncSourceUrl(value: string | null): URL | null {
  if (!value) {
    return null;
  }

  try {
    const sourceUrl = new URL(value.trim());
    const isLoopbackHttp =
      sourceUrl.protocol === "http:" &&
      (sourceUrl.hostname === "localhost" ||
        sourceUrl.hostname === "127.0.0.1" ||
        sourceUrl.hostname === "::1" ||
        sourceUrl.hostname === "[::1]");

    if (sourceUrl.protocol !== "https:" && !isLoopbackHttp) {
      return null;
    }

    if (sourceUrl.pathname !== NOTER_SYNC_PUBLIC_SCRIPT_PATH) {
      return null;
    }

    if (
      sourceUrl.username.length > 0 ||
      sourceUrl.password.length > 0 ||
      sourceUrl.search.length > 0 ||
      sourceUrl.hash.length > 0
    ) {
      return null;
    }

    return sourceUrl;
  } catch {
    return null;
  }
}

export function buildNoterSyncScriptUrl(origin: string): string {
  return new URL(NOTER_SYNC_PUBLIC_SCRIPT_PATH, origin).toString();
}

export function buildPublishedNoterSyncConnectCommand(): string {
  return "npx @noter-md/sync connect";
}

export function buildDirectNoterSyncConnectCommand(scriptUrl: string): string {
  return `curl -fsSL ${scriptUrl} | node --input-type=module - connect`;
}

export function resolveMachineConnectScriptOrigin(
  sourceUrl: string | null,
  fallbackOrigin: string,
): string {
  return tryParseNoterSyncSourceUrl(sourceUrl)?.origin ?? fallbackOrigin;
}

export function readMachineConnectBootstrapSearch(search: string): {
  installationId: string | null;
  openedByCli: boolean;
  sourceUrl: string | null;
} {
  const searchParams = new URLSearchParams(search);
  const sourceUrl = tryParseNoterSyncSourceUrl(searchParams.get("source"));

  return {
    installationId: searchParams.get("installation")?.trim() || null,
    openedByCli: searchParams.has("openedByCli"),
    sourceUrl: sourceUrl?.toString() ?? null,
  };
}

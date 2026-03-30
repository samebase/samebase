export const MACHINE_CONNECT_ROUTE = "/machines/connect";
export const NOTER_SYNC_PUBLIC_SCRIPT_PATH = "/noter.js";

export function buildNoterSyncScriptUrl(origin: string): string {
  return new URL(NOTER_SYNC_PUBLIC_SCRIPT_PATH, origin).toString();
}

export function buildNoterSyncConnectCommand(origin: string): string {
  const scriptUrl = buildNoterSyncScriptUrl(origin);

  return [
    "# default published package",
    "npx @noter-md/sync connect",
    "# direct single-file install for this deploy",
    `curl -fsSL ${scriptUrl} | node --input-type=module - connect`,
  ].join("\n");
}

export function readMachineConnectBootstrapSearch(search: string): {
  installationId: string | null;
  openedByCli: boolean;
  sourceUrl: string | null;
} {
  const searchParams = new URLSearchParams(search);

  return {
    installationId: searchParams.get("installation")?.trim() || null,
    openedByCli: searchParams.get("openedByCli") === "1",
    sourceUrl: searchParams.get("source")?.trim() || null,
  };
}

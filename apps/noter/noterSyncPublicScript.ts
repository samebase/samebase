import { NOTER_SYNC_PUBLIC_SCRIPT_PATH } from "./src/lib/noterSync";

const DEFAULT_NOTER_SYNC_SOURCE_ORIGIN = "https://noter.md";
const NOTER_SYNC_SOURCE_URL_ASSIGNMENT_PATTERN =
  /export const NOTER_SYNC_SOURCE_URL = ['"][^'"]+['"]/;

export function resolveNoterSyncPublicScriptSourceUrl(args?: {
  devOrigin?: string | null;
  pagesUrl?: string | null;
}): string {
  const origin =
    args?.devOrigin?.trim() ||
    args?.pagesUrl?.trim() ||
    DEFAULT_NOTER_SYNC_SOURCE_ORIGIN;
  return new URL(NOTER_SYNC_PUBLIC_SCRIPT_PATH, origin).toString();
}

/**
 * Keep the hosted installer inspectable by stamping the served file with the
 * exact source URL it should point back to when the bootstrap opens Noter.
 */
export function buildNoterSyncPublicScript(args: {
  packageScript: string;
  sourceUrl: string;
}): string {
  const withSourceComment = args.packageScript.replace(
    /^#!\/usr\/bin\/env node\n/,
    `#!/usr/bin/env node\n// source-url: ${args.sourceUrl}\n`,
  );

  return withSourceComment.replace(
    NOTER_SYNC_SOURCE_URL_ASSIGNMENT_PATTERN,
    `export const NOTER_SYNC_SOURCE_URL = '${args.sourceUrl}'`,
  );
}

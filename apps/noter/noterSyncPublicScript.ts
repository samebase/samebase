/**
 * Keep one canonical installer source in `packages/sync/noter.js` and mirror it
 * verbatim into `public/noter.js`. The hosted file and the package entrypoint
 * should stay byte-for-byte identical so users can audit one script shape.
 */
export function buildNoterSyncPublicScript(args: {
  packageScript: string;
}): string {
  return args.packageScript;
}

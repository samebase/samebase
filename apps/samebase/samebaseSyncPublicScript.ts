/**
 * Keep one canonical installer source in `packages/sync/samebase.ts` and mirror it
 * verbatim into `public/samebase.ts`. The hosted file and the package entrypoint
 * should stay byte-for-byte identical so users can audit one script shape.
 */
export function buildSamebaseSyncPublicScript(args: { packageScript: string }): string {
  return args.packageScript;
}

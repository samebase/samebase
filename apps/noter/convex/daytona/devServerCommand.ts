export const DAYTONA_LOCAL_DEV_SCRIPT = "daytona:local";

export type DaytonaDevServerCommand =
  | "pnpm run daytona:local"
  | "pnpm run dev"
  | "pnpm run anon";

export function resolveDaytonaDevServerCommand(args: {
  hasDaytonaLocalScript: boolean;
  hasDevScript: boolean;
  hasAnonScript: boolean;
  isNoterMonorepo: boolean;
  preferDaytonaLocalScript: boolean;
}): DaytonaDevServerCommand | null {
  if (args.hasDaytonaLocalScript && args.preferDaytonaLocalScript) {
    return "pnpm run daytona:local";
  }
  if (args.isNoterMonorepo) {
    if (args.preferDaytonaLocalScript) {
      return null;
    }
    return args.hasDevScript ? "pnpm run dev" : null;
  }
  if (args.hasDevScript) {
    return "pnpm run dev";
  }
  if (args.hasAnonScript) {
    return "pnpm run anon";
  }
  return null;
}

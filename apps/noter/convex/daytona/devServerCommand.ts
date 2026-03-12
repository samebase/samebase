export const DAYTONA_LOCAL_DEV_MAKE_TARGET = "daytona-local";

export type DaytonaDevServerCommand =
  | "make daytona-local"
  | "make run"
  | "pnpm run dev"
  | "make anon";

export function resolveDaytonaDevServerCommand(args: {
  hasDaytonaLocalTarget: boolean;
  hasRunTarget: boolean;
  hasPackageJson: boolean;
  hasAnonTarget: boolean;
  isNoterMonorepo: boolean;
  preferDaytonaLocalTarget: boolean;
}): DaytonaDevServerCommand | null {
  if (args.hasDaytonaLocalTarget && args.preferDaytonaLocalTarget) {
    return "make daytona-local";
  }
  if (args.isNoterMonorepo) {
    if (args.preferDaytonaLocalTarget) {
      return null;
    }
    return args.hasRunTarget ? "make run" : null;
  }
  if (args.hasRunTarget) {
    return "make run";
  }
  if (args.hasPackageJson) {
    return "pnpm run dev";
  }
  if (args.hasAnonTarget) {
    return "make anon";
  }
  return null;
}

export type DaytonaDevServerLaunchStatus =
  | "started"
  | "already_running"
  | "already_starting";

export type DaytonaTmuxSessionState = "missing" | "running" | "dead";

export type DaytonaExistingTmuxLaunchDecision =
  | "reuse_running"
  | "reuse_starting"
  | "replace";

export function decideExistingDaytonaTmuxLaunch(args: {
  portRunning: boolean;
  sessionState: DaytonaTmuxSessionState;
  sessionCreatedAtMs?: number;
  nowMs: number;
  startupGraceMs: number;
}): DaytonaExistingTmuxLaunchDecision {
  if (args.portRunning) {
    return "reuse_running";
  }
  if (args.sessionState !== "running") {
    return "replace";
  }
  if (typeof args.sessionCreatedAtMs !== "number") {
    return "reuse_starting";
  }
  const ageMs = Math.max(0, args.nowMs - args.sessionCreatedAtMs);
  return ageMs >= args.startupGraceMs ? "replace" : "reuse_starting";
}

export function describeDaytonaDevServerLaunchStatus(
  status: DaytonaDevServerLaunchStatus,
): string {
  switch (status) {
    case "already_running":
      return "already running";
    case "already_starting":
      return "still starting";
    case "started":
      return "starting";
  }
}

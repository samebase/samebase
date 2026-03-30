export const CONNECTED_MACHINE_STALE_AFTER_MS = 45_000;
export const MACHINE_REGISTRATION_REQUEST_TTL_MS = 10 * 60 * 1000;

/**
 * The connector can explicitly publish an offline heartbeat, but when the
 * process dies abruptly we still need the UI to age the last online ping out
 * into an offline state.
 */
export function resolveConnectedMachineStatus(args: {
  lastSeenAt: number;
  now: number;
  status: "offline" | "online";
}): "offline" | "online" {
  if (args.status === "offline") {
    return "offline";
  }

  return args.lastSeenAt + CONNECTED_MACHINE_STALE_AFTER_MS >= args.now
    ? "online"
    : "offline";
}

/**
 * Browser approval links should stay approved once accepted, while pending
 * links should age into expired without requiring another backend write.
 */
export function resolveMachineRegistrationState(args: {
  approvedAt: number | undefined;
  expiresAt: number;
  now: number;
}): "approved" | "expired" | "pending" {
  if (typeof args.approvedAt === "number") {
    return "approved";
  }

  return args.expiresAt <= args.now ? "expired" : "pending";
}

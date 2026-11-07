// The one rule of which connectors a client may use now, with no import, so the component's fences
// (`usableConnectors` in policy.ts), the host's view (`usableNow` in src/client/policy.ts), and the
// moderation report (src/client/moderation.ts) apply the same rule and cannot disagree.

/**
 * The names of `requested` that the client may use now: enrolled, one of the host's configured
 * connectors, and given by the policy or granted to the client's app. A connector that leaves the
 * host's configuration stops here, whatever the policy still lists and whatever grant is kept.
 */
export function usableNames(args: {
  requested: readonly string[];
  enrollment: readonly string[];
  policy: readonly string[];
  granted: readonly string[];
  configured: readonly string[];
}): string[] {
  return args.requested.filter(
    (name) =>
      args.enrollment.includes(name) &&
      args.configured.includes(name) &&
      (args.policy.includes(name) || args.granted.includes(name)),
  );
}

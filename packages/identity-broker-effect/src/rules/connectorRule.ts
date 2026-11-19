// The one rule of which connectors a client may use now, with no import.

/**
 * The names of `requested` that the client may use now: enrolled, one of the host's configured
 * connectors, and given by the policy or granted to the client's repository. A connector that
 * leaves the host's configuration stops here, whatever the policy still lists and whatever grant is
 * kept.
 */
export const usableNames = (args: {
  readonly requested: ReadonlyArray<string>;
  readonly enrollment: ReadonlyArray<string>;
  readonly policy: ReadonlyArray<string>;
  readonly granted: ReadonlyArray<string>;
  readonly configured: ReadonlyArray<string>;
}): Array<string> =>
  args.requested.filter(
    (name) =>
      args.enrollment.includes(name) &&
      args.configured.includes(name) &&
      (args.policy.includes(name) || args.granted.includes(name)),
  );

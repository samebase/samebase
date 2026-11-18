import { Option, Schema } from "effect";
import { usableNames } from "../rules/connectorRule.ts";

// The policy contract of a hub (RFC 137 decision 2): the broker defines and enforces it, the hub
// implements it as a function. It runs in the core once per request; the rules receive the
// decision and refuse it when their rows say otherwise.

export const DeploymentType = Schema.Literals(["production", "preview", "development"]);

/** The facts of a client that a hub's policy decides on, from the client's and the tenant's rows. */
export const Registration = Schema.Struct({
  /** GitHub's numeric id of the repository, from the tenant `gh-<id>`. */
  repositoryId: Schema.String,
  /** `owner/name` at registration. */
  repository: Schema.String,
  /** The tenant's recorded owner. */
  ownerId: Schema.String,
  app: Schema.String,
  deploymentType: DeploymentType,
  /** The client's return addresses, sorted and unique. */
  redirectUris: Schema.Array(Schema.String),
  proof: Schema.Literals(["github-actions", "initial-access-token"]),
});
export type Registration = typeof Registration.Type;

/** What a hub's policy decides for one registration, at registration and at each use. */
export const Policy = Schema.Struct({
  /** The connectors this registration may enroll in, and may use now. */
  connectors: Schema.Array(Schema.String),
  /** The API resources this client may authorize, by provider name. */
  resources: Schema.Array(Schema.String),
  /** Evaluated at registration and at each use. */
  paused: Schema.Boolean,
});
export type Policy = typeof Policy.Type;

export type PolicyFunction = (registration: Registration) => Policy;

// An answer with a member the contract does not name is malformed, as `validate` of convex-helpers
// refuses unknown fields by default.
const decodePolicy = Schema.decodeUnknownOption(Policy, { onExcessProperty: "error" });

/**
 * The policy's answer, or null when it threw or answered a malformed value: the request is refused
 * and nothing is written. Nothing is allowed by default.
 */
export function evaluate(policy: PolicyFunction, registration: Registration): Policy | null {
  let answer: unknown;
  try {
    answer = policy(registration);
  } catch (error) {
    console.error(
      `The policy failed: ${error instanceof Error ? error.constructor.name : typeof error}`,
    );
    return null;
  }
  return Option.getOrNull(decodePolicy(answer));
}

/** The decision for one client at one request, in the terms the rules fence on. */
export type Decision = {
  /** The tenant owner the policy decided on. Absent without hub mode. */
  ownerId?: string;
  paused: boolean;
  /** The connectors the client may use now: its enrollment, intersected with the policy's. */
  connectors: string[];
  /** The host's configured connectors, the only ones a grant can open. */
  configured: string[];
};

/** Which exemptions of the hub's administrator cover a client, read with its facts. */
export type Exemption = {
  /** The "every app" row exists. */
  everyApp: boolean;
  /** A row of the client's repository exists, bound to the tenant's recorded owner and the client's. */
  repository: boolean;
};

/**
 * Whether a hub's sign-in page asks before the first hop to a provider: always, unless an exemption
 * that the hub's administrator set covers the client (RFC 137 decision 5). The policy has no say in
 * it. Without hub mode there is no page.
 */
export function pageShown(exemption: Exemption): boolean {
  return !exemption.everyApp && !exemption.repository;
}

/**
 * Decides for a client. In hub mode a client without registration facts (not a repository's, or a
 * tenant without a recorded owner) gives null, as a failed policy does. Without hub mode the host
 * is its own policy: the enrollment, no pause.
 */
export function decide(args: {
  policy: PolicyFunction | undefined;
  registration: Registration | null;
  enrollment: readonly string[];
  /** The host's configured connector names. */
  configured: string[];
}): Decision | null {
  const { enrollment, configured } = args;
  // The one rule (`usableNames`) with no grant: the policy's part, which the rules fence on.
  const policyPart = (allowed: readonly string[]) =>
    usableNames({ requested: enrollment, enrollment, policy: allowed, granted: [], configured });
  if (args.policy === undefined) {
    return { paused: false, connectors: policyPart(enrollment), configured };
  }
  if (args.registration === null) {
    return null;
  }
  const policy = evaluate(args.policy, args.registration);
  if (policy === null) {
    return null;
  }
  return {
    ownerId: args.registration.ownerId,
    paused: policy.paused,
    connectors: policyPart(policy.connectors),
    configured,
  };
}

/**
 * The connectors a client may use now, as the core sees them: its enrollment, of those the
 * decision's policy gives or that the hub's administrator granted its repository (`granted`, read
 * with the client's facts). The rule that moves a sign-in on decides this again with the grants of
 * its own step, so `decision.connectors` stays the policy's part alone.
 */
export function usableNow(
  decision: Decision,
  enrollment: readonly string[],
  granted: readonly string[],
): string[] {
  return usableNames({
    requested: enrollment,
    enrollment,
    policy: decision.connectors,
    granted,
    configured: decision.configured,
  });
}

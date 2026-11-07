import { validate } from "convex-helpers/validators";
import { v, type Infer } from "convex/values";
import { usableNames } from "../component/connectorRule.js";
import type { vRegistration } from "../component/policy.js";
import type { Exemption } from "../component/signInPage.js";

// The policy contract of a hub (RFC 137 decision 2): the broker defines and enforces it, the hub
// implements it as a function. It runs here, in the host's HTTP action, once per request; the
// component's mutations receive the decision and refuse it when their rows say otherwise.

const { array, boolean, object, string } = v;

/** The facts of a client that a hub's policy decides on. */
export type Registration = Infer<typeof vRegistration>;

/** What a hub's policy decides for one registration, at registration and at each use. */
export const vPolicy = object({
  /** The connectors this registration may enroll in, and may use now. */
  connectors: array(string()),
  /** The API resources this client may authorize, by provider name. */
  resources: array(string()),
  /** Evaluated at registration and at each use. */
  paused: boolean(),
});
/**
 * A policy's answer. `Connector` and `Resource` are the names of the hub's connectors and API
 * resources, so `defineIdentityBroker` rejects a name the hub does not configure at compile time.
 */
export type Policy<Connector extends string = string, Resource extends string = string> = Omit<
  Infer<typeof vPolicy>,
  "connectors" | "resources"
> & { connectors: readonly Connector[]; resources: readonly Resource[] };

export type PolicyFunction<Connector extends string = string, Resource extends string = string> = (
  registration: Registration,
) => Policy<Connector, Resource>;

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
  return validate(vPolicy, answer) ? answer : null;
}

/** The decision for one client at one request, in the terms the component's mutations fence on. */
export type Decision = {
  /** The tenant owner the policy decided on. Absent without hub mode. */
  ownerId?: string;
  paused: boolean;
  /** The connectors the client may use now: its enrollment, intersected with the policy's. */
  connectors: string[];
  /** The resource URLs of the providers the policy gives the client now. */
  resources: string[];
  /** The host's configured connectors, the only ones a grant can open. */
  configured: string[];
};

/**
 * Whether a hub's sign-in page asks before the first hop to a provider: always, unless an exemption
 * that the hub's administrator set covers the client, for every app or for the client's app (RFC
 * 137 decision 5). The policy has no say in it. `/authorize` decides the page with it in hub mode,
 * and `/moderation/clients` reports it with it. Without hub mode there is no page.
 */
export function pageShown(exemption: Exemption): boolean {
  return !exemption.everyApp && !exemption.thisApp;
}

/**
 * Decides for a client. In hub mode a client without registration facts (not a repository's, or a
 * tenant without a recorded owner) gives null, as a failed policy does. Without hub mode the host
 * is its own policy: the enrollment, every resource, no pause.
 */
export function decide(args: {
  policy: PolicyFunction | undefined;
  registration: Registration | null;
  enrollment: string[];
  providers: ReadonlyArray<{ name: string; resource: string }>;
  /** The host's configured connector names. */
  configured: string[];
}): Decision | null {
  const { enrollment, providers, configured } = args;
  // The one rule (`usableNames`) with no grant: the policy's part, which the mutations fence on.
  const policyPart = (allowed: readonly string[]) =>
    usableNames({ requested: enrollment, enrollment, policy: allowed, granted: [], configured });
  if (args.policy === undefined) {
    return {
      paused: false,
      // The host is its own policy: the enrollment.
      connectors: policyPart(enrollment),
      resources: providers.map((provider) => provider.resource),
      configured,
    };
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
    resources: providers
      .filter((provider) => policy.resources.includes(provider.name))
      .map((provider) => provider.resource),
    configured,
  };
}

/**
 * The connectors a client may use now, as the host sees them: its enrollment, of those the
 * decision's policy gives or that the hub's administrator granted its app (`granted`, read with the
 * client's facts). The mutation that moves a sign-in on decides this again with the grants of its
 * own transaction (`usableConnectors` in src/component/policy.ts), so `decision.connectors` stays
 * the policy's part alone.
 */
export function usableNow(decision: Decision, enrollment: string[], granted: string[]): string[] {
  return usableNames({
    requested: enrollment,
    enrollment,
    policy: decision.connectors,
    granted,
    configured: decision.configured,
  });
}

/** The decision as a mutation takes it: the fields of `vPolicyDecision`, nothing wider. */
export function policyArg(decision: Decision) {
  return {
    ...(decision.ownerId === undefined ? {} : { ownerId: decision.ownerId }),
    paused: decision.paused,
    connectors: decision.connectors,
    resources: decision.resources,
    configured: decision.configured,
  };
}

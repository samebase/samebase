// The host's policy runs in the core, on facts that these rows hold. The facts go up as a
// `Registration`; the decision comes back down as a `PolicyDecision`, with the owner the policy
// saw, so a step refuses a decision that the rows no longer support.
import { Effect } from "effect";
import type { Doc } from "../store/tables.ts";
import { tenantRow } from "./apps.ts";
import { usableNames } from "./connectorRule.ts";
import type { PolicyDecision } from "./schemas.ts";

/**
 * The facts of `client`, or null for a client that a host registered outside `POST /register`: a
 * tenant that is not a repository's, or one with no recorded owner.
 */
export const registrationOf = (client: Doc<"clients">, app: Doc<"apps">) =>
  Effect.gen(function* () {
    const repositoryId = /^gh-([1-9][0-9]*)$/.exec(app.tenantId)?.[1];
    const tenant = yield* tenantRow(app.tenantId);
    const ownerId = tenant?.doc.ownerId;
    if (repositoryId === undefined || ownerId === undefined) {
      return null;
    }
    return {
      repositoryId,
      repository: client.registeredBy.githubRepository,
      ownerId,
      app: client.app,
      deploymentType: client.deploymentType,
      redirectUris: client.redirectUris,
      proof:
        client.registeredBy.kind === "github"
          ? ("github-actions" as const)
          : ("initial-access-token" as const),
    };
  });

/**
 * Why a decision does not apply to the client: `stale` when the tenant's owner is no longer the one
 * the policy decided on, `paused` when the policy paused the client. Null when it applies.
 */
export const refusalOf = (decision: PolicyDecision, tenantId: string) =>
  Effect.gen(function* () {
    if (
      decision.ownerId !== undefined &&
      (yield* tenantRow(tenantId))?.doc.ownerId !== decision.ownerId
    ) {
      return "stale" as const;
    }
    return decision.paused ? ("paused" as const) : null;
  });

/**
 * The connectors a request may use now: its set, the client's enrollment, the host's configured
 * connectors, and the decision's policy or the grants (`granted`, read by the caller in the step
 * that decides, so a revoked grant stops the next step).
 */
export const usableConnectors = (
  request: { readonly connectors: ReadonlyArray<string> },
  client: { readonly connectors: ReadonlyArray<string> },
  decision: PolicyDecision,
  granted: ReadonlyArray<string>,
) =>
  usableNames({
    requested: request.connectors,
    enrollment: client.connectors,
    policy: decision.connectors,
    granted,
    configured: decision.configured,
  });

import { ConvexError, v, type Infer } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type DatabaseReader, type MutationCtx } from "../_generated/server";
import { isRecord } from "../jsonUtils";
import { createActionConfirmationTokenValue, sha256Hex } from "../mcp/tokens";
import { requireRepositoryForUser } from "../organizationAccess";
import {
  INFRASTRUCTURE_OPERATION_ACTIVE_MESSAGE,
  readRepositoryInfrastructureState,
} from "./infrastructureOperation";
import { getConvexCodeLocationPath, readConvexCodeLocation } from "../../shared/convexCodeLocation";
import {
  vConfirmationSurface,
  type ConfirmationSurface,
  type ConfirmedResource,
} from "./confirmationModel";
import {
  vActionConfirmation,
  vActionConfirmationRequest,
  type ActionConfirmation,
} from "./contracts/actionConfirmation";
import { cloudflareConnectWorkerContract } from "./contracts/cloudflareAttachments";
import { cloudflareRotateConvexDeployKeysForWorkersBuildsContract } from "./contracts/cloudflareRotateConvexDeployKeysForWorkersBuilds";
import { detachResourceContract, vDetachableResource } from "./contracts/detachResource";
import { retryInfrastructureProvisioningContract } from "./contracts/retryInfrastructureProvisioning";
import { vRepositoryProvisioningMode } from "./provisioningModel";

/*
The one confirmation check of the four gated actions (rfcs/125), shared by the dashboard and MCP.
The first call of a gated action gets a challenge and performs nothing. The second call sends the
token and the exact acknowledgement sentence; the check accepts them only for the same user,
action, and normalized request, consumes the token, and writes the audit row.
*/

const { id, literal, object, optional, string, union } = v;

const ACTION_CONFIRMATION_TTL_MS = 10 * 60 * 1000;
/** What a rejected caller does next, in the words of its surface. */
const START_AGAIN = {
  dashboard: "Nothing changed. Start the action again to get a new confirmation.",
  mcp: "Nothing changed. Call the action again without confirmation to get a new confirmation request.",
} as const satisfies Record<ConfirmationSurface["kind"], string>;

/**
A gated request after the server resolved names and defaults: the repository, the Worker tag, the
root directory, the Workers Builds token, and the Convex project (null when none is attached) with
its live slug (null when Convex cannot be read). A token approves exactly this request; the slug
only words the sentence and is not part of the digest.
*/
export const vConfirmedActionRequest = union(
  object({
    action: literal(cloudflareConnectWorkerContract.id),
    repositoryId: id("repositories"),
    workerName: string(),
    workerTag: string(),
    rootDirectory: string(),
    buildTokenUuid: string(),
    convexProjectId: union(id("repositoryConvexProjects"), v.null()),
    convexProjectSlug: union(string(), v.null()),
  }),
  object({
    action: literal(cloudflareRotateConvexDeployKeysForWorkersBuildsContract.id),
    repositoryId: id("repositories"),
    workerId: id("repositoryCloudflareWorkers"),
    convexProjectId: id("repositoryConvexProjects"),
    convexProjectSlug: union(string(), v.null()),
  }),
  object({
    action: literal(retryInfrastructureProvisioningContract.id),
    repositoryId: id("repositories"),
    /** Read from the plan before the confirmation, so the sentence names the retry that runs. */
    provisioning: vRepositoryProvisioningMode,
  }),
  object({
    action: literal(detachResourceContract.id),
    repositoryId: id("repositories"),
    resource: vDetachableResource,
  }),
);
export type ConfirmedActionRequest = Infer<typeof vConfirmedActionRequest>;

/** `confirmed` means that the token was consumed and the caller performs the request now. */
export const vActionConfirmationCheck = union(
  vActionConfirmationRequest,
  object({ state: literal("confirmed") }),
);
type ActionConfirmationCheck = Infer<typeof vActionConfirmationCheck>;

type ConnectedRepository = Extract<Doc<"repositories">, { state: "connected" }>;

type ConfirmationSubject = {
  organizationId: Id<"organizations">;
  resource: ConfirmedResource;
  effect: string;
  /** The approved change, which the acknowledgement names after its surface prefix. */
  approval: string;
};

/**
JSON with sorted object keys, so equal requests have equal digests in any key order. The live Convex
slug only names the project in the sentence, which the token row stores; the project ID binds the
target. Leaving the slug out keeps a failed Convex read on the second call from rejecting an
unchanged request.
*/
function toCanonicalJson(request: ConfirmedActionRequest): string {
  return JSON.stringify(request, (key, value: unknown) => {
    if (key === "convexProjectSlug") {
      return undefined;
    }
    return isRecord(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((name) => [name, value[name]]),
        )
      : value;
  });
}

function isSameSurface(issued: ConfirmationSurface, current: ConfirmationSurface): boolean {
  switch (issued.kind) {
    case "dashboard":
      return current.kind === "dashboard";
    case "mcp":
      return (
        current.kind === "mcp" &&
        current.grantId === issued.grantId &&
        current.clientId === issued.clientId
      );
    default:
      issued satisfies never;
      throw new Error("Unsupported confirmation surface.");
  }
}

async function requireAttachedWorker(
  db: DatabaseReader,
  repository: ConnectedRepository,
  workerId: Id<"repositoryCloudflareWorkers">,
) {
  const worker = await db.get(workerId);
  if (
    !worker ||
    worker.repositoryId !== repository._id ||
    worker.organizationId !== repository.organizationId
  ) {
    throw new ConvexError("The Cloudflare Worker is not attached to this repository.");
  }
  return worker;
}

async function requireAttachedConvexProject(
  db: DatabaseReader,
  repository: ConnectedRepository,
  convexProjectId: Id<"repositoryConvexProjects">,
) {
  const project = await db.get(convexProjectId);
  if (
    !project ||
    project.repositoryId !== repository._id ||
    project.organizationId !== repository.organizationId
  ) {
    throw new ConvexError("The Convex project is not attached to this repository.");
  }
  return {
    project,
    codeLocation: getConvexCodeLocationPath(readConvexCodeLocation(project)),
  };
}

/**
Several attached projects can share a code location, so a sentence names the project by its slug
and its code location. Without a readable slug it names the code location only.
*/
function describeConvexProject(codeLocation: string, convexProjectSlug: string | null): string {
  return convexProjectSlug
    ? `the Convex project ${convexProjectSlug} at ${codeLocation}`
    : `the Convex project at ${codeLocation}`;
}

/**
Connect and rotation claim the provider-write lock only after the token is consumed, and detach
checks the lock again after the check, so a repository with a running provider operation fails here
first: it gets no challenge, and a token stays unused.
*/
async function requireNoProviderOperation(db: DatabaseReader, repository: ConnectedRepository) {
  const infrastructure = await readRepositoryInfrastructureState({ db }, repository);
  if (infrastructure.operation.kind !== "none") {
    throw new ConvexError(INFRASTRUCTURE_OPERATION_ACTIVE_MESSAGE);
  }
}

function toWorkerResource(worker: Doc<"repositoryCloudflareWorkers">): ConfirmedResource {
  return {
    kind: "cloudflare_worker",
    accountId: worker.accountId,
    workerTag: worker.workerTag,
    workerName: worker.workerName,
  };
}

/**
Re-reads the repository and the resource that the request names, from local rows only, so the
dashboard mutation can run the check. A Convex project is named by its code location and by the
slug that the calling action read from Convex; the detach mutation cannot read Convex, so a detached
project is named by its code location only.
*/
async function readConfirmationSubject(
  db: DatabaseReader,
  args: { userId: Id<"users">; request: ConfirmedActionRequest },
): Promise<ConfirmationSubject> {
  const { request } = args;
  const repository = await requireRepositoryForUser(db, {
    userId: args.userId,
    repositoryId: request.repositoryId,
  });
  if (repository.state !== "connected") {
    throw new ConvexError("This repository has no connected GitHub repository yet.");
  }
  const organization = await db.get(repository.organizationId);
  if (!organization) {
    throw new Error("Repository organization not found.");
  }
  const repositoryName = `${organization.githubOwnerLogin}/${repository.githubRepositoryName}`;
  const { organizationId } = repository;

  switch (request.action) {
    case "connect_cloudflare_worker": {
      const accountId = repository.cloudflareAccountId;
      if (!accountId) {
        throw new ConvexError("Connect Cloudflare in Providers before adding a Worker.");
      }
      await requireNoProviderOperation(db, repository);
      const convexProject =
        request.convexProjectId === null
          ? null
          : await requireAttachedConvexProject(db, repository, request.convexProjectId);
      const { rootDirectory, workerName } = request;
      const projectText =
        convexProject &&
        describeConvexProject(convexProject.codeLocation, request.convexProjectSlug);
      return {
        organizationId,
        resource: {
          kind: "cloudflare_worker",
          accountId,
          workerTag: request.workerTag,
          workerName,
        },
        effect: `Samebase attaches the Worker ${workerName} to ${repositoryName}, sets its Workers Builds settings to build ${repositoryName} from root directory ${rootDirectory}${projectText ? `, installs the deploy key of ${projectText}` : ""}, and starts a production build. That build replaces what the Worker serves now.`,
        approval: `replacing the live deployment of Worker ${workerName} with a build of ${repositoryName} from root directory ${rootDirectory}${projectText ? ` that deploys ${projectText}` : ""}`,
      };
    }
    case "rotate_convex_deploy_keys": {
      await requireNoProviderOperation(db, repository);
      const worker = await requireAttachedWorker(db, repository, request.workerId);
      const { codeLocation } = await requireAttachedConvexProject(
        db,
        repository,
        request.convexProjectId,
      );
      const projectText = describeConvexProject(codeLocation, request.convexProjectSlug);
      return {
        organizationId,
        resource: toWorkerResource(worker),
        effect: `Samebase revokes the Convex deploy keys that it recorded for the Worker ${worker.workerName}, creates new keys on ${projectText}, writes them to the Worker's Workers Builds settings, and starts a production build. If a step fails, builds of the Worker cannot deploy Convex until the keys are replaced again.`,
        approval: `revoking and replacing the Convex deploy keys of Worker ${worker.workerName} with new keys of ${projectText}`,
      };
    }
    case "retry_provider_setup":
      switch (request.provisioning) {
        case "samebase":
          return {
            organizationId,
            resource: { kind: "repository", githubRepositoryFullName: repositoryName },
            effect: `Samebase starts a new provider setup run for ${repositoryName}. It creates missing Convex and Cloudflare resources. When the setup includes Cloudflare, it rewrites the Workers Builds settings of the Worker, revokes and replaces the Convex deploy keys that it recorded, and starts a production build.`,
            approval: `a new provider setup run for ${repositoryName}, which can rewrite its Workers Builds settings and revoke and replace its Convex deploy keys`,
          };
        case "repository_actions":
          return {
            organizationId,
            resource: { kind: "repository", githubRepositoryFullName: repositoryName },
            effect: `Samebase starts a new setup run for ${repositoryName}. It copies the organization's CI credentials into the repository's GitHub Actions secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, and CONVEX_ACCESS_TOKEN and its variable CONVEX_TEAM_ID, replacing their values. If the starter is not seeded yet, it seeds the starter, which starts a deployment in the repository's GitHub Actions. Then it syncs the default branch tree.`,
            approval: `a new setup run for ${repositoryName}, which replaces its GitHub Actions secrets and variable with the organization's CI credentials`,
          };
        default:
          request.provisioning satisfies never;
          throw new Error("Unknown provisioning mode.");
      }
    case "detach_resource": {
      await requireNoProviderOperation(db, repository);
      if (request.resource.kind === "cloudflare_worker") {
        const worker = await requireAttachedWorker(db, repository, request.resource.workerId);
        return {
          organizationId,
          resource: toWorkerResource(worker),
          effect: `Samebase removes the Worker ${worker.workerName} from ${repositoryName}. The Worker keeps running in Cloudflare, and Samebase changes no Cloudflare setting or key.`,
          approval: `removing Worker ${worker.workerName} from ${repositoryName} in Samebase`,
        };
      }
      const { codeLocation, project } = await requireAttachedConvexProject(
        db,
        repository,
        request.resource.convexProjectId,
      );
      return {
        organizationId,
        resource: {
          kind: "convex_project",
          teamId: project.teamId,
          projectId: project.projectId,
          codeLocation,
        },
        effect: `Samebase removes the Convex project at ${codeLocation} from ${repositoryName}. The project keeps running in Convex, and Samebase changes no Convex setting or key.`,
        approval: `removing the Convex project at ${codeLocation} from ${repositoryName} in Samebase`,
      };
    }
    default:
      request satisfies never;
      throw new Error("Unsupported confirmed action.");
  }
}

/**
Without `confirmation`, stores a token hash bound to the user, the surface, the action, and the
digest of the normalized request, and returns the challenge; the caller performs nothing. With
`confirmation`, it requires that token, unused and unexpired, issued to this user on this surface
for this action and an identical request, plus the exact acknowledgement. It then consumes the token and writes the audit row in the
same transaction, and the caller performs the request.
*/
export async function checkActionConfirmation(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    surface: ConfirmationSurface;
    request: ConfirmedActionRequest;
    confirmation: ActionConfirmation | undefined;
  },
): Promise<ActionConfirmationCheck> {
  const subject = await readConfirmationSubject(ctx.db, args);
  const requestDigest = await sha256Hex(toCanonicalJson(args.request));
  const now = Date.now();

  if (!args.confirmation) {
    const token = createActionConfirmationTokenValue();
    const expiresAt = now + ACTION_CONFIRMATION_TTL_MS;
    // A person ticks the dashboard sentence; an agent states the user's approval over MCP.
    const acknowledgement =
      args.surface.kind === "dashboard"
        ? `I approve ${subject.approval}`
        : `I confirm that the user approved ${subject.approval}`;
    const tokenId = await ctx.db.insert("actionConfirmationTokens", {
      tokenHash: await sha256Hex(token),
      userId: args.userId,
      surface: args.surface,
      action: args.request.action,
      requestDigest,
      effect: subject.effect,
      acknowledgement,
      createdAt: now,
      expiresAt,
    });
    await ctx.scheduler.runAfter(
      ACTION_CONFIRMATION_TTL_MS,
      internal.repository.confirmations.deleteToken,
      { tokenId },
    );
    return {
      state: "needs_confirmation",
      effect: subject.effect,
      acknowledgement,
      token,
      expiresAt,
    };
  }

  const tokenHash = await sha256Hex(args.confirmation.token);
  const issued = await ctx.db
    .query("actionConfirmationTokens")
    .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  const startAgain = START_AGAIN[args.surface.kind];
  if (!issued || issued.userId !== args.userId) {
    throw new ConvexError(`This confirmation token is not valid. ${startAgain}`);
  }
  // The sentence names its surface, and the audit row records the confirming surface, so a token
  // works only where it was issued: the dashboard, or the same MCP grant and client.
  if (!isSameSurface(issued.surface, args.surface)) {
    throw new ConvexError(`This confirmation token was issued to another client. ${startAgain}`);
  }
  if (issued.consumedAt) {
    throw new ConvexError(`This confirmation token was already used. ${startAgain}`);
  }
  if (issued.expiresAt <= now) {
    throw new ConvexError(`This confirmation token expired. ${startAgain}`);
  }
  if (issued.action !== args.request.action) {
    throw new ConvexError(`This confirmation token belongs to another action. ${startAgain}`);
  }
  if (issued.requestDigest !== requestDigest) {
    throw new ConvexError(
      args.surface.kind === "dashboard"
        ? `The request changed after it was approved. ${startAgain}`
        : "The arguments differ from the request that the user approved, so nothing changed. Send the approved arguments, or call again without confirmation to get a new confirmation request.",
    );
  }
  if (args.confirmation.acknowledgement.trim() !== issued.acknowledgement) {
    throw new ConvexError(
      `The acknowledgement does not match, so nothing changed. Send exactly: ${issued.acknowledgement}`,
    );
  }

  await ctx.db.patch(issued._id, { consumedAt: now });
  await ctx.db.insert("audit_confirmedActions_events", {
    userId: args.userId,
    organizationId: subject.organizationId,
    repositoryId: args.request.repositoryId,
    action: args.request.action,
    resource: subject.resource,
    requestDigest,
    effect: issued.effect,
    acknowledgement: issued.acknowledgement,
    surface: args.surface,
    issuedAt: issued.createdAt,
    confirmedAt: now,
  });
  return { state: "confirmed" };
}

/** The check for gated actions, which cannot write the database themselves. */
export const check = internalMutation({
  args: {
    userId: id("users"),
    surface: vConfirmationSurface,
    request: vConfirmedActionRequest,
    confirmation: optional(vActionConfirmation),
  },
  returns: vActionConfirmationCheck,
  handler: async (ctx, args): Promise<ActionConfirmationCheck> =>
    await checkActionConfirmation(ctx, {
      userId: args.userId,
      surface: args.surface,
      request: args.request,
      confirmation: args.confirmation,
    }),
});

/** Scheduled at a token's expiry. A used or unused token is no longer valid then. */
export const deleteToken = internalMutation({
  args: {
    tokenId: id("actionConfirmationTokens"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const token = await ctx.db.get(args.tokenId);
    if (token) {
      await ctx.db.delete(token._id);
    }
    return null;
  },
});

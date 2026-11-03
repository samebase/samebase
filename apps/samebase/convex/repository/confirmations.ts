import { ConvexError } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { DatabaseReader, MutationCtx } from "../_generated/server";
import { requireRepositoryForUser } from "../organizationAccess";
import type {
  ActionConfirmation,
  ActionConfirmationRequest,
  ActionConfirmationSurface,
} from "./contracts/actionConfirmation";

/*
The confirmation check of the retry (rfcs/125), shared by the dashboard and MCP. The first call gets
the effect and the acknowledgement sentence, and performs nothing. The second call must send that
exact sentence, which names the repository.
*/

type ActionConfirmationCheck = ActionConfirmationRequest | { state: "confirmed" };

/** Re-reads the repository that the request names, from local rows only. */
async function readConfirmationSubject(
  db: DatabaseReader,
  args: { userId: Id<"users">; repositoryId: Id<"repositories"> },
): Promise<{ effect: string; approval: string }> {
  const repository = await requireRepositoryForUser(db, args);
  if (repository.state !== "connected") {
    throw new ConvexError("This repository has no connected GitHub repository yet.");
  }
  const organization = await db.get(repository.organizationId);
  if (!organization) {
    throw new Error("Repository organization not found.");
  }
  const repositoryName = `${organization.githubOwnerLogin}/${repository.githubRepositoryName}`;

  return {
    effect: `Samebase starts a new setup run for ${repositoryName}. It writes the credential of the organization's Convex connection into the repository's GitHub Actions secret CONVEX_ACCESS_TOKEN and the Convex team id into its variable CONVEX_TEAM_ID, replacing their values. If the starter is not seeded yet, it seeds the starter, which starts a deployment in the repository's GitHub Actions. Then it syncs the default branch tree.`,
    approval: `a new setup run for ${repositoryName}, which replaces its GitHub Actions secret and variable with the organization's Convex connection credential and team id`,
  };
}

/**
Without `confirmation`, returns the challenge, and the caller performs nothing. With `confirmation`,
it requires the exact acknowledgement for this repository and surface, and the caller performs the
request.
*/
export async function checkActionConfirmation(
  ctx: Pick<MutationCtx, "db">,
  args: {
    userId: Id<"users">;
    repositoryId: Id<"repositories">;
    surface: ActionConfirmationSurface;
    confirmation: ActionConfirmation | undefined;
  },
): Promise<ActionConfirmationCheck> {
  const subject = await readConfirmationSubject(ctx.db, args);
  // A person ticks the dashboard sentence; an agent states the user's approval over MCP.
  const acknowledgement =
    args.surface === "dashboard"
      ? `I approve ${subject.approval}`
      : `I confirm that the user approved ${subject.approval}`;

  if (!args.confirmation) {
    return { state: "needs_confirmation", effect: subject.effect, acknowledgement };
  }
  if (args.confirmation.acknowledgement.trim() !== acknowledgement) {
    throw new ConvexError(
      `The acknowledgement does not match, so nothing changed. Send exactly: ${acknowledgement}`,
    );
  }
  return { state: "confirmed" };
}

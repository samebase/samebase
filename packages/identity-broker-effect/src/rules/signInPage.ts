// The exemptions from the sign-in page that the hub's administrator sets. Read at `/authorize`
// only: a sign-in that passed `/authorize` finishes with that decision.
import { Effect } from "effect";
import { unique } from "../store/Tx.ts";

/** The "every app" row: the one row of its scope. */
const everyAppRow = unique("signInPageExemptions", "by_target", ["every_app"]);

/** The repository row of `ownerId`, by its full key. Rows of other owners are left alone. */
const repositoryRow = (tenantId: string, ownerId: string) =>
  unique("signInPageExemptions", "by_target", ["repository", tenantId, ownerId]);

/**
 * The exemptions of a client of the repository `tenantId`. The repository's row counts only while
 * the tenant's recorded owner and the owner that registered the client are the row's owner.
 */
export const exemptionOf = Effect.fnUntraced(function* (args: {
  readonly tenantId: string | undefined;
  readonly tenantOwnerId: string | undefined;
  readonly clientOwnerId: string;
}) {
  const everyApp = (yield* everyAppRow) !== undefined;
  const repository =
    args.tenantId !== undefined &&
    args.tenantOwnerId === args.clientOwnerId &&
    (yield* repositoryRow(args.tenantId, args.clientOwnerId)) !== undefined;
  return { everyApp, repository };
});

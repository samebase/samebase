// The administrator's rows that the sign-in rules read and that nothing in this package writes
// (design section 7): blocks, connector grants and sign-in page exemptions, plus a tenant's owner
// as a registration from a new owner records it. Tests write them in one step of the Store.
import { Effect } from "effect";
import { Tx, unique } from "../../store/Tx.ts";

/** What a host's test Store gives for seeding: one step over a fresh `Tx`. */
export type Seedable = { readonly withTx: <A>(effect: Effect.Effect<A, never, Tx>) => A };

/** Records `ownerId` as the owner of the repository's tenant, as a newer proof does. */
export const setTenantOwner = (store: Seedable, repositoryId: string, ownerId: string) =>
  store.withTx(
    Effect.gen(function* () {
      const tx = yield* Tx;
      const tenantId = `gh-${repositoryId}`;
      const row = yield* unique("tenants", "by_tenant_id", [tenantId]);
      if (row === undefined) {
        yield* tx.insert("tenants", { tenantId, ownerId });
      } else {
        yield* tx.replace("tenants", row.id, { ...row.doc, ownerId });
      }
    }),
  );

/** Adds (`on`) or removes the grant of `connector` to the repository, bound to `ownerId`. */
export const setGrant = (
  store: Seedable,
  args: { repositoryId: string; ownerId: string; connector: string },
  on: boolean,
) =>
  store.withTx(
    Effect.gen(function* () {
      const tx = yield* Tx;
      const tenantId = `gh-${args.repositoryId}`;
      const row = yield* unique("connectorGrants", "by_tenant_id_and_owner_id_and_connector", [
        tenantId,
        args.ownerId,
        args.connector,
      ]);
      if (on && row === undefined) {
        yield* tx.insert("connectorGrants", {
          tenantId,
          ownerId: args.ownerId,
          connector: args.connector,
          reason: "A trusted team",
        });
      }
      if (!on && row !== undefined) {
        yield* tx.delete("connectorGrants", row.id);
      }
    }),
  );

/** Adds (`on`) or removes an exemption from the sign-in page. */
export const setExemption = (
  store: Seedable,
  target: { scope: "every_app" } | { scope: "repository"; repositoryId: string; ownerId: string },
  on: boolean,
) =>
  store.withTx(
    Effect.gen(function* () {
      const tx = yield* Tx;
      const stored =
        target.scope === "every_app"
          ? { scope: "every_app" as const }
          : {
              scope: "repository" as const,
              tenantId: `gh-${target.repositoryId}`,
              ownerId: target.ownerId,
            };
      const row = yield* unique(
        "signInPageExemptions",
        "by_target",
        stored.scope === "every_app"
          ? ["every_app", undefined, undefined]
          : [stored.scope, stored.tenantId, stored.ownerId],
      );
      if (on && row === undefined) {
        yield* tx.insert("signInPageExemptions", { target: stored, reason: "Trusted team" });
      }
      if (!on && row !== undefined) {
        yield* tx.delete("signInPageExemptions", row.id);
      }
    }),
  );

/** Blocks (`on`) or unblocks a repository or an owner. */
export const setBlock = (
  store: Seedable,
  args: { kind: "repository" | "owner"; githubId: string },
  on: boolean,
) =>
  store.withTx(
    Effect.gen(function* () {
      const tx = yield* Tx;
      const row = yield* unique("blocks", "by_kind_and_github_id", [args.kind, args.githubId]);
      if (on && row === undefined) {
        yield* tx.insert("blocks", {
          kind: args.kind,
          githubId: args.githubId,
          reason: "A test block",
          adminEmail: "admin@example.com",
          at: 0,
        });
      }
      if (!on && row !== undefined) {
        yield* tx.delete("blocks", row.id);
      }
    }),
  );

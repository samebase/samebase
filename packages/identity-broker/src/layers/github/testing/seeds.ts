// The administrator's rows of the GitHub layer that nothing in this package writes yet: stops of
// a repository or an owner, connector grants and sign-in page exemptions, plus a tenant's owner as
// a registration from a new owner records it. Tests write them in one step of the Store. A grant
// or an exemption reaches a card at its next registration, renewal or rewrite; a stop holds from
// its commit.
import { Effect } from "effect";
import type { Tables } from "../../../store/tables.ts";
import { first, type TxShape } from "../../../store/Tx.ts";
import { ownerStop, repositoryStop, tenantIdOf } from "../clients.ts";

/** What a host's test Store gives for seeding: one step over a fresh `Tx`. */
export type Seedable = {
  readonly withTx: <A>(body: (tx: TxShape<Tables>) => Effect.Effect<A>) => A;
};

/** Records `ownerId` as the owner of the repository's tenant, as a newer proof does. */
export const setTenantOwner = (store: Seedable, repositoryId: string, ownerId: string) =>
  store.withTx((tx) =>
    Effect.gen(function* () {
      const tenantId = tenantIdOf(repositoryId);
      const row = yield* first(tx, "tenants", "by_tenant_id", [tenantId]);
      if (row === undefined) {
        yield* tx.insert("tenants", { tenantId, ownerId, ownerProofIssuedAt: 0 });
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
  store.withTx((tx) =>
    Effect.gen(function* () {
      const tenantId = tenantIdOf(args.repositoryId);
      const row = yield* first(tx, "connectorGrants", "by_tenant_id_and_owner_id_and_connector", [
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

/** Adds (`on`) or removes the exemption of a repository from the sign-in page, for `ownerId`. */
export const setExemption = (
  store: Seedable,
  args: { repositoryId: string; ownerId: string },
  on: boolean,
) =>
  store.withTx((tx) =>
    Effect.gen(function* () {
      const tenantId = tenantIdOf(args.repositoryId);
      const row = yield* first(tx, "signInPageExemptions", "by_tenant_id_and_owner_id", [
        tenantId,
        args.ownerId,
      ]);
      if (on && row === undefined) {
        yield* tx.insert("signInPageExemptions", {
          tenantId,
          ownerId: args.ownerId,
          reason: "Trusted team",
        });
      }
      if (!on && row !== undefined) {
        yield* tx.delete("signInPageExemptions", row.id);
      }
    }),
  );

/** Stops (`on`) or lets go a repository or an owner: one row of `stops` with the layer's key. */
export const setBlock = (
  store: Seedable,
  args: { kind: "repository" | "owner"; githubId: string },
  on: boolean,
) =>
  store.withTx((tx) =>
    Effect.gen(function* () {
      const key =
        args.kind === "repository" ? repositoryStop(args.githubId) : ownerStop(args.githubId);
      const row = yield* first(tx, "stops", "by_key", [key]);
      if (on && row === undefined) {
        yield* tx.insert("stops", { key, at: 0 });
      }
      if (!on && row !== undefined) {
        yield* tx.delete("stops", row.id);
      }
    }),
  );

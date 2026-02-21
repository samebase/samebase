import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { isAdminUser } from "../users";

type ProdReadAccessArgs = {
  requesterUserId: Id<"users">;
  scope: "vault" | "global";
  vaultId?: Id<"vaults">;
};

type ProdReadAccessContext = {
  user: Doc<"users">;
  vault?: Doc<"vaults">;
};

export function hashText(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return Math.abs(hash >>> 0).toString(16);
}

export async function assertProdReadAccess(
  ctx: Pick<MutationCtx, "db">,
  args: ProdReadAccessArgs,
): Promise<ProdReadAccessContext> {
  const user = await ctx.db.get(args.requesterUserId);
  if (!user || !isAdminUser(user.githubUsername)) {
    throw new Error("Only admin users can request production reads");
  }

  if (args.scope === "vault") {
    if (!args.vaultId) {
      throw new Error("vaultId is required for vault-scoped production reads");
    }
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== args.requesterUserId) {
      throw new Error("Vault not found");
    }
    return { user, vault };
  }

  return { user };
}

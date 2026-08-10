import { Infer, v } from "convex/values";

import { vAccountPresentation } from "./accountPresentation";

export const DELETED_SAMEBASE_ACCOUNT_LABEL = "Deleted Samebase account";

export const vUserReferencePresentation = v.union(
  vAccountPresentation,
  v.object({
    kind: v.literal("deleted"),
    label: v.literal(DELETED_SAMEBASE_ACCOUNT_LABEL),
  }),
);

export type UserReferencePresentation = Infer<typeof vUserReferencePresentation>;

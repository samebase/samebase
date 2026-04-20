import { defineSchema, defineTable } from "convex/server";
import {
  oauthStateRowValidator,
  providerConnectionRowValidator,
} from "./providerConnections.js";

export default defineSchema({
  providerConnections: defineTable(providerConnectionRowValidator)
    .index("by_user", ["userId"])
    .index("by_user_kind", ["userId", "kind"])
    .index("by_kind_method", ["kind", "auth.method"]),

  oauthStates: defineTable(oauthStateRowValidator)
    .index("by_state", ["state"])
    .index("by_user", ["userId"]),
});

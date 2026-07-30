import { definePlugin } from "@oxlint/plugins";
import { noHandWrittenTypePredicate } from "./rules/no-hand-written-type-predicate.ts";
import { noIosSmallTextEntryControl } from "./rules/no-ios-small-text-entry-control.ts";
import { noRawPublicConvexFunctionBuilders } from "./rules/no-raw-public-convex-function-builders.ts";

export default definePlugin({
  meta: { name: "samebase" },
  rules: {
    "no-hand-written-type-predicate": noHandWrittenTypePredicate,
    "no-ios-small-text-entry-control": noIosSmallTextEntryControl,
    "no-raw-public-convex-function-builders": noRawPublicConvexFunctionBuilders,
  },
});

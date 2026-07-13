import { noHandWrittenTypePredicate } from "./rules/no-hand-written-type-predicate.js";
import { noIosSmallTextEntryControl } from "./rules/no-ios-small-text-entry-control.js";
import { noRawPublicConvexFunctionBuilders } from "./rules/no-raw-public-convex-function-builders.js";

export default {
  meta: { name: "samebase" },
  rules: {
    "no-hand-written-type-predicate": noHandWrittenTypePredicate,
    "no-ios-small-text-entry-control": noIosSmallTextEntryControl,
    "no-raw-public-convex-function-builders": noRawPublicConvexFunctionBuilders,
  },
};

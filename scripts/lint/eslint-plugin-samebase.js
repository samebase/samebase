import { noHandWrittenTypePredicate } from "./rules/no-hand-written-type-predicate.js";
import { noIosSmallTextEntryControl } from "./rules/no-ios-small-text-entry-control.js";
import { noPassThroughFunctionDeclaration } from "./rules/no-pass-through-function-declaration.js";
import { noRawPublicConvexFunctionBuilders } from "./rules/no-raw-public-convex-function-builders.js";

export default {
  meta: { name: "samebase" },
  rules: {
    "no-hand-written-type-predicate": noHandWrittenTypePredicate,
    "no-ios-small-text-entry-control": noIosSmallTextEntryControl,
    "no-pass-through-function-declaration": noPassThroughFunctionDeclaration,
    "no-raw-public-convex-function-builders": noRawPublicConvexFunctionBuilders,
  },
};

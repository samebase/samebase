/**
A hand-written `value is T` or `asserts value is T` annotation is an unchecked
claim. TypeScript trusts it without verifying the body, so it keeps narrowing
to a stale shape when the type evolves ("disconnected type safety" in
docs/code-guardrails.md).
*/
export const noHandWrittenTypePredicate = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow hand-written `value is T` annotations; derive predicates instead",
    },
    schema: [],
    messages: {
      handWritten:
        "Hand-written type predicates are unchecked claims; derive the predicate with guard() from @samebase/dependent, or drop the annotation for a TS-inferred one (docs/code-guardrails.md, Type safety).",
      assertsSignature:
        "Hand-written assertion signatures are unchecked claims guard() cannot derive; keep them rare and carry a next-line disable naming the runtime fact the body checks (docs/code-guardrails.md, Type safety).",
    },
  },
  create(context) {
    return {
      TSTypePredicate(node) {
        context.report({
          node,
          messageId: node.asserts ? "assertsSignature" : "handWritten",
        });
      },
    };
  },
};

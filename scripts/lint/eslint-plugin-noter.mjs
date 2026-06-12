/**
Repo-local lint rules, loaded through `lint.jsPlugins` in vite.config.ts.

no-hand-written-type-predicate: a hand-written `value is T` annotation is an
unchecked claim — TypeScript trusts it without verifying the body, so it keeps
narrowing to a stale shape when the type evolves ("disconnected type safety"
in docs/code-guardrails.md). Derive the predicate with guard() from
@noter-md/dependent, narrow through a validator's own result, or drop the
annotation and let TS infer the predicate. `asserts` signatures are out of
scope: guard() cannot express them, so they stay hand-written and audited.
*/
const noHandWrittenTypePredicate = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow hand-written `value is T` annotations; derive predicates instead",
    },
    schema: [],
    messages: {
      handWritten:
        "Hand-written type predicates are unchecked claims; derive the predicate with guard() from @noter-md/dependent, or drop the annotation for a TS-inferred one (docs/code-guardrails.md, Type safety).",
    },
  },
  create(context) {
    return {
      TSTypePredicate(node) {
        if (node.asserts) return;
        context.report({ node, messageId: "handWritten" });
      },
    };
  },
};

export default {
  meta: { name: "noter" },
  rules: {
    "no-hand-written-type-predicate": noHandWrittenTypePredicate,
  },
};

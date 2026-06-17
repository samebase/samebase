/**
Repo-local lint rules, loaded through `lint.jsPlugins` in vite.config.ts.

no-hand-written-type-predicate: a hand-written `value is T` or
`asserts value is T` annotation is an unchecked claim — TypeScript trusts it
without verifying the body, so it keeps narrowing to a stale shape when the
type evolves ("disconnected type safety" in docs/code-guardrails.md). Derive
the predicate with guard() from @noter-md/dependent, narrow through a
validator's own result, or drop the annotation and let TS infer the predicate.
guard() cannot express `asserts` signatures, so a justified one carries a
next-line disable naming the runtime fact its body checks.
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

const publicConvexFunctionBuilders = new Set(["action", "mutation", "query"]);

function isGeneratedServerModule(moduleName) {
  return moduleName.endsWith("_generated/server") || moduleName.endsWith("_generated/server.js");
}

const noRawPublicConvexFunctionBuilders = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow public Convex function builders from _generated/server; use the app access wrappers",
    },
    schema: [],
    messages: {
      publicBuilder:
        "Import public Convex {{name}} from the app-owned access wrapper instead of _generated/server.",
      namespace:
        "Do not namespace-import _generated/server; import allowed internal/http/type bindings by name and use app-owned wrappers for public Convex builders.",
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (typeof node.source.value !== "string" || !isGeneratedServerModule(node.source.value)) {
          return;
        }

        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportNamespaceSpecifier") {
            context.report({
              node: specifier,
              messageId: "namespace",
            });
            continue;
          }

          if (specifier.type !== "ImportSpecifier") {
            continue;
          }

          const importedName =
            specifier.imported.type === "Identifier"
              ? specifier.imported.name
              : specifier.imported.value;

          if (publicConvexFunctionBuilders.has(importedName)) {
            context.report({
              node: specifier,
              messageId: "publicBuilder",
              data: { name: importedName },
            });
          }
        }
      },
    };
  },
};

export default {
  meta: { name: "noter" },
  rules: {
    "no-hand-written-type-predicate": noHandWrittenTypePredicate,
    "no-raw-public-convex-function-builders": noRawPublicConvexFunctionBuilders,
  },
};

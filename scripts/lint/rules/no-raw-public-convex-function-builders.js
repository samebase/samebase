const publicConvexFunctionBuilders = new Set(["action", "mutation", "query"]);

function isGeneratedServerModule(moduleName) {
  return moduleName.endsWith("_generated/server") || moduleName.endsWith("_generated/server.js");
}

export const noRawPublicConvexFunctionBuilders = {
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

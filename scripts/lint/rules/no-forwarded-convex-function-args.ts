import { defineRule, type ESTree } from "@oxlint/plugins";

const directConvexFunctionCallNames = new Set(["runAction", "runMutation", "runQuery"]);
const scheduledConvexFunctionCallNames = new Set(["runAfter", "runAt"]);

function getConvexFunctionArgsIndex(node: ESTree.CallExpression): number | null {
  if (
    node.callee.type !== "MemberExpression" ||
    node.callee.computed ||
    node.callee.property.type !== "Identifier"
  ) {
    return null;
  }

  if (directConvexFunctionCallNames.has(node.callee.property.name)) {
    return 1;
  }
  if (scheduledConvexFunctionCallNames.has(node.callee.property.name)) {
    return 2;
  }
  if (
    node.callee.property.name === "start" &&
    node.callee.object.type === "Identifier" &&
    node.callee.object.name === "workflow"
  ) {
    return 2;
  }
  if (
    (node.callee.property.name === "cron" || node.callee.property.name === "interval") &&
    node.callee.object.type === "Identifier" &&
    node.callee.object.name === "crons"
  ) {
    return 3;
  }
  return null;
}

function isExplicitArgumentObject(node: ESTree.CallExpression["arguments"][number]): boolean {
  return (
    node.type === "ObjectExpression" &&
    node.properties.every((property) => property.type === "Property" && property.computed === false)
  );
}

export const noForwardedConvexFunctionArgs = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Require explicit top-level arguments for registered Convex functions",
    },
    schema: [],
    messages: {
      forwarded:
        "Pass registered Convex function arguments as an explicit object literal without top-level spreads. Convex rejects undeclared fields at runtime, but TypeScript accepts structurally wider variables and spreads.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const argsIndex = getConvexFunctionArgsIndex(node);
        if (argsIndex === null) {
          return;
        }

        if (node.arguments.length <= argsIndex) {
          return;
        }

        const args = node.arguments[argsIndex];
        if (isExplicitArgumentObject(args)) {
          return;
        }

        context.report({
          node,
          messageId: "forwarded",
        });
      },
    };
  },
});

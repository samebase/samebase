function isSameParameterForwarding(parameters, callArguments) {
  if (parameters.length === 0 || parameters.length !== callArguments.length) {
    return false;
  }

  return parameters.every((parameter, index) => {
    const callArgument = callArguments[index];
    return (
      parameter.type === "Identifier" &&
      callArgument?.type === "Identifier" &&
      callArgument.name === parameter.name
    );
  });
}

function readReturnedExpression(body) {
  if (body.type !== "BlockStatement") {
    return body;
  }

  if (body.body.length !== 1) {
    return null;
  }

  const [statement] = body.body;
  return statement.type === "ReturnStatement" ? statement.argument : null;
}

function isPassThrough(parameters, body) {
  const returnedExpression = readReturnedExpression(body);
  if (!returnedExpression) {
    return false;
  }

  const returned =
    returnedExpression.type === "AwaitExpression"
      ? returnedExpression.argument
      : returnedExpression;

  return (
    returned.type === "CallExpression" && isSameParameterForwarding(parameters, returned.arguments)
  );
}

function reportPassThrough(context, node, name, parameters, body) {
  if (!isPassThrough(parameters, body)) {
    return;
  }

  context.report({
    node,
    messageId: "passThrough",
    data: { name },
  });
}

export const noPassThroughFunctionDeclaration = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow functions that only forward their parameters to another call",
    },
    schema: [],
    messages: {
      passThrough:
        "{{name}} only forwards its parameters to another call; inline the call or add the missing invariant (docs/code-guardrails.md, All other guardrails).",
    },
  },
  create(context) {
    return {
      FunctionDeclaration(node) {
        if (!node.id) {
          return;
        }

        reportPassThrough(context, node, node.id.name, node.params, node.body);
      },
      VariableDeclaration(node) {
        if (node.kind !== "const") {
          return;
        }

        for (const declaration of node.declarations) {
          if (
            declaration.id.type !== "Identifier" ||
            (declaration.init?.type !== "ArrowFunctionExpression" &&
              declaration.init?.type !== "FunctionExpression")
          ) {
            continue;
          }

          reportPassThrough(
            context,
            declaration,
            declaration.id.name,
            declaration.init.params,
            declaration.init.body,
          );
        }
      },
    };
  },
};

function collectExportedFunctionDeclarations(program) {
  const declarationsByName = new Map();
  const exportedDeclarations = new WeakSet();

  for (const statement of program.body) {
    const declaration =
      statement.type === "FunctionDeclaration"
        ? statement
        : statement.type === "ExportDefaultDeclaration" ||
            statement.type === "ExportNamedDeclaration"
          ? statement.declaration
          : null;

    if (declaration?.type === "FunctionDeclaration" && declaration.id) {
      declarationsByName.set(declaration.id.name, declaration);
    }
  }

  for (const statement of program.body) {
    if (
      statement.type !== "ExportDefaultDeclaration" &&
      statement.type !== "ExportNamedDeclaration"
    ) {
      continue;
    }

    if (statement.declaration?.type === "FunctionDeclaration") {
      exportedDeclarations.add(statement.declaration);
    } else if (statement.declaration?.type === "Identifier") {
      const declaration = declarationsByName.get(statement.declaration.name);
      if (declaration) {
        exportedDeclarations.add(declaration);
      }
    }

    if (statement.type === "ExportNamedDeclaration" && statement.source === null) {
      for (const specifier of statement.specifiers) {
        if (specifier.type === "ExportSpecifier" && specifier.local.type === "Identifier") {
          const declaration = declarationsByName.get(specifier.local.name);
          if (declaration) {
            exportedDeclarations.add(declaration);
          }
        }
      }
    }
  }

  return exportedDeclarations;
}

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

export const noPassThroughFunctionDeclaration = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow local function declarations that only forward their parameters to another call",
    },
    schema: [],
    messages: {
      passThrough:
        "{{name}} only forwards its parameters to another call; inline the call or add the missing invariant (docs/code-guardrails.md, All other guardrails).",
    },
  },
  create(context) {
    let exportedDeclarations = new WeakSet();

    return {
      Program(program) {
        exportedDeclarations = collectExportedFunctionDeclarations(program);
      },
      FunctionDeclaration(node) {
        if (!node.id || exportedDeclarations.has(node) || node.body.body.length !== 1) {
          return;
        }

        const [statement] = node.body.body;
        if (statement.type !== "ReturnStatement" || !statement.argument) {
          return;
        }

        const returned =
          statement.argument.type === "AwaitExpression"
            ? statement.argument.argument
            : statement.argument;
        if (
          returned.type !== "CallExpression" ||
          !isSameParameterForwarding(node.params, returned.arguments)
        ) {
          return;
        }

        context.report({
          node,
          messageId: "passThrough",
          data: { name: node.id.name },
        });
      },
    };
  },
};

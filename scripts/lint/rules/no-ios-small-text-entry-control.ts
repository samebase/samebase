import { defineRule, type ESTree } from "@oxlint/plugins";

const textEntryControlNames = new Set(["input", "select", "textarea", "Input", "Textarea"]);
const textEntryClassAttributeNames = new Set(["className"]);
const nonTextInputTypes = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);
const smallTailwindTextSizeClasses = new Set(["text-xs", "text-sm"]);
const smallFontSizePx = 16;

function getJsxElementName(nameNode: ESTree.JSXElementName): string | null {
  if (nameNode.type === "JSXIdentifier") {
    return nameNode.name;
  }
  if (nameNode.type === "JSXMemberExpression") {
    return getJsxElementName(nameNode.property);
  }
  return null;
}

function getAttributeName(attribute: ESTree.JSXAttribute): string | null {
  if (attribute.name.type !== "JSXIdentifier") {
    return null;
  }
  return attribute.name.name;
}

function getStaticStringValue(node: ESTree.Node | null): string | null {
  if (!node) {
    return null;
  }
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  if (node.type === "JSXExpressionContainer") {
    return getStaticStringValue(node.expression);
  }
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join("");
  }
  return null;
}

function findAttribute(node: ESTree.JSXOpeningElement, name: string): ESTree.JSXAttribute | null {
  for (const attribute of node.attributes) {
    if (attribute.type === "JSXAttribute" && getAttributeName(attribute) === name) {
      return attribute;
    }
  }
  return null;
}

function readInputType(node: ESTree.JSXOpeningElement): string | null {
  const typeAttribute = findAttribute(node, "type");
  if (!typeAttribute) {
    return null;
  }
  return getStaticStringValue(typeAttribute.value)?.toLowerCase() ?? null;
}

function isTextEntryControl(node: ESTree.JSXOpeningElement, elementName: string): boolean {
  if (!textEntryControlNames.has(elementName)) {
    return hasActiveContentEditable(node);
  }
  if (elementName !== "input" && elementName !== "Input") {
    return true;
  }

  const inputType = readInputType(node);
  return inputType === null || !nonTextInputTypes.has(inputType);
}

function hasActiveContentEditable(node: ESTree.JSXOpeningElement): boolean {
  const attribute =
    findAttribute(node, "contentEditable") ?? findAttribute(node, "contenteditable");
  if (!attribute) {
    return false;
  }
  if (!attribute.value) {
    return true;
  }
  if (attribute.value.type === "Literal") {
    return attribute.value.value !== "false";
  }
  if (
    attribute.value.type === "JSXExpressionContainer" &&
    attribute.value.expression.type === "Literal"
  ) {
    return attribute.value.expression.value !== false;
  }
  return true;
}

function collectStaticClassNames(node: ESTree.Node | null, classNames: string[]): void {
  if (!node) {
    return;
  }

  if (node.type === "Literal" && typeof node.value === "string") {
    classNames.push(...node.value.split(/\s+/).filter(Boolean));
    return;
  }

  if (node.type === "JSXExpressionContainer") {
    collectStaticClassNames(node.expression, classNames);
    return;
  }

  if (node.type === "TemplateLiteral") {
    for (const quasi of node.quasis) {
      classNames.push(...(quasi.value.cooked ?? quasi.value.raw).split(/\s+/).filter(Boolean));
    }
    return;
  }

  if (node.type === "CallExpression") {
    for (const argument of node.arguments) {
      collectStaticClassNames(argument, classNames);
    }
    return;
  }

  if (node.type === "ArrayExpression") {
    for (const element of node.elements) {
      collectStaticClassNames(element, classNames);
    }
    return;
  }

  if (node.type === "ConditionalExpression") {
    collectStaticClassNames(node.consequent, classNames);
    collectStaticClassNames(node.alternate, classNames);
    return;
  }

  if (node.type === "LogicalExpression") {
    collectStaticClassNames(node.left, classNames);
    collectStaticClassNames(node.right, classNames);
    return;
  }

  if (node.type === "ObjectExpression") {
    for (const property of node.properties) {
      if (property.type !== "Property") {
        continue;
      }
      if (property.key.type === "Literal" && typeof property.key.value === "string") {
        classNames.push(...property.key.value.split(/\s+/).filter(Boolean));
      }
      if (property.key.type === "TemplateLiteral" && property.key.expressions.length === 0) {
        classNames.push(
          ...(property.key.quasis[0].value.cooked ?? property.key.quasis[0].value.raw)
            .split(/\s+/)
            .filter(Boolean),
        );
      }
    }
  }
}

function stripVariantPrefixes(className: string): string {
  let bracketDepth = 0;
  let lastVariantSeparator = -1;

  for (let index = 0; index < className.length; index += 1) {
    const character = className[index];
    if (character === "[") {
      bracketDepth += 1;
      continue;
    }
    if (character === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }
    if (character === ":" && bracketDepth === 0) {
      const variant = className.slice(lastVariantSeparator + 1, index);
      if (variant === "file" || variant === "placeholder") {
        return className;
      }
      lastVariantSeparator = index;
    }
  }

  return className.slice(lastVariantSeparator + 1);
}

function readCssLengthPx(value: string): number | null {
  const trimmedValue = value.trim();
  const normalizedValue = trimmedValue.startsWith("length:")
    ? trimmedValue.slice("length:".length).trim()
    : trimmedValue;
  const pxMatch = /^(-?\d+(?:\.\d+)?)px$/u.exec(normalizedValue);
  if (pxMatch?.[1]) {
    return Number(pxMatch[1]);
  }

  const remMatch = /^(-?\d+(?:\.\d+)?)rem$/u.exec(normalizedValue);
  if (remMatch?.[1]) {
    return Number(remMatch[1]) * 16;
  }

  return null;
}

function getSmallFontClass(className: string): string | null {
  const baseClassName = stripVariantPrefixes(className);
  const normalizedBaseClassName = baseClassName.startsWith("!")
    ? baseClassName.slice(1)
    : baseClassName;
  if (smallTailwindTextSizeClasses.has(normalizedBaseClassName)) {
    return className;
  }

  const arbitraryTextMatch = /^text-\[(.+)\]$/u.exec(normalizedBaseClassName);
  if (arbitraryTextMatch?.[1]) {
    const arbitraryLengthPx = readCssLengthPx(arbitraryTextMatch[1]);
    if (arbitraryLengthPx !== null && arbitraryLengthPx < smallFontSizePx) {
      return className;
    }
  }

  const arbitraryPropertyMatch = /^\[font-size:(.+)\]$/u.exec(normalizedBaseClassName);
  if (arbitraryPropertyMatch?.[1]) {
    const arbitraryLengthPx = readCssLengthPx(arbitraryPropertyMatch[1]);
    if (arbitraryLengthPx !== null && arbitraryLengthPx < smallFontSizePx) {
      return className;
    }
  }

  return null;
}

function readSmallFontSizeStyleValue(
  node: ESTree.JSXAttributeValue | null | undefined,
): string | null {
  if (!node || node.type !== "JSXExpressionContainer") {
    return null;
  }

  const expression = node.expression;
  if (expression.type !== "ObjectExpression") {
    return null;
  }

  for (const property of expression.properties) {
    if (property.type !== "Property") {
      continue;
    }

    const keyName =
      property.key.type === "Identifier"
        ? property.key.name
        : property.key.type === "Literal"
          ? property.key.value
          : null;

    if (keyName !== "fontSize") {
      continue;
    }

    if (property.value.type === "Literal" && typeof property.value.value === "number") {
      return property.value.value < smallFontSizePx ? String(property.value.value) : null;
    }

    if (property.value.type === "Literal" && typeof property.value.value === "string") {
      const fontSizePx = readCssLengthPx(property.value.value);
      return fontSizePx !== null && fontSizePx < smallFontSizePx ? property.value.value : null;
    }
  }

  return null;
}

export const noIosSmallTextEntryControl = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow sub-16px font sizes on iOS text-entry controls",
    },
    schema: [],
    messages: {
      className:
        "Text-entry controls must render at 16px+ on iOS/iPadOS WebKit; use `text-base` or larger instead of `{{className}}`.",
      style:
        "Text-entry controls must render at 16px+ on iOS/iPadOS WebKit; use a font size of 16px or larger instead of `{{fontSize}}`.",
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const elementName = getJsxElementName(node.name);
        if (!elementName || !isTextEntryControl(node, elementName)) {
          return;
        }
        for (const attribute of node.attributes) {
          if (attribute.type !== "JSXAttribute") {
            continue;
          }

          const attributeName = getAttributeName(attribute);
          if (!attributeName || !textEntryClassAttributeNames.has(attributeName)) {
            continue;
          }

          const classNames: string[] = [];
          collectStaticClassNames(attribute.value, classNames);
          for (const className of classNames) {
            const smallFontClassName = getSmallFontClass(className);
            if (smallFontClassName) {
              context.report({
                node: attribute,
                messageId: "className",
                data: { className: smallFontClassName },
              });
              break;
            }
          }
        }

        const styleAttribute = findAttribute(node, "style");
        const smallFontSizeStyleValue = readSmallFontSizeStyleValue(styleAttribute?.value);
        if (styleAttribute && smallFontSizeStyleValue) {
          context.report({
            node: styleAttribute,
            messageId: "style",
            data: { fontSize: smallFontSizeStyleValue },
          });
        }
      },
    };
  },
});
